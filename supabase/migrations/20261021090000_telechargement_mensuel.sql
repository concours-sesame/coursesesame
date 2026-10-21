-- Téléchargement de pages, limite resserrée : sur 30 jours glissants, au plus 20 pages en tout et 5 pages d'un même
-- document (au lieu de 5 % du total et 15 par document sur 7 jours). Limite stricte, vérifiée sous verrou par
-- reserver_telechargement ; mes_telechargements renvoie le décompte sur la même période.

create or replace function public.telechargement_limites(out quota integer, out par_document integer)
language sql stable security definer set search_path = '' as $$
  select 20, 5;
$$;

create or replace function public.mes_telechargements() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'quota', l.quota,
    'par_document', l.par_document,
    'jours', 30,
    'utilises', coalesce((select sum(t.nb) from public.telechargements t where t.user_id = auth.uid() and t.cree_le > now() - interval '30 days'), 0),
    'liberation', (select min(t.cree_le) + interval '30 days' from public.telechargements t where t.user_id = auth.uid() and t.cree_le > now() - interval '30 days'),
    'documents', coalesce((select jsonb_object_agg(d.contenu_id, d.n) from (
        select t.contenu_id, sum(t.nb) n from public.telechargements t
        where t.user_id = auth.uid() and t.cree_le > now() - interval '30 days' and t.contenu_id is not null
        group by t.contenu_id) d), '{}'::jsonb))
  from public.telechargement_limites() l
  where auth.uid() is not null;
$$;

create or replace function public.reserver_telechargement(p_user uuid, p_contenu bigint, p_titre text, p_pages integer[])
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
  from public.telechargements where user_id = p_user and cree_le > now() - interval '30 days';
  if v_nb < 1 then
    raise exception 'Indiquez au moins une page.' using errcode = 'P0001';
  end if;
  if v_document + v_nb > l.par_document then
    raise exception 'Au plus % pages d''un même ouvrage sur 30 jours. Il vous reste % page(s) pour cet ouvrage.',
      l.par_document, greatest(l.par_document - v_document, 0) using errcode = 'P0001';
  end if;
  if v_total + v_nb > l.quota then
    raise exception 'Au plus % pages sur 30 jours, tous ouvrages confondus. Il vous reste % page(s) à télécharger.', l.quota, greatest(l.quota - v_total, 0) using errcode = 'P0001';
  end if;
  insert into public.telechargements (user_id, contenu_id, titre, pages, nb)
    values (p_user, p_contenu, left(p_titre, 200), p_pages, v_nb) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.reserver_telechargement(uuid, bigint, text, integer[]) from public, anon, authenticated;
grant execute on function public.reserver_telechargement(uuid, bigint, text, integer[]) to service_role;
