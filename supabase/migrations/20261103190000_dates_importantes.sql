-- Dates importantes de l'éditeur : épinglées dans l'espace abonnés de l'administrateur, avec un e-mail de rappel
-- une semaine avant chaque date (fonction echeances, tâche quotidienne).
-- Deux sortes de dates :
--   - fixes, dans la table echeances (nom de domaine, accès Facebook…), que l'administrateur peut compléter ;
--   - calculées à chaque lecture (fin des publications Facebook et TikTok, fin des vidéos du jour, expiration de la
--     connexion TikTok, dernier concours blanc à date fixe, fins d'abonnements) : elles suivent les prolongations.
create table if not exists public.echeances (
  id bigint generated always as identity primary key,
  titre text not null check (length(titre) between 2 and 160),
  date_echeance date not null,
  detail text check (detail is null or length(detail) <= 600),
  cree_le timestamptz not null default now()
);
alter table public.echeances enable row level security;
revoke all on table public.echeances from anon;
grant select, insert, delete on table public.echeances to authenticated;
create policy "echeances : administrateur" on public.echeances for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

-- Rappels déjà envoyés (une fois par date : une date prolongée donne un nouveau rappel)
create table if not exists public.echeances_rappels (
  cle text not null,
  date_echeance date not null,
  envoye_le timestamptz not null default now(),
  primary key (cle, date_echeance)
);
alter table public.echeances_rappels enable row level security;
revoke all on table public.echeances_rappels from anon, authenticated;

create or replace function public.echeances_liste()
 returns table(cle text, titre text, date_echeance date, detail text, manuelle boolean, id bigint)
 language sql stable security definer set search_path to ''
as $$
  select * from (
    select 'manuelle-' || e.id, e.titre, e.date_echeance, e.detail, true, e.id from public.echeances e
    union all
    select 'facebook-fin', 'Fin des publications automatiques sur Facebook', max(f.prevue_le)::date,
           'Dernière publication programmée sur la page Facebook. Au-delà, plus rien ne part : prolonger le plan des publications.', false, null
      from public.facebook_publications f where f.statut = 'programmee' having max(f.prevue_le) is not null
    union all
    select 'tiktok-fin', 'Fin des publications automatiques sur TikTok', max(t.prevue_le)::date,
           'Dernière vidéo programmée sur TikTok. Au-delà, plus rien ne part : fabriquer et programmer les vidéos suivantes.', false, null
      from public.tiktok_publications t where t.statut = 'programmee' having max(t.prevue_le) is not null
    union all
    select 'videos-du-jour-fin', 'Fin des vidéos du jour dans l''espace abonnés', max(c.publie_le)::date,
           'Dernière vidéo du jour programmée dans l''espace abonnés (et dernier QCM du jour sur le site).', false, null
      from public.contenus c where c.video_ouverte and c.publie having max(c.publie_le) is not null
    union all
    select 'tiktok-connexion', 'Expiration de la connexion TikTok', k.refresh_expire_le::date,
           'Au-delà, reconnecter le compte TikTok depuis l''administration (onglet Communication, TikTok).', false, null
      from public.tiktok_compte k
    union all
    select 'concours-blancs-fin', 'Dernier concours blanc à date fixe programmé', max(b.debut)::date,
           'Après cette date, aucun concours blanc à date fixe n''est prévu dans l''espace abonnés : en programmer de nouveaux.', false, null
      from public.concours_blancs b having max(b.debut) is not null
    union all
    select 'abonnements-' || a.fin, case when count(*) > 1 then 'Fin de ' || count(*) || ' abonnements' else 'Fin d''un abonnement' end, a.fin,
           count(*) filter (where a.vip) || ' VIP. Les abonnés reçoivent déjà leurs rappels ; c''est le moment de les relancer sur WhatsApp.', false, null
      from public.abonnements a where a.supprime_le is null and a.fin >= public.aujourdhui() group by a.fin
  ) x
  where x.date_echeance >= public.aujourdhui() - 1
  order by x.date_echeance;
$$;
revoke all on function public.echeances_liste() from public, anon, authenticated;
grant execute on function public.echeances_liste() to service_role;

-- Lecture par l'administrateur (espace abonnés)
create or replace function public.admin_echeances()
 returns table(cle text, titre text, date_echeance date, detail text, manuelle boolean, id bigint)
 language plpgsql stable security definer set search_path to ''
as $$
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur'; end if;
  return query select * from public.echeances_liste();
end $$;
revoke all on function public.admin_echeances() from public, anon;
grant execute on function public.admin_echeances() to authenticated;

-- Destinataires des rappels : les administrateurs
create or replace function public.echeances_destinataires()
 returns table(email text, prenom text)
 language sql stable security definer set search_path to ''
as $$ select u.email::text, coalesce(p.prenom, '') from public.admins a join auth.users u on u.id = a.user_id left join public.profils p on p.id = a.user_id $$;
revoke all on function public.echeances_destinataires() from public, anon, authenticated;
grant execute on function public.echeances_destinataires() to service_role;

insert into public.echeances (titre, date_echeance, detail)
select 'Renouvellement du nom de domaine coursesesame.com', date '2027-10-12',
       'Enregistré chez Spaceship le 12 octobre 2026 pour un an (registre officiel des .com). Sans renouvellement, le site devient inaccessible. Activer le renouvellement automatique chez Spaceship.'
where not exists (select 1 from public.echeances where titre like 'Renouvellement du nom de domaine%');
insert into public.echeances (titre, date_echeance, detail)
select 'Accès de la page Facebook à renouveler', date '2027-01-25',
       'Date d''expiration de l''accès aux données donnée par Facebook pour la clé de la page. Avant cette date, vérifier que les publications passent encore ; sinon, régénérer la clé de la page dans Meta for Developers.'
where not exists (select 1 from public.echeances where titre like 'Accès de la page Facebook%');
