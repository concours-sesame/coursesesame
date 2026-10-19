-- Concours blanc : une épreuve écrite à date et heure fixes, ouverte à tous les abonnés en cours. Le sujet n'est
-- révélé qu'à l'heure du début ; la copie s'enregistre au fil de l'eau et peut être rendue jusqu'à la fin de
-- l'épreuve (5 minutes de tolérance). Après la fin, l'abonné fait corriger sa copie par l'agent de révision
-- (formules d'un mois et plus) ; la note n'est retenue pour le classement que si la copie corrigée est exactement
-- celle qui a été rendue. Le classement est anonyme : chacun ne voit que sa note, son rang, le nombre de copies
-- notées, la moyenne et la meilleure note. Les épreuves sont créées et publiées depuis l'administration.

create table public.concours_blancs (
  id bigint generated always as identity primary key,
  titre text not null check (char_length(titre) between 3 and 120),
  exercice text not null check (exercice in ('cas_pratique', 'dissertation', 'commentaire')),
  matiere text not null default '' check (char_length(matiere) <= 80),
  concours text[] not null default '{}',
  sujet text not null check (char_length(sujet) between 10 and 12000),
  debut timestamptz not null,
  duree_minutes integer not null check (duree_minutes between 30 and 600),
  publie boolean not null default false,
  cree_le timestamptz not null default now()
);
alter table public.concours_blancs enable row level security;
create policy "concours_blancs : tout (admin)" on public.concours_blancs for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke all on public.concours_blancs from anon, authenticated;
grant select, insert, update on public.concours_blancs to authenticated;

create table public.copies_blanc (
  id bigint generated always as identity primary key,
  concours_id bigint not null references public.concours_blancs (id) on delete cascade,
  user_id uuid not null references public.profils (id) on delete cascade,
  copie text not null default '' check (char_length(copie) <= 40000),
  commence_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  rendue_le timestamptz,
  echange_id bigint references public.agent_echanges (id) on delete set null,
  note numeric(4,2),
  unique (concours_id, user_id)
);
alter table public.copies_blanc enable row level security;
create policy "copies_blanc : lecture (admin)" on public.copies_blanc for select to authenticated using ((select public.est_admin()));
revoke all on public.copies_blanc from anon, authenticated;
grant select on public.copies_blanc to authenticated;

-- Liste des épreuves publiées, pour l'abonné : sujet seulement à partir du début, copie, note et classement
create function public.mes_concours_blancs()
returns table (id bigint, titre text, exercice text, matiere text, debut timestamptz, fin timestamptz, duree_minutes integer,
               sujet text, copie text, rendue_le timestamptz, note numeric, rang integer, notes integer, moyenne numeric, meilleure numeric)
language sql stable security definer set search_path = '' as $$
  select b.id, b.titre, b.exercice, b.matiere, b.debut, b.debut + make_interval(mins => b.duree_minutes), b.duree_minutes,
         case when now() >= b.debut then b.sujet end,
         c.copie, c.rendue_le, c.note,
         case when c.note is not null then (select count(*)::int + 1 from public.copies_blanc x where x.concours_id = b.id and x.note > c.note) end,
         (select count(*)::int from public.copies_blanc x where x.concours_id = b.id and x.note is not null),
         (select round(avg(x.note), 2) from public.copies_blanc x where x.concours_id = b.id and x.note is not null),
         (select max(x.note) from public.copies_blanc x where x.concours_id = b.id)
  from public.concours_blancs b
  left join public.copies_blanc c on c.concours_id = b.id and c.user_id = auth.uid()
  where b.publie and (public.abonnement_actif() or public.est_admin())
    and b.debut > now() - interval '60 days'
  order by b.debut desc
$$;
revoke all on function public.mes_concours_blancs() from public, anon;
grant execute on function public.mes_concours_blancs() to authenticated;

-- Enregistrement de la copie pendant l'épreuve (et jusqu'à 5 minutes après la fin) ; p_rendre marque la copie rendue
create function public.enregistrer_copie_blanc(p_concours bigint, p_copie text, p_rendre boolean default false)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare b public.concours_blancs;
begin
  if not public.abonnement_actif() then raise exception 'Abonnement requis' using errcode = '42501'; end if;
  select * into b from public.concours_blancs where id = p_concours and publie;
  if b.id is null then raise exception 'Épreuve introuvable'; end if;
  if now() < b.debut then raise exception 'L''épreuve n''a pas commencé'; end if;
  if now() > b.debut + make_interval(mins => b.duree_minutes + 5) then raise exception 'L''épreuve est terminée : la copie ne peut plus être modifiée'; end if;
  insert into public.copies_blanc (concours_id, user_id, copie, rendue_le)
  values (p_concours, auth.uid(), left(coalesce(p_copie, ''), 40000), case when p_rendre then now() end)
  on conflict (concours_id, user_id) do update
    set copie = excluded.copie, maj_le = now(),
        rendue_le = case when p_rendre then now() else public.copies_blanc.rendue_le end
    where public.copies_blanc.rendue_le is null;
  return now();
end $$;
revoke all on function public.enregistrer_copie_blanc(bigint, text, boolean) from public, anon;
grant execute on function public.enregistrer_copie_blanc(bigint, text, boolean) to authenticated;

-- Note retenue : correction de l'agent (mode correction) portant sur la copie exacte et le sujet de l'épreuve
create function public.noter_copie_blanc(p_concours bigint, p_echange bigint) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v_note numeric;
begin
  select e.note into v_note
  from public.agent_echanges e
  join public.copies_blanc c on c.concours_id = p_concours and c.user_id = auth.uid()
  join public.concours_blancs b on b.id = p_concours
  where e.id = p_echange and e.user_id = auth.uid() and e.mode = 'correction' and e.statut = 'termine'
    and e.note is not null and btrim(e.sujet) = btrim(b.sujet) and btrim(e.copie) = btrim(c.copie)
    and now() > b.debut + make_interval(mins => b.duree_minutes);
  if v_note is null then raise exception 'Correction non reconnue pour cette épreuve'; end if;
  update public.copies_blanc set echange_id = p_echange, note = v_note,
    rendue_le = coalesce(rendue_le, maj_le)
  where concours_id = p_concours and user_id = auth.uid() and note is null;
  return v_note;
end $$;
revoke all on function public.noter_copie_blanc(bigint, bigint) from public, anon;
grant execute on function public.noter_copie_blanc(bigint, bigint) to authenticated;

-- Administration : épreuves avec le nombre de copies et la moyenne
create function public.admin_concours_blancs()
returns table (id bigint, titre text, exercice text, matiere text, concours text[], sujet text, debut timestamptz,
               duree_minutes integer, publie boolean, copies integer, rendues integer, notes integer, moyenne numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur' using errcode = '42501'; end if;
  return query
    select b.id, b.titre, b.exercice, b.matiere, b.concours, b.sujet, b.debut, b.duree_minutes, b.publie,
           (select count(*)::int from public.copies_blanc c where c.concours_id = b.id),
           (select count(*)::int from public.copies_blanc c where c.concours_id = b.id and c.rendue_le is not null),
           (select count(*)::int from public.copies_blanc c where c.concours_id = b.id and c.note is not null),
           (select round(avg(c.note), 2) from public.copies_blanc c where c.concours_id = b.id)
    from public.concours_blancs b order by b.debut desc;
end $$;
revoke all on function public.admin_concours_blancs() from public, anon;
grant execute on function public.admin_concours_blancs() to authenticated;
