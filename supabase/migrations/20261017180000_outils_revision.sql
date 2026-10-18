-- Outils de révision de l'espace abonnés : révision espacée des QCM, simulateur de grand oral, tableau de bord.
-- Les questions du grand oral (contenu exclusif) sont versées dans la table depuis la base, jamais dans ce dépôt.

-- ---------------------------------------------------------------------------
-- 1. Date du concours, choisie par l'abonné (compte à rebours et semaine du planning)
-- ---------------------------------------------------------------------------

alter table public.profils add column date_concours date;
grant update (date_concours) on public.profils to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Révision espacée des QCM (méthode des boîtes) : une ligne par abonné et par question travaillée
-- ---------------------------------------------------------------------------

create table public.qcm_progres (
  user_id uuid not null references auth.users (id) on delete cascade,
  contenu_id bigint not null references public.contenus (id) on delete cascade,
  question integer not null check (question between 0 and 999),
  boite smallint not null default 0 check (boite between 0 and 5),
  prochaine date not null default public.aujourdhui(),
  bonnes integer not null default 0 check (bonnes >= 0),
  erreurs integer not null default 0 check (erreurs >= 0),
  maj_le timestamptz not null default now(),
  primary key (user_id, contenu_id, question)
);
alter table public.qcm_progres enable row level security;
create policy "qcm_progres : lecture (titulaire, admin)" on public.qcm_progres for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
create policy "qcm_progres : ajout (titulaire abonné)" on public.qcm_progres for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.abonnement_actif()));
create policy "qcm_progres : modification (titulaire abonné)" on public.qcm_progres for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.abonnement_actif()));
grant select, insert, update on public.qcm_progres to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Questions du grand oral (tirées des séries publiées), lisibles par les abonnés en cours
-- ---------------------------------------------------------------------------

create table public.grand_oral (
  id bigint generated always as identity primary key,
  contenu_id bigint not null references public.contenus (id) on delete cascade,
  page integer not null check (page >= 1),
  numero integer,
  theme text check (char_length(theme) <= 120),
  question text not null check (char_length(question) between 5 and 1000)
);
alter table public.grand_oral enable row level security;
create policy "grand_oral : lecture (abonnés en cours, admin)" on public.grand_oral for select to authenticated
  using ((select public.est_admin()) or ((select public.abonnement_actif())
    and exists (select 1 from public.contenus c where c.id = contenu_id and c.publie and c.publie_le <= now())));
create policy "grand_oral : gestion (admin)" on public.grand_oral for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
grant select, insert, update on public.grand_oral to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Statistiques personnelles de l'abonné connecté (tableau de bord)
-- ---------------------------------------------------------------------------

-- Jours d'activité : ouverture d'un contenu, question de QCM travaillée, demande à l'agent de révision.
-- La série compte les jours d'affilée jusqu'à aujourd'hui (ou hier, si rien n'a encore été fait aujourd'hui).
create function public.mes_statistiques() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_jours date[];
  v_jour date := public.aujourdhui();
  v_serie integer := 0;
begin
  if v_uid is null then return null; end if;
  select coalesce(array_agg(distinct j order by j), '{}') into v_jours from (
    select (l.ouvert_le at time zone 'UTC')::date j from public.lectures l where l.user_id = v_uid and l.ouvert_le > now() - interval '120 days'
    union select (q.maj_le at time zone 'UTC')::date from public.qcm_progres q where q.user_id = v_uid and q.maj_le > now() - interval '120 days'
    union select (e.cree_le at time zone 'UTC')::date from public.agent_echanges e where e.user_id = v_uid and e.statut = 'termine' and e.cree_le > now() - interval '120 days'
  ) a;
  if not (v_jour = any(v_jours)) then v_jour := v_jour - 1; end if;
  while v_jour = any(v_jours) loop
    v_serie := v_serie + 1;
    v_jour := v_jour - 1;
  end loop;
  return jsonb_build_object(
    'jours', to_jsonb(v_jours),
    'serie', v_serie,
    'contenus_lus', (select count(distinct l.contenu_id) from public.lectures l where l.user_id = v_uid),
    'lectures_30j', (select count(*) from public.lectures l where l.user_id = v_uid and l.ouvert_le > now() - interval '30 days'),
    'qcm_bonnes', (select coalesce(sum(q.bonnes), 0) from public.qcm_progres q where q.user_id = v_uid),
    'qcm_erreurs', (select coalesce(sum(q.erreurs), 0) from public.qcm_progres q where q.user_id = v_uid)
  );
end $$;
revoke all on function public.mes_statistiques() from public, anon;
grant execute on function public.mes_statistiques() to authenticated;
