-- Plan de publication de la page Facebook : une ligne par publication, publiée à l'heure prévue par la fonction
-- facebook (action planif), appelée toutes les cinq minutes par pg_cron.
create table public.facebook_publications (
  id bigint generated always as identity primary key,
  prevue_le timestamptz not null,
  creneau text not null check (creneau in ('matin', 'soir')),
  rubrique text not null,
  concours text[] not null default '{}',
  titre text not null,
  message text not null,
  lien text,
  images text[] not null default '{}',
  statut text not null default 'programmee'
    check (statut in ('brouillon', 'programmee', 'en_cours', 'publiee', 'erreur', 'manquee', 'annulee')),
  fb_id text,
  erreur text,
  publiee_le timestamptz,
  cree_le timestamptz not null default now()
);
create unique index facebook_publications_creneau on public.facebook_publications (prevue_le)
  where statut <> 'annulee';
create index facebook_publications_a_faire on public.facebook_publications (prevue_le) where statut = 'programmee';
alter table public.facebook_publications enable row level security;
revoke all on table public.facebook_publications from anon, authenticated;

-- Lecture par l'administrateur (onglet futur de l'administration)
create policy facebook_publications_admin on public.facebook_publications for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
grant select on table public.facebook_publications to authenticated;
