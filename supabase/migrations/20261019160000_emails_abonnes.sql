-- E-mails aux abonnés, envoyés par Brevo depuis infos@coursesesame.com par la fonction Edge « emails ».
-- Trois e-mails automatiques, liés au service souscrit : bienvenue au premier abonnement, rappel 3 jours avant la fin,
-- annonce quotidienne (à partir de 9 h, heure d'Abidjan) des contenus publiés la veille, aux abonnés en cours qui
-- ne l'ont pas refusée. Une tâche planifiée appelle la fonction toutes les 15 minutes ; rien ne part tant que
-- l'administrateur n'a pas ouvert l'envoi (emails_reglages.actif) et que la clé BREVO_API_KEY n'est pas enregistrée.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Choix de l'abonné et lien de désinscription
-- ---------------------------------------------------------------------------

alter table public.profils add column emails_nouveautes boolean not null default true;
alter table public.profils add column jeton_emails uuid not null default gen_random_uuid() unique;
grant update (emails_nouveautes) on public.profils to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Réglages et journal des envois
-- ---------------------------------------------------------------------------

create table public.emails_reglages (
  id boolean primary key default true check (id),
  actif boolean not null default false,
  derniere_annonce timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
insert into public.emails_reglages default values;
alter table public.emails_reglages enable row level security;
create policy "emails_reglages : lecture (admin)" on public.emails_reglages for select to authenticated using ((select public.est_admin()));
create policy "emails_reglages : modification (admin)" on public.emails_reglages for update to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
revoke all on public.emails_reglages from anon, authenticated;
grant select, update (actif, maj_le) on public.emails_reglages to authenticated;

create table public.emails_envoyes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  type text not null check (type in ('bienvenue', 'rappel_fin', 'nouveautes', 'essai')),
  cle text not null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'envoye', 'erreur')),
  erreur text check (char_length(erreur) <= 500),
  tentatives smallint not null default 1,
  cree_le timestamptz not null default now(),
  unique (user_id, type, cle)
);
alter table public.emails_envoyes enable row level security;
create policy "emails_envoyes : lecture (admin)" on public.emails_envoyes for select to authenticated using ((select public.est_admin()));
revoke all on public.emails_envoyes from anon, authenticated;
grant select on public.emails_envoyes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. File d'attente calculée par la base (fonction Edge seulement)
-- ---------------------------------------------------------------------------

create function public.emails_file()
returns table (type text, cle text, user_id uuid, email text, prenom text, donnees jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jour date := public.aujourdhui();
  r public.emails_reglages;
  v_contenus jsonb;
begin
  select * into r from public.emails_reglages;
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
  -- Rappel : abonnement qui finit dans 3 jours, sans prolongation déjà payée
  return query
    select 'rappel_fin'::text, a.id::text, a.user_id, u.email::text, p.prenom, jsonb_build_object('fin', a.fin)
    from public.abonnements a
    join auth.users u on u.id = a.user_id
    join public.profils p on p.id = a.user_id
    where a.supprime_le is null and a.fin = v_jour + 3
      and not exists (select 1 from public.abonnements b where b.user_id = a.user_id and b.supprime_le is null and b.fin > a.fin)
      and not exists (select 1 from public.emails_envoyes e where e.user_id = a.user_id and e.type = 'rappel_fin' and e.cle = a.id::text and (e.statut <> 'erreur' or e.tentatives >= 3));
  -- Nouveautés : une fois par jour à partir de 9 h, contenus mis en ligne depuis la dernière annonce
  if (now() at time zone 'Africa/Abidjan')::time >= time '09:00' and (r.derniere_annonce at time zone 'Africa/Abidjan')::date < v_jour then
    select jsonb_agg(jsonb_build_object('titre', c.titre, 'matiere', c.matiere, 'type', c.type) order by c.publie_le)
      into v_contenus
    from public.contenus c
    where c.publie and c.publie_le > r.derniere_annonce and c.publie_le <= now();
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
  end if;
end $$;
revoke all on function public.emails_file() from public, anon, authenticated;
grant execute on function public.emails_file() to service_role;

-- Annonce du jour faite : les contenus suivants partiront dans l'annonce du lendemain
create function public.emails_annonce_faite() returns void
language sql security definer set search_path = '' as $$
  update public.emails_reglages set derniere_annonce = now();
$$;
revoke all on function public.emails_annonce_faite() from public, anon, authenticated;
grant execute on function public.emails_annonce_faite() to service_role;

-- Désinscription des annonces par le lien de l'e-mail (sans connexion)
create function public.emails_desinscrire(p_jeton uuid) returns boolean
language sql security definer set search_path = '' as $$
  update public.profils set emails_nouveautes = false where jeton_emails = p_jeton returning true;
$$;
revoke all on function public.emails_desinscrire(uuid) from public, anon, authenticated;
grant execute on function public.emails_desinscrire(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Tâche planifiée : appel de la fonction toutes les 15 minutes, avec une clé gardée dans le coffre (Vault)
-- ---------------------------------------------------------------------------

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'emails_planif', 'Clé de la tâche planifiée des e-mails');

create function public.emails_verifier_planif(p_cle text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_cle = (select decrypted_secret from vault.decrypted_secrets where name = 'emails_planif'), false);
$$;
revoke all on function public.emails_verifier_planif(text) from public, anon, authenticated;
grant execute on function public.emails_verifier_planif(text) to service_role;

select cron.schedule('emails-abonnes', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://iyftcjszvnaaakirlsdd.supabase.co/functions/v1/emails',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-planif', (select decrypted_secret from vault.decrypted_secrets where name = 'emails_planif')),
    body := '{"action":"planif"}'::jsonb,
    timeout_milliseconds := 60000);
$$);

-- ---------------------------------------------------------------------------
-- 5. Nouvelle tentative des envois en échec, trois au plus (ajouté le 19 octobre, après un refus de Brevo)
-- ---------------------------------------------------------------------------
create function public.emails_reprendre(p_user uuid, p_type text, p_cle text) returns bigint
language sql security definer set search_path = '' as $$
  update public.emails_envoyes set statut = 'en_cours', tentatives = tentatives + 1, erreur = null
  where user_id = p_user and type = p_type and cle = p_cle and statut = 'erreur' and tentatives < 3
  returning id;
$$;
revoke all on function public.emails_reprendre(uuid, text, text) from public, anon, authenticated;
grant execute on function public.emails_reprendre(uuid, text, text) to service_role;
