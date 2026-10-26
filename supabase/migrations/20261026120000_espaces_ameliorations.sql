-- Améliorations de l'espace abonnés et de l'administration (26 octobre 2026)
--
-- 1. Demandes d'activation : l'abonné choisit sa formule, son moyen de paiement et saisit la référence de son
--    paiement Mobile Money depuis son espace. L'administration voit la demande, vérifie le paiement et active en un
--    clic. Une seule demande en attente par compte (une nouvelle remplace l'ancienne). La demande passe d'elle-même
--    à « validée » dès qu'une période d'abonnement est enregistrée pour ce compte.
-- 2. E-mails : récapitulatif du lundi pour les abonnés en cours, alerte à l'administrateur pour chaque nouvelle
--    demande d'activation et chaque nouveau compte.
-- 3. Mot de passe oublié : journal des demandes (fonction « mot-de-passe-oublie »), pour en limiter le nombre.

/* ---------- 1. Demandes d'activation ---------- */
create table public.demandes_activation (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profils (id) on delete cascade,
  formule text not null check (formule in ('j1', 'j7', 'j14', 'm1', 'm2', 'm3', 'm6', 'm12')),
  montant integer check (montant between 0 and 1000000),
  moyen text not null check (moyen in ('Orange Money', 'MTN MoMo', 'Wave', 'Moov Money')),
  reference text not null check (char_length(reference) between 4 and 80),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'refusee')),
  motif text check (char_length(motif) <= 300),
  cree_le timestamptz not null default now(),
  traitee_le timestamptz,
  traitee_par uuid references auth.users (id) on delete set null
);
create unique index demandes_activation_une_en_attente on public.demandes_activation (user_id) where statut = 'en_attente';
create index demandes_activation_user on public.demandes_activation (user_id, cree_le desc);
alter table public.demandes_activation enable row level security;
create policy "demandes_activation : lecture (titulaire ou admin)" on public.demandes_activation
  for select to authenticated using (user_id = (select auth.uid()) or (select public.est_admin()));
revoke all on public.demandes_activation from anon, authenticated;
grant select on public.demandes_activation to authenticated;

-- Références comparées sans espaces, tirets ni casse (comme dans l'administration)
create or replace function public.norm_reference(t text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Demande de l'abonné connecté. Refusée si la référence a déjà servi pour un paiement enregistré ou une autre
-- demande ; au plus 5 demandes par jour et par compte.
create or replace function public.demander_activation(p_formule text, p_moyen text, p_reference text, p_montant integer default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_ref text := btrim(coalesce(p_reference, ''));
  v_norm text := public.norm_reference(p_reference);
  v_id bigint;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not exists (select 1 from public.profils where id = v_uid) then raise exception 'Compte introuvable'; end if;
  if char_length(v_norm) < 4 then raise exception 'Indiquez la référence complète de votre paiement.'; end if;
  if (select count(*) from public.demandes_activation where user_id = v_uid and cree_le > now() - interval '1 day') >= 5 then
    raise exception 'Trop de demandes aujourd''hui. Écrivez-nous sur WhatsApp.';
  end if;
  if exists (select 1 from public.abonnements where supprime_le is null and public.norm_reference(note) = v_norm)
     or exists (select 1 from public.demandes_activation where public.norm_reference(reference) = v_norm
                and statut <> 'refusee' and not (user_id = v_uid and statut = 'en_attente')) then
    raise exception 'Cette référence de paiement a déjà été enregistrée. Vérifiez-la ou écrivez-nous sur WhatsApp.';
  end if;
  update public.demandes_activation
     set formule = p_formule, moyen = p_moyen, reference = v_ref, montant = p_montant, cree_le = now()
   where user_id = v_uid and statut = 'en_attente'
  returning id into v_id;
  if v_id is null then
    insert into public.demandes_activation (user_id, formule, moyen, reference, montant)
    values (v_uid, p_formule, p_moyen, v_ref, p_montant)
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.demander_activation(text, text, text, integer) from public, anon;
grant execute on function public.demander_activation(text, text, text, integer) to authenticated;

-- L'abonné retire sa demande en attente (erreur de saisie)
create or replace function public.retirer_demande_activation()
returns void
language sql security definer set search_path = '' as $$
  delete from public.demandes_activation where user_id = auth.uid() and statut = 'en_attente';
$$;
revoke all on function public.retirer_demande_activation() from public, anon;
grant execute on function public.retirer_demande_activation() to authenticated;

-- Administrateur : refus motivé d'une demande (paiement introuvable, montant insuffisant…)
create or replace function public.admin_refuser_demande(p_id bigint, p_motif text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then raise exception 'Accès réservé à l''administrateur' using errcode = '42501'; end if;
  update public.demandes_activation
     set statut = 'refusee', motif = nullif(btrim(coalesce(p_motif, '')), ''), traitee_le = now(), traitee_par = auth.uid()
   where id = p_id and statut = 'en_attente';
  if not found then raise exception 'Demande introuvable ou déjà traitée'; end if;
end $$;
revoke all on function public.admin_refuser_demande(bigint, text) from public, anon;
grant execute on function public.admin_refuser_demande(bigint, text) to authenticated;

-- Une période d'abonnement enregistrée valide la demande en attente du même compte (sauf les 7 jours offerts
-- au parrain, qui ne répondent à aucune demande)
create or replace function public.valider_demande_activation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.moyen is not distinct from 'Parrainage' then return new; end if;
  update public.demandes_activation
     set statut = 'validee', traitee_le = now(), traitee_par = auth.uid()
   where user_id = new.user_id and statut = 'en_attente';
  return new;
end $$;
revoke all on function public.valider_demande_activation() from public, anon, authenticated;
create trigger abonnements_valide_demande after insert on public.abonnements
  for each row execute function public.valider_demande_activation();

-- Suivi en direct dans l'administration
alter publication supabase_realtime add table public.demandes_activation;

/* ---------- 2. E-mails : récapitulatif du lundi et alertes à l'administrateur ---------- */
alter table public.emails_envoyes drop constraint emails_envoyes_type_check;
alter table public.emails_envoyes add constraint emails_envoyes_type_check
  check (type in ('bienvenue', 'rappel_fin', 'nouveautes', 'inactif', 'essai', 'campagne', 'hebdo', 'alerte_demande', 'alerte_compte'));

-- Comptes et demandes antérieurs à cette migration : pas d'alerte rétroactive
create table public.emails_alertes_depuis (id boolean primary key default true check (id), depuis timestamptz not null default now());
insert into public.emails_alertes_depuis default values;
alter table public.emails_alertes_depuis enable row level security;
revoke all on public.emails_alertes_depuis from anon, authenticated;

create or replace function public.emails_file()
 returns table(type text, cle text, user_id uuid, email text, prenom text, donnees jsonb)
 language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_jour date := public.aujourdhui();
  v_matin boolean := (now() at time zone 'Africa/Abidjan')::time >= time '09:00';
  v_journee boolean := v_matin and (now() at time zone 'Africa/Abidjan')::time < time '20:00';
  v_lundi boolean := extract(isodow from v_jour) = 1;
  v_depuis timestamptz := coalesce((select depuis from public.emails_alertes_depuis), now());
  r public.emails_reglages;
  v_contenus jsonb;
begin
  select * into r from public.emails_reglages;
  if v_matin and (r.derniere_annonce at time zone 'Africa/Abidjan')::date < v_jour then
    select jsonb_agg(jsonb_build_object('titre', c.titre, 'matiere', c.matiere, 'type', c.type) order by c.publie_le)
      into v_contenus
    from public.contenus c
    where c.publie and c.publie_le > r.derniere_annonce and c.publie_le <= now();
  end if;
  return query
    select 'bienvenue'::text, 'premier'::text, a.user_id, u.email::text, p.prenom,
           jsonb_build_object('debut', a.debut, 'fin', a.fin, 'ouvrages', a.fin - a.debut + 1 >= 28)
    from public.abonnements a
    join auth.users u on u.id = a.user_id
    join public.profils p on p.id = a.user_id
    where a.supprime_le is null and a.cree_le > now() - interval '2 days'
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.cree_le < a.cree_le)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = a.user_id and e.type = 'bienvenue' and (e.statut <> 'erreur' or e.tentatives >= 3));
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
  -- Relance d'inactivité : jamais le lundi, jour du récapitulatif
  if v_journee and not v_lundi and v_contenus is null then
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
  -- Récapitulatif du lundi : abonnés en cours depuis 3 jours au moins, qui acceptent les e-mails d'information
  if v_journee and v_lundi then
    return query
      with actifs as (
        select distinct on (a.user_id) a.user_id, a.fin
        from public.abonnements a
        where a.supprime_le is null and v_jour between a.debut and a.fin
          and exists (select 1 from public.abonnements d where d.user_id = a.user_id and d.supprime_le is null and d.debut <= v_jour - 3)
        order by a.user_id, a.fin desc
      )
      select 'hebdo'::text, v_jour::text, x.user_id, u.email::text, p.prenom,
             jsonb_build_object(
               'jeton', p.jeton_emails,
               'fin', (select max(b.fin) from public.abonnements b where b.user_id = x.user_id and b.supprime_le is null),
               'date_concours', p.date_concours,
               'lectures', (select count(*) from public.lectures l where l.user_id = x.user_id and l.ouvert_le > now() - interval '7 days'),
               'jours_actifs', (select count(distinct j) from (
                   select (l.ouvert_le at time zone 'UTC')::date j from public.lectures l where l.user_id = x.user_id and l.ouvert_le > now() - interval '7 days'
                   union select (q.maj_le at time zone 'UTC')::date from public.qcm_progres q where q.user_id = x.user_id and q.maj_le > now() - interval '7 days') t),
               'a_revoir', (select count(*) from public.qcm_progres q where q.user_id = x.user_id and q.prochaine <= v_jour),
               'nouveaux', (select count(*) from public.contenus c where c.publie and c.publie_le > now() - interval '7 days' and c.publie_le <= now()),
               'titres', coalesce((select jsonb_agg(t.titre) from (select c.titre from public.contenus c
                  where c.publie and c.publie_le > now() - interval '7 days' and c.publie_le <= now() order by c.publie_le desc limit 3) t), '[]'::jsonb),
               'blanc', (select jsonb_build_object('titre', b.titre, 'debut', b.debut) from public.concours_blancs b
                  where b.publie and b.debut > now() order by b.debut limit 1))
      from actifs x
      join auth.users u on u.id = x.user_id
      join public.profils p on p.id = x.user_id
      where p.emails_nouveautes
        and not exists (select 1 from public.suspensions s where s.user_id = x.user_id and s.fin is null)
        and not exists (select 1 from public.admins ad where ad.user_id = x.user_id)
        and not exists (select 1 from public.emails_envoyes e where e.user_id = x.user_id and e.type = 'hebdo' and e.cle = v_jour::text
          and (e.statut <> 'erreur' or e.tentatives >= 3));
  end if;
  if v_journee then
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
  -- Alertes à chaque administrateur, à toute heure : nouvelle demande d'activation, nouveau compte
  return query
    select 'alerte_demande'::text, d.id::text, ad.user_id, u.email::text, coalesce(pa.prenom, ''),
           jsonb_build_object('client', p.prenom || ' ' || p.nom, 'telephone', p.telephone, 'formule', d.formule,
             'montant', d.montant, 'moyen', d.moyen, 'reference', d.reference)
    from public.demandes_activation d
    join public.profils p on p.id = d.user_id
    cross join public.admins ad
    join auth.users u on u.id = ad.user_id
    left join public.profils pa on pa.id = ad.user_id
    where d.statut = 'en_attente' and d.cree_le > v_depuis
      and not exists (select 1 from public.emails_envoyes e where e.user_id = ad.user_id and e.type = 'alerte_demande' and e.cle = d.id::text
        and (e.statut <> 'erreur' or e.tentatives >= 3));
  return query
    select 'alerte_compte'::text, p.id::text, ad.user_id, u.email::text, coalesce(pa.prenom, ''),
           jsonb_build_object('client', p.prenom || ' ' || p.nom, 'telephone', p.telephone, 'concours', p.concours)
    from public.profils p
    cross join public.admins ad
    join auth.users u on u.id = ad.user_id
    left join public.profils pa on pa.id = ad.user_id
    where p.cree_le > v_depuis and p.cree_le > now() - interval '2 days'
      and not exists (select 1 from public.admins x where x.user_id = p.id)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = ad.user_id and e.type = 'alerte_compte' and e.cle = p.id::text
        and (e.statut <> 'erreur' or e.tentatives >= 3));
end $function$;

/* ---------- 3. Mot de passe oublié : journal des demandes ---------- */
create table public.journal_mot_de_passe (
  id bigint generated always as identity primary key,
  ip text not null,
  email text not null,
  cree_le timestamptz not null default now()
);
create index journal_mot_de_passe_cree on public.journal_mot_de_passe (cree_le);
alter table public.journal_mot_de_passe enable row level security;
revoke all on public.journal_mot_de_passe from anon, authenticated;
