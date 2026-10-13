-- Administration : suspendre, réactiver ou supprimer un abonnement, abonnés en ligne, suivi en direct
--
-- Suspension : l'accès est coupé tout de suite et les jours restants sont gardés. À la réactivation,
-- les périodes encore en cours ou à venir au début de la suspension sont décalées du nombre de jours
-- suspendus : l'abonné retrouve exactement le temps qui lui restait.
-- Suppression : la période en cours et les prolongations à venir sont annulées, paiement compris (activation
-- faite par erreur, paiement remboursé). Elles sont marquées « supprimées » (date et auteur) et ignorées
-- partout, sans être effacées de la base. « Couper l'accès » arrête l'abonnement en gardant le paiement.
-- Présence : chaque contrôle de l'appareil (à l'ouverture de la page, puis chaque minute tant qu'elle est
-- affichée) note l'heure ; l'administration montre les abonnés en ligne (vus depuis moins de 3 minutes).
-- Direct : les tables abonnements, suspensions et profils sont diffusées par Supabase Realtime ; les règles
-- d'accès (RLS) s'appliquent, seul l'administrateur reçoit les changements de tous les comptes.

-- ---------------------------------------------------------------------------
-- 1. Périodes supprimées et suspensions
-- ---------------------------------------------------------------------------

alter table public.abonnements add column if not exists supprime_le timestamptz;
alter table public.abonnements add column if not exists supprime_par uuid references auth.users (id) on delete set null;
comment on column public.abonnements.supprime_le is 'Période supprimée par l''administrateur (activation par erreur, remboursement) : ignorée partout.';
create index if not exists abonnements_supprime_par on public.abonnements (supprime_par);

create table public.suspensions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profils (id) on delete cascade,
  debut date not null,
  fin date,
  cree_le timestamptz not null default now(),
  cree_par uuid references auth.users (id) on delete set null,
  constraint suspensions_periode check (fin is null or debut <= fin)
);
comment on table public.suspensions is 'Suspensions d''abonnement (dates d''Abidjan). En cours tant que « fin » (date de réactivation) est vide.';
create unique index suspensions_une_en_cours on public.suspensions (user_id) where fin is null;
create index suspensions_cree_par on public.suspensions (cree_par);

alter table public.suspensions enable row level security;
revoke all on public.suspensions from anon;
revoke insert, update, delete on public.suspensions from authenticated;
create policy "suspensions : lecture (titulaire ou admin)" on public.suspensions
  for select to authenticated using (user_id = (select auth.uid()) or (select public.est_admin()));

-- Vrai si le compte de l'appelant est suspendu
create function public.suspendu() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.suspensions s where s.user_id = auth.uid() and s.fin is null);
$$;

-- Date de début de la suspension en cours du compte de l'appelant (vide s'il n'est pas suspendu)
create function public.ma_suspension() returns date
language sql stable security definer set search_path = '' as $$
  select s.debut from public.suspensions s where s.user_id = auth.uid() and s.fin is null;
$$;

-- Un compte suspendu n'a plus accès aux contenus, aux fichiers ni aux ouvrages
create or replace function public.abonnement_actif() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.appareil_autorise() and not public.suspendu() and exists (
    select 1 from public.abonnements
    where user_id = auth.uid() and supprime_le is null and public.aujourdhui() between debut and fin);
$$;

create or replace function public.acces_ouvrages() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.appareil_autorise() and not public.suspendu() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin
      and a.fin - a.debut + 1 >= 28));
$$;

create or replace function public.mon_abonnement()
returns table (actif boolean, fin date, deja_abonne boolean)
language sql stable security definer set search_path = '' as $$
  select
    not public.suspendu() and exists (select 1 from public.abonnements a where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin),
    (select max(a.fin) from public.abonnements a where a.user_id = auth.uid() and a.supprime_le is null),
    exists (select 1 from public.abonnements a where a.user_id = auth.uid() and a.supprime_le is null);
$$;

-- ---------------------------------------------------------------------------
-- 2. Fonctions d'administration
-- ---------------------------------------------------------------------------

-- Suspendre : accès coupé dès maintenant, jours restants gardés
create function public.admin_suspendre(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if exists (select 1 from public.suspensions where user_id = p_user and fin is null) then
    raise exception 'Cet abonnement est déjà suspendu';
  end if;
  if not exists (select 1 from public.abonnements where user_id = p_user and supprime_le is null and fin >= public.aujourdhui()) then
    raise exception 'Aucun abonnement en cours ou à venir à suspendre';
  end if;
  insert into public.suspensions (user_id, debut, cree_par) values (p_user, public.aujourdhui(), auth.uid());
end $$;

-- Réactiver : les périodes sont décalées du nombre de jours suspendus. Renvoie la nouvelle date de fin.
create function public.admin_reactiver(p_user uuid) returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_debut date;
  v_jours integer;
  v_fin date;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  select id, debut into v_id, v_debut from public.suspensions where user_id = p_user and fin is null;
  if v_id is null then
    raise exception 'Cet abonnement n''est pas suspendu';
  end if;
  v_jours := public.aujourdhui() - v_debut;
  if v_jours > 0 then
    update public.abonnements
    set fin = fin + v_jours,
        debut = case when debut >= v_debut then debut + v_jours else debut end
    where user_id = p_user and supprime_le is null and fin >= v_debut;
  end if;
  update public.suspensions set fin = public.aujourdhui() where id = v_id;
  select max(fin) into v_fin from public.abonnements where user_id = p_user and supprime_le is null;
  return v_fin;
end $$;

-- Supprimer : une période précise (p_id), ou la période en cours et les prolongations à venir
-- (depuis le début de la suspension si le compte est suspendu). Renvoie le nombre de périodes supprimées.
create function public.admin_supprimer_abonnement(p_user uuid, p_id bigint default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_depuis date;
  v_n integer;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  select coalesce((select s.debut from public.suspensions s where s.user_id = p_user and s.fin is null), public.aujourdhui())
    into v_depuis;
  update public.abonnements
  set supprime_le = now(), supprime_par = auth.uid()
  where user_id = p_user and supprime_le is null
    and (case when p_id is not null then id = p_id else fin >= v_depuis end);
  get diagnostics v_n = row_count;
  -- Plus rien en cours ni à venir : une suspension ouverte n'a plus d'objet
  if not exists (select 1 from public.abonnements a where a.user_id = p_user and a.supprime_le is null and a.fin >= v_depuis) then
    update public.suspensions set fin = greatest(debut, public.aujourdhui()) where user_id = p_user and fin is null;
  end if;
  return v_n;
end $$;

-- Couper l'accès : comme avant, et la suspension éventuelle est close (sinon une réactivation rouvrirait l'accès)
create or replace function public.admin_couper(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  update public.suspensions set fin = greatest(debut, public.aujourdhui()) where user_id = p_user and fin is null;
  update public.abonnements
  set fin = public.aujourdhui() - 1,
      debut = least(debut, public.aujourdhui() - 1),
      note = left(concat_ws(' · ', note, 'Accès coupé le ' || to_char(public.aujourdhui(), 'DD/MM/YYYY')), 300)
  where user_id = p_user and supprime_le is null and fin >= public.aujourdhui();
end $$;

-- Liste des comptes, activation et historique : les périodes supprimées sont ignorées
create or replace function public.admin_liste_abonnes()
returns table (user_id uuid, prenom text, nom text, telephone text, email text, concours text,
               inscrit_le timestamptz, fin date, actif boolean, nb_paiements bigint, total_paye bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select p.id, p.prenom, p.nom, p.telephone, u.email::text, p.concours, p.cree_le,
           max(a.fin),
           coalesce(bool_or(public.aujourdhui() between a.debut and a.fin), false),
           count(a.id),
           coalesce(sum(a.montant), 0)::bigint
    from public.profils p
    join auth.users u on u.id = p.id
    left join public.abonnements a on a.user_id = p.id and a.supprime_le is null
    where not exists (select 1 from public.admins ad where ad.user_id = p.id)
    group by p.id, u.email
    order by p.cree_le desc;
end $$;

create or replace function public.admin_activer(
  p_user uuid, p_mois integer default 1, p_jusqu_au date default null,
  p_montant integer default null, p_moyen text default null, p_note text default null)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_fin_actuelle date;
  v_debut date;
  v_fin date;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profils where id = p_user) then
    raise exception 'Compte introuvable';
  end if;
  select max(fin) into v_fin_actuelle from public.abonnements where user_id = p_user and supprime_le is null;
  v_debut := greatest(public.aujourdhui(), coalesce(v_fin_actuelle + 1, public.aujourdhui()));
  if p_jusqu_au is not null then
    if p_jusqu_au < v_debut then
      raise exception 'La date de fin doit être au plus tôt le %', to_char(v_debut, 'DD/MM/YYYY');
    end if;
    v_fin := p_jusqu_au;
  else
    if p_mois is null or p_mois < 1 or p_mois > 24 then
      raise exception 'Durée invalide (de 1 à 24 mois)';
    end if;
    v_fin := (v_debut + make_interval(months => p_mois))::date - 1;
  end if;
  insert into public.abonnements (user_id, debut, fin, montant, moyen, note, cree_par)
  values (p_user, v_debut, v_fin, p_montant, nullif(btrim(p_moyen), ''), nullif(btrim(p_note), ''), auth.uid());
  return v_fin;
end $$;

create or replace function public.admin_paiements(p_user uuid default null)
returns table (id bigint, user_id uuid, prenom text, nom text, debut date, fin date,
               montant integer, moyen text, note text, cree_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select a.id, a.user_id, p.prenom, p.nom, a.debut, a.fin, a.montant, a.moyen, a.note, a.cree_le
    from public.abonnements a join public.profils p on p.id = a.user_id
    where a.supprime_le is null and (p_user is null or a.user_id = p_user)
    order by a.cree_le desc
    limit 500;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Présence : dernier passage de chaque abonné
-- ---------------------------------------------------------------------------

alter table public.connexions add column if not exists vu_le timestamptz;
comment on column public.connexions.vu_le is 'Dernier contrôle de l''appareil (page de l''espace abonnés ouverte et affichée).';

create or replace function public.verifier_appareil() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  if not exists (select 1 from public.connexions where user_id = auth.uid()) then
    perform public.prendre_appareil();
  end if;
  v_ok := public.appareil_autorise();
  if v_ok and auth.uid() is not null and not public.est_admin() then
    update public.connexions set vu_le = now()
    where id = (select max(c.id) from public.connexions c where c.user_id = auth.uid());
  end if;
  return v_ok;
end $$;

-- Administration : dernier passage, dernière connexion et suspension en cours de chaque compte
create function public.admin_activite()
returns table (user_id uuid, vu_le timestamptz, derniere_connexion timestamptz, suspendu_depuis date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select p.id,
           (select max(c.vu_le) from public.connexions c where c.user_id = p.id),
           (select max(c.cree_le) from public.connexions c where c.user_id = p.id),
           (select s.debut from public.suspensions s where s.user_id = p.id and s.fin is null)
    from public.profils p;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Droits et diffusion en direct
-- ---------------------------------------------------------------------------

revoke execute on function public.suspendu(), public.ma_suspension(), public.admin_suspendre(uuid),
  public.admin_reactiver(uuid), public.admin_supprimer_abonnement(uuid, bigint), public.admin_activite() from public, anon;
grant execute on function public.suspendu(), public.ma_suspension(), public.admin_suspendre(uuid),
  public.admin_reactiver(uuid), public.admin_supprimer_abonnement(uuid, bigint), public.admin_activite() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'abonnements') then
      alter publication supabase_realtime add table public.abonnements;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suspensions') then
      alter publication supabase_realtime add table public.suspensions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profils') then
      alter publication supabase_realtime add table public.profils;
    end if;
  end if;
end $$;
