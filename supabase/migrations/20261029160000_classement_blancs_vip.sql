-- Classement général des concours blancs (espace VIP) : moyenne de chaque candidat sur les concours blancs notés
-- des douze derniers mois, rang de l'abonné, tête du classement sans aucun nom et répartition des moyennes.
-- Lecture réservée à l'abonnement VIP ; les copies restent illisibles par les abonnés (RLS de copies_blanc).

create or replace function public.classement_blancs()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v jsonb;
begin
  if not public.acces_vip() then
    raise exception 'Le classement général est réservé à l''espace VIP' using errcode = '42501';
  end if;
  with notes as (
    select c.user_id, c.note, b.id, b.titre, b.debut
    from public.copies_blanc c
    join public.concours_blancs b on b.id = c.concours_id
    where c.note is not null and b.publie and b.debut > now() - interval '365 days'
  ), moyennes as (
    select user_id, round(avg(note), 2) as moyenne, count(*)::int as n
    from notes group by user_id
  ), rangs as (
    select user_id, moyenne, n, (rank() over (order by moyenne desc))::int as rang from moyennes
  )
  select jsonb_build_object(
    'participants', (select count(*) from rangs),
    'epreuves', (select count(distinct id) from notes),
    'moi', (select jsonb_build_object('rang', r.rang, 'moyenne', r.moyenne, 'n', r.n) from rangs r where r.user_id = auth.uid()),
    'tete', coalesce((select jsonb_agg(jsonb_build_object('rang', r.rang, 'moyenne', r.moyenne, 'n', r.n, 'moi', r.user_id = auth.uid())
                                       order by r.rang, r.n desc)
                      from (select * from rangs order by rang, n desc limit 10) r), '[]'::jsonb),
    'repartition', (select jsonb_build_array(
                      count(*) filter (where moyenne < 8),
                      count(*) filter (where moyenne >= 8 and moyenne < 10),
                      count(*) filter (where moyenne >= 10 and moyenne < 12),
                      count(*) filter (where moyenne >= 12 and moyenne < 14),
                      count(*) filter (where moyenne >= 14 and moyenne < 16),
                      count(*) filter (where moyenne >= 16)) from rangs),
    'parcours', coalesce((select jsonb_agg(jsonb_build_object('titre', x.titre, 'debut', x.debut, 'note', x.note,
                                     'rang', (select count(*)::int + 1 from notes y where y.id = x.id and y.note > x.note),
                                     'notes', (select count(*)::int from notes y where y.id = x.id)) order by x.debut)
                          from notes x where x.user_id = auth.uid()), '[]'::jsonb))
  into v;
  return v;
end $$;

revoke all on function public.classement_blancs() from public, anon;
grant execute on function public.classement_blancs() to authenticated;
