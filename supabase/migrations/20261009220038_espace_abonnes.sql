-- Espace abonnés des Cours Sésame et SAJ
--
-- Comptes : Supabase Auth (auth.users). Profils, abonnements et contenus : schéma public,
-- protégés par des règles d'accès (RLS). Fichiers exclusifs : compartiment privé « exclusif ».
-- Aucun contenu exclusif ne se trouve dans le dépôt du site : seuls les abonnés en cours
-- (et l'administrateur) peuvent lire les contenus et obtenir un lien temporaire vers un fichier.
--
-- Les droits sont ensuite resserrés par 20261009221801_espace_abonnes_droits.sql.
--
-- Pour désigner l'administrateur, une fois son compte créé sur le site :
--   insert into public.admins (user_id) select id from auth.users where email = 'adresse@exemple.com';

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  prenom text not null check (char_length(prenom) between 1 and 60),
  nom text not null check (char_length(nom) between 1 and 60),
  telephone text not null check (telephone ~ '^\+?[0-9]{8,15}$'),
  concours text check (concours in ('infj', 'greffe', 'penitentiaire', 'eppjej', 'ena', 'autre')),
  cree_le timestamptz not null default now()
);
comment on table public.profils is 'Profil de chaque titulaire de compte (créé automatiquement à l''inscription).';

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
comment on table public.admins is 'Comptes autorisés à gérer les abonnés et les contenus.';

create table public.abonnements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profils (id) on delete cascade,
  debut date not null,
  fin date not null,
  montant integer check (montant >= 0),
  moyen text check (char_length(moyen) <= 40),
  note text check (char_length(note) <= 300),
  cree_le timestamptz not null default now(),
  cree_par uuid references auth.users (id) on delete set null,
  constraint abonnements_periode check (debut <= fin)
);
comment on table public.abonnements is 'Périodes d''abonnement payées (dates incluses, heure d''Abidjan).';
create index abonnements_user_fin on public.abonnements (user_id, fin desc);

create table public.contenus (
  id bigint generated always as identity primary key,
  titre text not null check (char_length(titre) between 2 and 160),
  description text check (char_length(description) <= 600),
  type text not null check (type in ('video', 'pdf', 'texte', 'lien')),
  fichier text check (char_length(fichier) <= 300),
  texte text check (char_length(texte) <= 60000),
  lien text check (lien ~* '^https?://' and char_length(lien) <= 500),
  concours text[] not null default '{}',
  matiere text check (char_length(matiere) <= 80),
  publie boolean not null default false,
  publie_le timestamptz not null default now(),
  cree_le timestamptz not null default now(),
  constraint contenus_support check (
    (type in ('video', 'pdf') and fichier is not null)
    or (type = 'texte' and texte is not null)
    or (type = 'lien' and lien is not null))
);
comment on table public.contenus is 'Contenus exclusifs. « fichier » : chemin dans le compartiment privé « exclusif ».';
create index contenus_publies on public.contenus (publie, publie_le desc);

create table public.journal_inscriptions (
  id bigint generated always as identity primary key,
  ip text not null,
  cree_le timestamptz not null default now()
);
comment on table public.journal_inscriptions is 'Inscriptions récentes par adresse IP, pour limiter les abus (fonction « inscription »).';
create index journal_inscriptions_ip on public.journal_inscriptions (ip, cree_le desc);

-- ---------------------------------------------------------------------------
-- 2. Fonctions de contrôle
-- ---------------------------------------------------------------------------

-- Date du jour à Abidjan (UTC toute l'année)
create function public.aujourdhui() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Abidjan')::date;
$$;

create function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create function public.abonnement_actif() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.abonnements
    where user_id = auth.uid() and public.aujourdhui() between debut and fin);
$$;

-- Un fichier du compartiment « exclusif » n'est lisible que par l'administrateur,
-- ou par un abonné en cours s'il appartient à un contenu publié.
create function public.fichier_autorise(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (select 1 from public.contenus where fichier = chemin and publie));
$$;

-- Profil créé pour tout compte confirmé, à partir des informations transmises par la fonction
-- « inscription » (qui crée des comptes déjà confirmés). Un compte ouvert directement auprès de
-- Supabase Auth sans confirmation n'a pas de profil : il n'apparaît nulle part et ne sert à rien.
-- La fonction ne doit jamais faire échouer la création du compte : les valeurs sont nettoyées.
create function public.creer_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  tel text := regexp_replace(coalesce(m ->> 'telephone', ''), '[^0-9+]', '', 'g');
  conc text := m ->> 'concours';
begin
  if new.email_confirmed_at is null then return new; end if;
  if tel !~ '^\+?[0-9]{8,15}$' then tel := '00000000'; end if;
  if conc is not null and conc not in ('infj', 'greffe', 'penitentiaire', 'eppjej', 'ena', 'autre') then conc := null; end if;
  insert into public.profils (id, prenom, nom, telephone, concours)
  values (
    new.id,
    left(coalesce(nullif(btrim(m ->> 'prenom'), ''), 'Abonné'), 60),
    left(coalesce(nullif(btrim(m ->> 'nom'), ''), '-'), 60),
    tel,
    conc)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger creer_profil_apres_inscription
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.creer_profil();

-- ---------------------------------------------------------------------------
-- 3. Règles d'accès (RLS)
-- ---------------------------------------------------------------------------

alter table public.profils enable row level security;
alter table public.admins enable row level security;
alter table public.abonnements enable row level security;
alter table public.contenus enable row level security;
alter table public.journal_inscriptions enable row level security;

-- Les visiteurs non connectés n'accèdent à aucune table ; les comptes connectés selon les règles ci-dessous.
revoke all on public.profils, public.admins, public.abonnements, public.contenus, public.journal_inscriptions from anon;
revoke all on public.journal_inscriptions from authenticated;
revoke insert, update, delete on public.profils, public.admins, public.abonnements from authenticated;
grant update (prenom, nom, telephone, concours) on public.profils to authenticated;

create policy "profils : lecture (titulaire ou admin)" on public.profils
  for select to authenticated using (id = (select auth.uid()) or (select public.est_admin()));
create policy "profils : modification (titulaire)" on public.profils
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "admins : lecture de sa propre ligne" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "abonnements : lecture (titulaire ou admin)" on public.abonnements
  for select to authenticated using (user_id = (select auth.uid()) or (select public.est_admin()));

create policy "contenus : lecture (abonnés en cours, admin)" on public.contenus
  for select to authenticated using ((select public.est_admin()) or (publie and (select public.abonnement_actif())));
create policy "contenus : ajout (admin)" on public.contenus
  for insert to authenticated with check ((select public.est_admin()));
create policy "contenus : modification (admin)" on public.contenus
  for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy "contenus : suppression (admin)" on public.contenus
  for delete to authenticated using ((select public.est_admin()));

-- ---------------------------------------------------------------------------
-- 4. Fonctions appelées par le site
-- ---------------------------------------------------------------------------

-- État de l'abonnement du compte connecté
create function public.mon_abonnement()
returns table (actif boolean, fin date, deja_abonne boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.abonnements a where a.user_id = auth.uid() and public.aujourdhui() between a.debut and a.fin),
    (select max(a.fin) from public.abonnements a where a.user_id = auth.uid()),
    exists (select 1 from public.abonnements a where a.user_id = auth.uid());
$$;

-- Titres des contenus publiés, montrés à tous comme aperçu (sans le contenu lui-même)
create function public.apercu_contenus()
returns table (id bigint, titre text, description text, type text, concours text[], matiere text, publie_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.titre, c.description, c.type, c.concours, c.matiere, c.publie_le
  from public.contenus c
  where c.publie
  order by c.publie_le desc
  limit 60;
$$;

-- Administration : liste des comptes (hors administrateurs) avec l'état de leur abonnement
create function public.admin_liste_abonnes()
returns table (user_id uuid, prenom text, nom text, telephone text, email text, concours text,
               inscrit_le timestamptz, fin date, actif boolean, nb_paiements bigint, total_paye bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select p.id, p.prenom, p.nom, p.telephone, u.email::text, p.concours, p.cree_le,
           max(a.fin),
           coalesce(bool_or(public.aujourdhui() between a.debut and a.fin), false),
           count(a.id),
           coalesce(sum(a.montant), 0)::bigint
    from public.profils p
    join auth.users u on u.id = p.id
    left join public.abonnements a on a.user_id = p.id
    where not exists (select 1 from public.admins ad where ad.user_id = p.id)
    group by p.id, u.email
    order by p.cree_le desc;
end $$;

-- Administration : activer ou prolonger un abonnement (à la suite de la période en cours)
create function public.admin_activer(
  p_user uuid, p_mois integer default 1, p_jusqu_au date default null,
  p_montant integer default null, p_moyen text default null, p_note text default null)
returns date
language plpgsql security definer set search_path = '' as $$
declare
  v_fin_actuelle date;
  v_debut date;
  v_fin date;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profils where id = p_user) then
    raise exception 'Compte introuvable';
  end if;
  select max(fin) into v_fin_actuelle from public.abonnements where user_id = p_user;
  v_debut := greatest(public.aujourdhui(), coalesce(v_fin_actuelle + 1, public.aujourdhui()));
  if p_jusqu_au is not null then
    if p_jusqu_au < v_debut then
      raise exception 'La date de fin doit être au plus tôt le %', to_char(v_debut, 'DD/MM/YYYY');
    end if;
    v_fin := p_jusqu_au;
  else
    if p_mois is null or p_mois < 1 or p_mois > 24 then
      raise exception 'Durée invalide (de 1 à 24 mois)';
    end if;
    v_fin := (v_debut + make_interval(months => p_mois))::date - 1;
  end if;
  insert into public.abonnements (user_id, debut, fin, montant, moyen, note, cree_par)
  values (p_user, v_debut, v_fin, p_montant, nullif(btrim(p_moyen), ''), nullif(btrim(p_note), ''), auth.uid());
  return v_fin;
end $$;

-- Administration : couper l'accès dès aujourd'hui (l'historique des paiements est conservé)
create function public.admin_couper(p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  update public.abonnements
  set fin = public.aujourdhui() - 1,
      debut = least(debut, public.aujourdhui() - 1),
      note = left(concat_ws(' · ', note, 'Accès coupé le ' || to_char(public.aujourdhui(), 'DD/MM/YYYY')), 300)
  where user_id = p_user and fin >= public.aujourdhui();
end $$;

-- Administration : historique des paiements (d'un compte, ou de tous)
create function public.admin_paiements(p_user uuid default null)
returns table (id bigint, user_id uuid, prenom text, nom text, debut date, fin date,
               montant integer, moyen text, note text, cree_le timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select a.id, a.user_id, p.prenom, p.nom, a.debut, a.fin, a.montant, a.moyen, a.note, a.cree_le
    from public.abonnements a join public.profils p on p.id = a.user_id
    where p_user is null or a.user_id = p_user
    order by a.cree_le desc
    limit 500;
end $$;

-- Droits d'exécution : les fonctions d'administration ne sont jamais ouvertes aux visiteurs
revoke execute on function public.creer_profil() from public, anon, authenticated;
revoke execute on function public.admin_liste_abonnes() from public, anon;
revoke execute on function public.admin_activer(uuid, integer, date, integer, text, text) from public, anon;
revoke execute on function public.admin_couper(uuid) from public, anon;
revoke execute on function public.admin_paiements(uuid) from public, anon;
revoke execute on function public.mon_abonnement() from public, anon;
grant execute on function public.admin_liste_abonnes(), public.admin_activer(uuid, integer, date, integer, text, text),
  public.admin_couper(uuid), public.admin_paiements(uuid), public.mon_abonnement() to authenticated;
grant execute on function public.apercu_contenus(), public.est_admin(), public.abonnement_actif(),
  public.fichier_autorise(text), public.aujourdhui() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Compartiment privé des fichiers exclusifs
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exclusif', 'exclusif', false, 52428800,
        array['video/mp4', 'video/webm', 'application/pdf', 'audio/mpeg', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false;

create policy "exclusif : lecture (fichiers autorisés)" on storage.objects
  for select to authenticated using (bucket_id = 'exclusif' and public.fichier_autorise(name));
create policy "exclusif : ajout (admin)" on storage.objects
  for insert to authenticated with check (bucket_id = 'exclusif' and (select public.est_admin()));
create policy "exclusif : modification (admin)" on storage.objects
  for update to authenticated using (bucket_id = 'exclusif' and (select public.est_admin()))
  with check (bucket_id = 'exclusif' and (select public.est_admin()));
create policy "exclusif : suppression (admin)" on storage.objects
  for delete to authenticated using (bucket_id = 'exclusif' and (select public.est_admin()));
