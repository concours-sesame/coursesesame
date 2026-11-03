-- Publication sur le compte TikTok de l'éditeur (Login Kit et Content Posting API de TikTok for Developers),
-- par la fonction « tiktok ». Les clés de l'application TikTok (client key et client secret) sont dans le coffre
-- (vault : tiktok_client_key, tiktok_client_secret) ; les jetons du compte connecté sont dans tiktok_compte.
-- Aucune de ces tables n'est lisible par le site : seule la fonction (rôle service_role) y accède, sauf
-- tiktok_publications, que l'administrateur gère depuis l'onglet TikTok de l'administration.

-- Clés de l'application, lues par la fonction tiktok seulement
create function public.tiktok_cles() returns table (client_key text, client_secret text)
language sql stable security definer set search_path = '' as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'tiktok_client_key'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'tiktok_client_secret');
$$;
revoke all on function public.tiktok_cles() from public, anon, authenticated;
grant execute on function public.tiktok_cles() to service_role;

-- Compte TikTok connecté (une seule ligne) et ses jetons
create table public.tiktok_compte (
  id boolean primary key default true check (id),
  open_id text not null,
  nom text,
  avatar text,
  scope text,
  access_token text not null,
  access_expire_le timestamptz not null,
  refresh_token text not null,
  refresh_expire_le timestamptz not null,
  connecte_le timestamptz not null default now(),
  connecte_par uuid references auth.users(id) on delete set null
);
alter table public.tiktok_compte enable row level security;
revoke all on table public.tiktok_compte from anon, authenticated;

-- Jetons « state » de la connexion (protection contre la falsification de requête), valables 15 minutes
create table public.tiktok_etats (
  etat text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now()
);
alter table public.tiktok_etats enable row level security;
revoke all on table public.tiktok_etats from anon, authenticated;

-- Publications : chaque ligne est préparée (plan) puis validée par l'administrateur, qui choisit la confidentialité
-- et les interactions comme TikTok l'exige ; la fonction (action planif, toutes les cinq minutes) envoie les lignes
-- validées arrivées à leur heure, puis suit leur traitement chez TikTok.
create table public.tiktok_publications (
  id bigint generated always as identity primary key,
  prevue_le timestamptz not null,
  titre text not null,                                   -- nom de la vidéo dans l'administration
  legende text not null default '' check (char_length(legende) <= 2200),
  source text not null check (source ~ '^(assets/video|videos)/[a-z0-9-]+\.mp4$'), -- site public ou stockage privé
  mode text not null default 'direct' check (mode in ('direct', 'brouillon')),
  confidentialite text check (confidentialite in ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY')),
  commentaires boolean not null default false,
  duo boolean not null default false,
  collage boolean not null default false,
  marque_propre boolean not null default false,           -- « Votre marque » (promotion de sa propre activité)
  contenu_sponsorise boolean not null default false,      -- « Contenu de marque » (partenariat rémunéré)
  statut text not null default 'a_valider' check (statut in ('a_valider', 'programmee', 'envoi', 'traitement', 'publiee', 'brouillon_envoye', 'erreur', 'manquee', 'annulee')),
  valide_le timestamptz,
  valide_par uuid references auth.users(id) on delete set null,
  publish_id text,
  post_id text,
  erreur text,
  publiee_le timestamptz,
  cree_le timestamptz not null default now()
);
create index tiktok_publications_a_envoyer on public.tiktok_publications (prevue_le) where statut in ('programmee', 'traitement');
alter table public.tiktok_publications enable row level security;
revoke all on table public.tiktok_publications from anon;
revoke truncate, references, trigger on table public.tiktok_publications from authenticated;
create policy "tiktok_publications : lecture (admin)" on public.tiktok_publications for select to authenticated using ((select public.est_admin()));
create policy "tiktok_publications : ajout (admin)" on public.tiktok_publications for insert to authenticated with check ((select public.est_admin()));
create policy "tiktok_publications : modification (admin)" on public.tiktok_publications for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy "tiktok_publications : suppression (admin)" on public.tiktok_publications for delete to authenticated using ((select public.est_admin()));

-- Toutes les cinq minutes : envoi des publications validées arrivées à leur heure et suivi chez TikTok
select cron.schedule('tiktok-publications', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://iyftcjszvnaaakirlsdd.supabase.co/functions/v1/tiktok',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-import', (select decrypted_secret from vault.decrypted_secrets where name = 'textes_import')),
    body := '{"action":"planif"}'::jsonb,
    timeout_milliseconds := 120000);
$$);
