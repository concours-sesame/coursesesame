-- Téléchargement de pages par les abonnés, avec filigrane à leur nom imprimé dans le PDF.
-- Règles : sur 7 jours glissants, au plus 5 % du nombre total de pages des PDF publiés, et au plus 15 pages
-- d'un même document. Le PDF est découpé et marqué par la fonction Edge « telechargement », qui seule
-- enregistre les téléchargements (par reserver_telechargement, sous verrou, pour qu'aucune demande simultanée
-- ne fasse dépasser les limites).

create table public.telechargements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contenu_id bigint references public.contenus (id) on delete set null,
  titre text not null check (char_length(titre) <= 200),
  pages integer[] not null,
  nb integer not null check (nb between 1 and 15),
  cree_le timestamptz not null default now()
);
create index telechargements_user_date on public.telechargements (user_id, cree_le desc);
alter table public.telechargements enable row level security;
create policy "telechargements : lecture (titulaire, admin)" on public.telechargements for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));
grant select on public.telechargements to authenticated;

-- Limites en vigueur : 5 % des pages des PDF publiés (pages comptées lors de la préparation du texte), 15 par document
create function public.telechargement_limites(out quota integer, out par_document integer)
language sql stable security definer set search_path = '' as $$
  select greatest(15, floor(0.05 * coalesce(sum(x.m), 0)))::integer, 15
  from (select max(p.page) m from public.passages p join public.contenus c on c.id = p.contenu_id
        where c.type = 'pdf' and c.publie and c.publie_le <= now() group by p.contenu_id) x;
$$;
revoke all on function public.telechargement_limites() from public, anon;
grant execute on function public.telechargement_limites() to authenticated, service_role;

-- État de l'abonné connecté : limites, pages utilisées sur 7 jours (en tout et par document), date de la
-- prochaine page rendue disponible
create function public.mes_telechargements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'quota', l.quota,
    'par_document', l.par_document,
    'utilises', coalesce((select sum(t.nb) from public.telechargements t where t.user_id = auth.uid() and t.cree_le > now() - interval '7 days'), 0),
    'liberation', (select min(t.cree_le) + interval '7 days' from public.telechargements t where t.user_id = auth.uid() and t.cree_le > now() - interval '7 days'),
    'documents', coalesce((select jsonb_object_agg(d.contenu_id, d.n) from (
        select t.contenu_id, sum(t.nb) n from public.telechargements t
        where t.user_id = auth.uid() and t.cree_le > now() - interval '7 days' and t.contenu_id is not null
        group by t.contenu_id) d), '{}'::jsonb))
  from public.telechargement_limites() l
  where auth.uid() is not null;
$$;
revoke all on function public.mes_telechargements() from public, anon;
grant execute on function public.mes_telechargements() to authenticated;

-- Réservation d'un téléchargement (fonction Edge seulement) : refuse toute demande qui dépasserait une limite
create function public.reserver_telechargement(p_user uuid, p_contenu bigint, p_titre text, p_pages integer[])
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  l record;
  v_nb integer := coalesce(array_length(p_pages, 1), 0);
  v_total integer;
  v_document integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('telechargement:' || p_user::text));
  select * into l from public.telechargement_limites();
  select coalesce(sum(nb), 0), coalesce(sum(nb) filter (where contenu_id = p_contenu), 0) into v_total, v_document
  from public.telechargements where user_id = p_user and cree_le > now() - interval '7 days';
  if v_nb < 1 then
    raise exception 'Indiquez au moins une page.' using errcode = 'P0001';
  end if;
  if v_document + v_nb > l.par_document then
    raise exception 'Au plus % pages d''un même document sur 7 jours. Il vous reste % page(s) pour ce document.',
      l.par_document, greatest(l.par_document - v_document, 0) using errcode = 'P0001';
  end if;
  if v_total + v_nb > l.quota then
    raise exception 'Au plus % pages sur 7 jours. Il vous reste % page(s) à télécharger.', l.quota, greatest(l.quota - v_total, 0) using errcode = 'P0001';
  end if;
  insert into public.telechargements (user_id, contenu_id, titre, pages, nb)
    values (p_user, p_contenu, left(p_titre, 200), p_pages, v_nb) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.reserver_telechargement(uuid, bigint, text, integer[]) from public, anon, authenticated;
grant execute on function public.reserver_telechargement(uuid, bigint, text, integer[]) to service_role;
