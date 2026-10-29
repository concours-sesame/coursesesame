-- Plan de révision (espace VIP) : l'abonné retrouve les contenus qu'il a déjà ouverts, pour cocher son plan
-- automatiquement. La table lectures reste lisible par l'administrateur seul ; cette fonction ne rend que les
-- identifiants des contenus ouverts par l'appelant.
create or replace function public.mes_lectures()
returns setof bigint
language sql
stable
security definer
set search_path to ''
as $$
  select distinct l.contenu_id from public.lectures l where l.user_id = auth.uid();
$$;
revoke all on function public.mes_lectures() from public, anon;
grant execute on function public.mes_lectures() to authenticated;
