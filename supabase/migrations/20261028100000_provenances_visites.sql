-- Provenance des visiteurs et retombées des publications Facebook (onglet Visites de l'administration)
-- Chaque visiteur est rattaché à la provenance de sa première page vue sur la période (« (site) » exclu : c'est une
-- page précédente du même site). Les liens publiés par la page Facebook portent la marque « fb=<numéro de la ligne de
-- facebook_publications> », enregistrée comme provenance « fb-<numéro> » par assets/js/visite.js.

create or replace function public.provenance_groupe(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null or p = '' then 'Accès direct'
    when p ~ '^fb-[0-9]+$' or p = 'facebook' or p ~* '(^|\.)facebook\.com$' or p ~* '^(m|l|lm)\.facebook\.com$' then 'Facebook'
    when p ~* 'google' then 'Google'
    when p ~* 'whatsapp' then 'WhatsApp'
    when p ~* '(bing|yahoo|duckduckgo|ecosia|qwant)' then 'Autres moteurs de recherche'
    else p
  end
$$;

-- Bilan par provenance : visiteurs arrivés par là, pages vues par eux sur la période, et parmi eux ceux qui se sont
-- connectés à un compte (inscription ou abonnement)
create or replace function public.admin_provenances(p_jours integer default 30)
returns table (provenance text, visiteurs bigint, pages bigint, comptes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    with v as (
      select * from public.visites
      where quand > now() - make_interval(days => least(greatest(p_jours, 1), 180))
    ), premiere as (
      select distinct on (v.visiteur) v.visiteur, public.provenance_groupe(v.provenance) as groupe
      from v where coalesce(v.provenance, '') <> '(site)'
      order by v.visiteur, v.quand
    )
    select pr.groupe, count(distinct pr.visiteur),
      (select count(*) from v where v.visiteur in (select x.visiteur from premiere x where x.groupe = pr.groupe)),
      count(distinct pr.visiteur) filter (where exists (select 1 from v where v.visiteur = pr.visiteur and v.user_id is not null))
    from premiere pr
    group by pr.groupe
    order by 2 desc;
end $$;
revoke all on function public.admin_provenances(integer) from public, anon;
grant execute on function public.admin_provenances(integer) to authenticated;

-- Retombées de chaque publication Facebook du plan : visiteurs venus par son lien, pages qu'ils ont vues ensuite,
-- et parmi eux ceux qui se sont connectés à un compte
create or replace function public.admin_facebook_retombees(p_jours integer default 90)
returns table (id bigint, publiee_le timestamptz, titre text, rubrique text, lien text, visiteurs bigint, pages bigint, comptes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    with arrivees as (
      select (substring(v.provenance from '^fb-([0-9]+)$'))::bigint as pub, v.visiteur
      from public.visites v
      where v.provenance ~ '^fb-[0-9]+$' and v.quand > now() - make_interval(days => least(greatest(p_jours, 1), 180))
      group by 1, 2
    )
    select f.id, f.publiee_le, f.titre, f.rubrique, f.lien,
      count(a.visiteur),
      coalesce(sum((select count(*) from public.visites w where w.visiteur = a.visiteur and w.quand >= f.publiee_le)), 0)::bigint,
      count(a.visiteur) filter (where exists (select 1 from public.visites w where w.visiteur = a.visiteur and w.user_id is not null))
    from public.facebook_publications f
    left join arrivees a on a.pub = f.id
    where f.statut = 'publiee' and f.publiee_le > now() - make_interval(days => least(greatest(p_jours, 1), 180))
    group by f.id
    order by count(a.visiteur) desc, f.publiee_le desc;
end $$;
revoke all on function public.admin_facebook_retombees(integer) from public, anon;
grant execute on function public.admin_facebook_retombees(integer) to authenticated;
