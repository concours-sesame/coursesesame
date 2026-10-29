-- Parrainage plus visible : compteur de l'abonné (amis inscrits avec son code, amis abonnés, jours gagnés)
create or replace function public.mon_parrainage()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'inscrits', (select count(*) from public.profils p where p.parrain_id = auth.uid()),
    'abonnes', (select count(*) from public.parrainages x where x.parrain_id = auth.uid()),
    'jours', (select coalesce(sum(a.fin - a.debut + 1), 0) from public.parrainages x
              join public.abonnements a on a.id = x.abonnement_id and a.supprime_le is null
              where x.parrain_id = auth.uid()));
$$;
revoke all on function public.mon_parrainage() from public, anon;
grant execute on function public.mon_parrainage() to authenticated;
