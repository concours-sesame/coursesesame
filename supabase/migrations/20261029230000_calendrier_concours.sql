-- Calendrier des concours (page calendrier-des-concours/) : les dates sont saisies dans l'administration, chacune avec
-- sa source (communiqué officiel, site de l'INFJ, de l'ENA ou de la fonction publique). La page n'affiche que les
-- lignes publiées, avec leur source.
create table public.calendrier_concours (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  concours text not null check (concours in ('infj', 'greffe', 'penitentiaire', 'eppjej', 'ena', 'autre')),
  intitule text not null check (length(intitule) between 3 and 120),
  etape text not null check (length(etape) between 3 and 80),
  debut date not null,
  fin date check (fin is null or fin >= debut),
  source_nom text not null check (length(source_nom) between 3 and 120),
  source_url text check (source_url is null or source_url ~ '^https://'),
  publie boolean not null default true
);
alter table public.calendrier_concours enable row level security;
create policy "calendrier_concours : tout (admin)" on public.calendrier_concours for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke all on public.calendrier_concours from anon, authenticated;
grant select, insert, update, delete on public.calendrier_concours to authenticated;

create or replace function public.calendrier_publie()
returns table (concours text, intitule text, etape text, debut date, fin date, source_nom text, source_url text)
language sql
stable
security definer
set search_path to ''
as $$
  select c.concours, c.intitule, c.etape, c.debut, c.fin, c.source_nom, c.source_url
  from public.calendrier_concours c
  where c.publie and coalesce(c.fin, c.debut) >= public.aujourdhui() - 60
  order by c.debut, c.concours;
$$;
revoke all on function public.calendrier_publie() from public;
grant execute on function public.calendrier_publie() to anon, authenticated;
