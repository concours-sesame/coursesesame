-- Campagnes d'e-mails ponctuelles : l'annonce d'une nouveauté majeure (premier usage, les concours blancs de la
-- magistrature) part une fois à chaque abonné en cours qui accepte les e-mails d'information. Une campagne s'ouvre
-- en passant « active » à vrai ; la fonction « emails » l'envoie à la tâche planifiée suivante, par lots.

create table public.emails_campagnes (
  cle text primary key check (cle ~ '^[a-z0-9-]{3,60}$'),
  active boolean not null default false,
  cree_le timestamptz not null default now()
);
alter table public.emails_campagnes enable row level security;
create policy "emails_campagnes : tout (admin)" on public.emails_campagnes for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke all on public.emails_campagnes from anon, authenticated;
grant select, insert, update on public.emails_campagnes to authenticated;
insert into public.emails_campagnes (cle) values ('concours-blancs-magistrature');

alter table public.emails_envoyes drop constraint emails_envoyes_type_check;
alter table public.emails_envoyes add constraint emails_envoyes_type_check
  check (type in ('bienvenue', 'rappel_fin', 'nouveautes', 'inactif', 'essai', 'campagne'));

create or replace function public.emails_file()
returns table (type text, cle text, user_id uuid, email text, prenom text, donnees jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jour date := public.aujourdhui();
  v_matin boolean := (now() at time zone 'Africa/Abidjan')::time >= time '09:00';
  r public.emails_reglages;
  v_contenus jsonb;
begin
  select * into r from public.emails_reglages;
  -- Contenus à annoncer aujourd'hui (annonce des nouveautés, plus bas)
  if v_matin and (r.derniere_annonce at time zone 'Africa/Abidjan')::date < v_jour then
    select jsonb_agg(jsonb_build_object('titre', c.titre, 'matiere', c.matiere, 'type', c.type) order by c.publie_le)
      into v_contenus
    from public.contenus c
    where c.publie and c.publie_le > r.derniere_annonce and c.publie_le <= now();
  end if;
  -- Bienvenue : premier abonnement enregistré depuis moins de 2 jours
  return query
    select 'bienvenue'::text, 'premier'::text, a.user_id, u.email::text, p.prenom,
           jsonb_build_object('debut', a.debut, 'fin', a.fin, 'ouvrages', a.fin - a.debut + 1 >= 28)
    from public.abonnements a
    join auth.users u on u.id = a.user_id
    join public.profils p on p.id = a.user_id
    where a.supprime_le is null and a.cree_le > now() - interval '2 days'
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.cree_le < a.cree_le)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = a.user_id and e.type = 'bienvenue' and (e.statut <> 'erreur' or e.tentatives >= 3));
  -- Rappels : abonnement qui finit dans 7 jours puis dans 3 jours, sans prolongation déjà payée
  return query
    select 'rappel_fin'::text, case when a.fin = v_jour + 7 then 'J7-' else '' end || a.id::text, a.user_id, u.email::text, p.prenom,
           jsonb_build_object('fin', a.fin)
    from public.abonnements a
    join auth.users u on u.id = a.user_id
    join public.profils p on p.id = a.user_id
    where a.supprime_le is null and a.fin in (v_jour + 3, v_jour + 7)
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.fin > a.fin)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = a.user_id and e.type = 'rappel_fin'
        and e.cle = case when a.fin = v_jour + 7 then 'J7-' else '' end || a.id::text and (e.statut <> 'erreur' or e.tentatives >= 3));
  -- Relance d'inactivité (pas un jour d'annonce des nouveautés)
  if v_matin and (now() at time zone 'Africa/Abidjan')::time < time '20:00' and v_contenus is null then
    return query
      with actifs as (
        select a.user_id, a.debut, a.fin,
               coalesce((select max(coalesce(c.vu_le, c.cree_le)) from public.connexions c where c.user_id = a.user_id),
                        a.debut::timestamptz) as passage
        from public.abonnements a
        where a.supprime_le is null and v_jour between a.debut and a.fin
      )
      select 'inactif'::text, v_jour::text, x.user_id, u.email::text, p.prenom,
             jsonb_build_object('fin', x.fin, 'jours', x.fin - v_jour + 1, 'jeton', p.jeton_emails,
               'nouveaux', (select count(*) from public.contenus c where c.publie and c.publie_le > x.passage and c.publie_le <= now()),
               'titres', coalesce((select jsonb_agg(t.titre) from (select c.titre from public.contenus c
                  where c.publie and c.publie_le > x.passage and c.publie_le <= now() order by c.publie_le desc limit 3) t), '[]'::jsonb))
      from actifs x
      join auth.users u on u.id = x.user_id
      join public.profils p on p.id = x.user_id
      where p.emails_nouveautes
        and x.debut <= v_jour - 5 and x.fin >= v_jour + 4
        and x.passage < now() - interval '5 days'
        and not exists (select 1 from public.suspensions s where s.user_id = x.user_id and s.fin is null)
        and not exists (select 1 from public.admins ad where ad.user_id = x.user_id)
        and not exists (select 1 from public.emails_envoyes e where e.user_id = x.user_id and e.type = 'nouveautes' and e.cle = v_jour::text)
        and not exists (select 1 from public.emails_envoyes e where e.user_id = x.user_id and e.type = 'inactif'
          and (e.cle = v_jour::text or (e.cree_le > now() - interval '7 days' and e.statut <> 'erreur')));
  end if;
  -- Campagnes ponctuelles (annonce d'une nouveauté majeure) : une fois par abonné en cours, entre 9 h et 20 h,
  -- seulement s'il n'a pas refusé les e-mails d'information
  if v_matin and (now() at time zone 'Africa/Abidjan')::time < time '20:00' then
    return query
      select 'campagne'::text, k.cle, p.id, u.email::text, p.prenom, jsonb_build_object('campagne', k.cle, 'jeton', p.jeton_emails)
      from public.emails_campagnes k
      cross join public.profils p
      join auth.users u on u.id = p.id
      where k.active and p.emails_nouveautes
        and exists (select 1 from public.abonnements a where a.user_id = p.id and a.supprime_le is null and v_jour between a.debut and a.fin)
        and not exists (select 1 from public.suspensions s where s.user_id = p.id and s.fin is null)
        and not exists (select 1 from public.emails_envoyes e where e.user_id = p.id and e.type = 'campagne' and e.cle = k.cle and (e.statut <> 'erreur' or e.tentatives >= 3));
  end if;
  -- Nouveautés : une fois par jour à partir de 9 h, contenus mis en ligne depuis la dernière annonce
  if v_contenus is not null then
    return query
      select 'nouveautes'::text, v_jour::text, p.id, u.email::text, p.prenom, jsonb_build_object('contenus', v_contenus, 'jeton', p.jeton_emails)
      from public.profils p
      join auth.users u on u.id = p.id
      where p.emails_nouveautes
        and exists (select 1 from public.abonnements a where a.user_id = p.id and a.supprime_le is null and v_jour between a.debut and a.fin)
        and not exists (select 1 from public.suspensions s where s.user_id = p.id and s.fin is null)
        and not exists (select 1 from public.emails_envoyes e where e.user_id = p.id and e.type = 'nouveautes' and e.cle = v_jour::text and (e.statut <> 'erreur' or e.tentatives >= 3));
  end if;
end $$;
revoke all on function public.emails_file() from public, anon, authenticated;
grant execute on function public.emails_file() to service_role;
