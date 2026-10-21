-- Concours blancs en accès libre (magistrature d'abord) : chaque série comprend l'épreuve de présélection et les cinq
-- épreuves écrites. Tout visiteur du site, même sans compte, lit les sujets et compose (page concours-blancs/, chronomètre
-- et copie gardés dans son navigateur). Le corrigé de chaque épreuve est gardé dans la même table, lisible par
-- l'administrateur seul ; corrige_epreuve_blanche le livre aux abonnés dont la formule en cours a coûté 1 000 F ou plus
-- ou dure au moins une semaine (la journée à 500 F est exclue). Le corrigé de la présélection contient les réponses :
-- il n'est jamais livré aux visiteurs.

create table public.epreuves_blanches (
  id bigint generated always as identity primary key,
  concours text not null default 'magistrature' check (concours in ('magistrature', 'greffe', 'penitentiaire', 'eppjej', 'ena')),
  serie smallint not null check (serie between 1 and 99),
  ordre smallint not null check (ordre between 1 and 9),
  epreuve text not null check (epreuve in ('preselection', 'sog', 'droit_civil', 'droit_commercial', 'droit_penal', 'droit_administratif')),
  titre text not null check (char_length(titre) between 3 and 160),
  nature text not null default '' check (char_length(nature) <= 80),
  duree_minutes integer not null check (duree_minutes between 15 and 600),
  sujet text not null check (char_length(sujet) between 10 and 60000),
  corrige text not null check (char_length(corrige) between 10 and 120000),
  publie boolean not null default false,
  cree_le timestamptz not null default now(),
  unique (concours, serie, ordre)
);
alter table public.epreuves_blanches enable row level security;
create policy "epreuves_blanches : tout (admin)" on public.epreuves_blanches for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke all on public.epreuves_blanches from anon, authenticated;
grant select, insert, update on public.epreuves_blanches to authenticated;

-- Accès aux corrigés : formule en cours de 1 000 F ou plus, ou d'une semaine au moins
create function public.acces_corriges_blancs() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (public.abonnement_actif() and exists (
    select 1 from public.abonnements a
    where a.user_id = auth.uid() and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin
      and (a.montant >= 1000 or a.fin - a.debut + 1 >= 7)));
$$;
revoke all on function public.acces_corriges_blancs() from public, anon;
grant execute on function public.acces_corriges_blancs() to authenticated;

-- Liste publique des épreuves (sans les sujets)
create function public.epreuves_blanches_liste(p_concours text default 'magistrature')
returns table (id bigint, serie smallint, ordre smallint, epreuve text, titre text, nature text, duree_minutes integer)
language sql stable security definer set search_path = '' as $$
  select e.id, e.serie, e.ordre, e.epreuve, e.titre, e.nature, e.duree_minutes
  from public.epreuves_blanches e
  where e.publie and e.concours = p_concours
  order by e.serie, e.ordre
$$;
revoke all on function public.epreuves_blanches_liste(text) from public;
grant execute on function public.epreuves_blanches_liste(text) to anon, authenticated;

-- Sujet d'une épreuve publiée, pour tout visiteur
create function public.epreuve_blanche(p_id bigint)
returns table (id bigint, serie smallint, ordre smallint, epreuve text, titre text, nature text, duree_minutes integer, sujet text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.serie, e.ordre, e.epreuve, e.titre, e.nature, e.duree_minutes, e.sujet
  from public.epreuves_blanches e where e.id = p_id and e.publie
$$;
revoke all on function public.epreuve_blanche(bigint) from public;
grant execute on function public.epreuve_blanche(bigint) to anon, authenticated;

-- Corrigé d'une épreuve, pour les abonnés qui y ont droit
create function public.corrige_epreuve_blanche(p_id bigint)
returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.acces_corriges_blancs() then
    raise exception 'Corrigé réservé aux abonnés (formules d''une semaine et plus)' using errcode = '42501';
  end if;
  return (select e.corrige from public.epreuves_blanches e where e.id = p_id and (e.publie or public.est_admin()));
end $$;
revoke all on function public.corrige_epreuve_blanche(bigint) from public, anon;
grant execute on function public.corrige_epreuve_blanche(bigint) to authenticated;
