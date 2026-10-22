-- Suivi des visites du site public, consultable en temps réel dans l'administration.
-- Une ligne par page vue : identifiant anonyme tiré au hasard et gardé dans le navigateur, compte abonné
-- si le visiteur est connecté, page, site de provenance et type d'appareil. Aucune adresse IP n'est conservée.
-- La table n'est lisible par personne : l'écriture passe par enregistrer_visite, la lecture par les fonctions admin.
create table if not exists public.visites (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  visiteur uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  page text not null,
  provenance text,
  appareil text
);
create index if not exists visites_quand_idx on public.visites (quand desc);
create index if not exists visites_visiteur_idx on public.visites (visiteur, quand desc);
alter table public.visites enable row level security;
revoke all on public.visites from anon, authenticated;

create or replace function public.enregistrer_visite(p_visiteur uuid, p_page text, p_provenance text default null, p_appareil text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_page text := left(coalesce(p_page, ''), 200);
begin
  if p_visiteur is null or v_page = '' then return; end if;
  -- Un rechargement immédiat de la même page ne compte pas deux fois
  if exists (select 1 from public.visites where visiteur = p_visiteur and page = v_page and quand > now() - interval '30 seconds') then return; end if;
  -- Garde-fou contre un envoi massif automatisé
  if (select count(*) from public.visites where quand > now() - interval '1 minute') > 1500 then return; end if;
  insert into public.visites (visiteur, user_id, page, provenance, appareil)
  values (p_visiteur, auth.uid(), v_page, nullif(left(p_provenance, 200), ''), left(p_appareil, 20));
  -- Conservation limitée à 180 jours
  if random() < 0.002 then delete from public.visites where quand < now() - interval '180 days'; end if;
end $$;
revoke all on function public.enregistrer_visite(uuid, text, text, text) from public;
grant execute on function public.enregistrer_visite(uuid, text, text, text) to anon, authenticated;

-- Dernières visites (24 heures par défaut, 30 jours au plus), avec le nom des abonnés connectés
create or replace function public.admin_visites(p_heures integer default 24)
returns table (quand timestamptz, visiteur uuid, user_id uuid, prenom text, nom text, telephone text, abonne boolean, page text, provenance text, appareil text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select v.quand, v.visiteur, v.user_id, p.prenom, p.nom, p.telephone,
      exists (select 1 from public.abonnements a where a.user_id = v.user_id and a.supprime_le is null and public.aujourdhui() between a.debut and a.fin),
      v.page, v.provenance, v.appareil
    from public.visites v left join public.profils p on p.id = v.user_id
    where v.quand > now() - make_interval(hours => least(greatest(p_heures, 1), 720))
    order by v.quand desc
    limit 3000;
end $$;
revoke all on function public.admin_visites(integer) from public;
grant execute on function public.admin_visites(integer) to authenticated;

-- Bilan par jour : pages vues, visiteurs distincts, comptes connectés distincts
create or replace function public.admin_visites_jours(p_jours integer default 30)
returns table (jour date, pages bigint, visiteurs bigint, comptes bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select (v.quand at time zone 'Africa/Abidjan')::date, count(*), count(distinct v.visiteur), count(distinct v.user_id)
    from public.visites v
    where v.quand > now() - make_interval(days => least(greatest(p_jours, 1), 180))
    group by 1 order by 1 desc;
end $$;
revoke all on function public.admin_visites_jours(integer) from public;
grant execute on function public.admin_visites_jours(integer) to authenticated;
