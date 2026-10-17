-- Agent de révision : rédaction intégrale (cas pratique, dissertation, commentaire d'article) et correction notée
-- sur 20, à partir des contenus exclusifs (table « passages ») et de la méthode de l'éditeur (table « agent_consignes »).
-- L'appel au modèle se fait dans la fonction Edge « agent-revision », avec la clé API rangée dans les secrets
-- Supabase (ANTHROPIC_API_KEY), jamais dans le site. Les consignes ne figurent pas dans ce dépôt public.

-- ---------------------------------------------------------------------------
-- 1. Réglages (une seule ligne) : ouverture, modèle, quotas, plafond de dépense, tarifs pour le calcul du coût
-- ---------------------------------------------------------------------------

create table public.agent_reglages (
  id boolean primary key default true check (id),
  actif boolean not null default false,
  modele text not null default 'claude-sonnet-5-5' check (char_length(modele) <= 80),
  quota_jour integer not null default 3 check (quota_jour between 0 and 100),
  quota_mois integer not null default 20 check (quota_mois between 0 and 1000),
  plafond_mois_fcfa integer not null default 20000 check (plafond_mois_fcfa >= 0),
  -- Tarifs du modèle en dollars par million de jetons, et cours du dollar en francs CFA
  prix_entree_usd numeric not null default 2 check (prix_entree_usd >= 0),
  prix_sortie_usd numeric not null default 10 check (prix_sortie_usd >= 0),
  prix_cache_usd numeric not null default 0.1 check (prix_cache_usd >= 0),
  taux_fcfa numeric not null default 600 check (taux_fcfa > 0),
  maj_le timestamptz not null default now()
);
insert into public.agent_reglages default values;
alter table public.agent_reglages enable row level security;
create policy "agent_reglages : lecture (comptes connectés)" on public.agent_reglages for select to authenticated using (true);
create policy "agent_reglages : modification (admin)" on public.agent_reglages for update to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
grant select, update on public.agent_reglages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Consignes (méthode de l'éditeur), réservées à l'administrateur ; la fonction Edge les lit avec la clé secrète
-- ---------------------------------------------------------------------------

create table public.agent_consignes (
  cle text primary key check (cle in ('commun', 'cas_pratique', 'dissertation', 'commentaire')),
  texte text not null check (char_length(texte) <= 200000),
  maj_le timestamptz not null default now()
);
alter table public.agent_consignes enable row level security;
create policy "agent_consignes : admin" on public.agent_consignes for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
grant select, insert, update on public.agent_consignes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Échanges : chaque demande et sa réponse (historique de l'abonné, suivi des coûts pour l'administrateur)
-- ---------------------------------------------------------------------------

create table public.agent_echanges (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercice text not null check (exercice in ('cas_pratique', 'dissertation', 'commentaire')),
  mode text not null check (mode in ('redaction', 'correction')),
  matiere text check (char_length(matiere) <= 80),
  sujet text not null check (char_length(sujet) between 10 and 12000),
  copie text check (char_length(copie) <= 40000),
  reponse text,
  note numeric(4, 2) check (note between 0 and 20),
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  modele text,
  jetons_entree integer,
  jetons_sortie integer,
  jetons_cache integer,
  cout_fcfa numeric(10, 2),
  -- « en_cours » dès la demande : compté dans le quota, ce qui empêche de le dépasser par des demandes simultanées
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'erreur')),
  cree_le timestamptz not null default now()
);
create index agent_echanges_user on public.agent_echanges (user_id, cree_le desc);
create index agent_echanges_cree_le on public.agent_echanges (cree_le desc);
alter table public.agent_echanges enable row level security;
create policy "agent_echanges : lecture (les siens, admin)" on public.agent_echanges for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
grant select on public.agent_echanges to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Compteurs de l'abonné (affichés dans l'espace abonnés et vérifiés par la fonction Edge)
-- ---------------------------------------------------------------------------

-- Demandes du jour et du mois à Abidjan (UTC toute l'année) pour un abonné, et dépense totale du mois
create function public.agent_usage(p_user uuid)
returns table(jour integer, mois integer, depense_mois_fcfa numeric)
language sql stable security definer set search_path = '' as $$
  select
    (count(*) filter (where e.user_id = p_user and e.statut <> 'erreur' and e.cree_le >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'))::integer,
    (count(*) filter (where e.user_id = p_user and e.statut <> 'erreur' and e.cree_le >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'))::integer,
    coalesce(sum(e.cout_fcfa) filter (where e.cree_le >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'), 0)
  from public.agent_echanges e
  where e.cree_le >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
$$;
revoke all on function public.agent_usage(uuid) from public, anon, authenticated;
grant execute on function public.agent_usage(uuid) to service_role;

-- Pour l'abonné connecté : ouverture, droit d'accès (formules d'un mois et plus) et demandes restantes
create function public.mon_agent()
returns table(actif boolean, acces boolean, quota_jour integer, quota_mois integer, utilises_jour integer, utilises_mois integer)
language sql stable security definer set search_path = '' as $$
  select r.actif, (public.est_admin() or (public.abonnement_actif() and public.acces_ouvrages() and not public.suspendu())),
         r.quota_jour, r.quota_mois, u.jour, u.mois
  from public.agent_reglages r, public.agent_usage(auth.uid()) u;
$$;
revoke all on function public.mon_agent() from public, anon;
grant execute on function public.mon_agent() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recherche des passages utiles (appelée par la fonction Edge seulement)
-- ---------------------------------------------------------------------------

-- Chaque mot significatif du sujet (racine française) compte ; les pages qui en réunissent le plus passent en tête.
-- Les ouvrages complets ne sont proposés qu'aux formules qui y donnent accès ; la matière choisie est favorisée.
create function public.rechercher_passages(p_texte text, p_ouvrages boolean, p_matiere text default null, p_nombre integer default 8)
returns table(contenu_id bigint, titre text, matiere text, page integer, texte text, rang real)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_requete tsquery;
begin
  select string_agg(quote_literal(m.lexeme), ' | ')::tsquery into v_requete
  from (select distinct t.lexeme from unnest(to_tsvector('french', left(coalesce(p_texte, ''), 8000))) t
        where char_length(t.lexeme) >= 3 limit 80) m;
  if v_requete is null then return; end if;
  return query
    select p.contenu_id, c.titre, c.matiere, p.page, p.texte,
           (ts_rank_cd(p.recherche, v_requete, 1)
             * case when p_matiere is not null and c.matiere ilike '%' || p_matiere || '%' then 1.5 else 1 end)::real as rang
    from public.passages p
    join public.contenus c on c.id = p.contenu_id
    where c.publie and c.publie_le <= now()
      and (p_ouvrages or not public.est_ouvrage(c.matiere))
      and p.recherche @@ v_requete
    order by rang desc
    limit least(greatest(p_nombre, 1), 20);
end $$;
revoke all on function public.rechercher_passages(text, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.rechercher_passages(text, boolean, text, integer) to service_role;
