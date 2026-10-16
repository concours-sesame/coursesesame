-- Outils d'administration : commandes d'ouvrages, notes privées sur les abonnés, statistiques de lecture,
-- annonces aux abonnés, publication programmée, journal des actions, déconnexion forcée et ménage des comptes.
-- Toutes les nouvelles tables sont protégées par RLS ; seules les annonces sont lisibles par les abonnés.

-- ---------------------------------------------------------------------------
-- 1. Publication programmée : un contenu publié n'apparaît aux abonnés qu'à partir de « publie_le »
-- ---------------------------------------------------------------------------

alter policy "contenus : lecture (abonnés en cours, admin)" on public.contenus
  using ((select public.est_admin()) or (
    publie and publie_le <= now() and (select public.abonnement_actif())
    and (type in ('pdf', 'video') or not public.est_ouvrage(matiere) or (select public.acces_ouvrages()))));

create or replace function public.fichier_autorise(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie and c.publie_le <= now()
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages())));
$$;

create or replace function public.apercu_contenus()
returns table(id bigint, titre text, description text, type text, concours text[], matiere text, publie_le timestamp with time zone)
language sql stable security definer set search_path = '' as $$
  select c.id, c.titre, c.description, c.type, c.concours, c.matiere, c.publie_le
  from public.contenus c
  where c.publie and c.publie_le <= now()
  order by c.publie_le desc
  limit 1000;
$$;

-- ---------------------------------------------------------------------------
-- 2. Commandes d'ouvrages papier (reçues sur WhatsApp, saisies par l'administrateur)
-- ---------------------------------------------------------------------------

create table public.commandes (
  id bigint generated always as identity primary key,
  client text not null check (char_length(client) between 1 and 120),
  telephone text check (char_length(telephone) <= 30),
  ville text check (char_length(ville) <= 80),
  lignes jsonb not null default '[]' check (jsonb_typeof(lignes) = 'array'),
  montant integer not null default 0 check (montant >= 0),
  moyen text check (char_length(moyen) <= 40),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'payee', 'expediee', 'livree', 'annulee')),
  note text check (char_length(note) <= 500),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  cree_par uuid references auth.users (id) on delete set null
);
comment on table public.commandes is 'Commandes d''ouvrages papier. « lignes » : [{ouvrage, prix, qte}], montant total après remise.';
create index commandes_cree_le on public.commandes (cree_le desc);
alter table public.commandes enable row level security;
create policy "commandes : admin" on public.commandes for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
grant select, insert, update, delete on public.commandes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Notes privées sur un abonné (jamais visibles par l'abonné)
-- ---------------------------------------------------------------------------

create table public.notes_abonnes (
  user_id uuid primary key references public.profils (id) on delete cascade,
  note text not null check (char_length(note) <= 1000),
  maj_le timestamptz not null default now()
);
alter table public.notes_abonnes enable row level security;
create policy "notes : admin" on public.notes_abonnes for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
grant select, insert, update, delete on public.notes_abonnes to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lectures : chaque ouverture d'un contenu par un abonné (au plus une par contenu toutes les 10 minutes)
-- ---------------------------------------------------------------------------

create table public.lectures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  contenu_id bigint not null references public.contenus (id) on delete cascade,
  ouvert_le timestamptz not null default now()
);
create index lectures_contenu on public.lectures (contenu_id, ouvert_le desc);
create index lectures_user on public.lectures (user_id, ouvert_le desc);
alter table public.lectures enable row level security;
create policy "lectures : lecture admin" on public.lectures for select to authenticated using ((select public.est_admin()));
grant select on public.lectures to authenticated;

create function public.noter_lecture(p_contenu bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.est_admin() then return; end if;
  if not exists (select 1 from public.contenus where id = p_contenu and publie) then return; end if;
  if exists (select 1 from public.lectures where user_id = auth.uid() and contenu_id = p_contenu
             and ouvert_le > now() - interval '10 minutes') then return; end if;
  insert into public.lectures (user_id, contenu_id) values (auth.uid(), p_contenu);
end $$;
revoke all on function public.noter_lecture(bigint) from public, anon;
grant execute on function public.noter_lecture(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Annonces affichées en tête de l'espace abonnés
-- ---------------------------------------------------------------------------

create table public.annonces (
  id bigint generated always as identity primary key,
  texte text not null check (char_length(texte) between 2 and 400),
  lien text check (lien ~* '^https?://' and char_length(lien) <= 500),
  debut date not null default public.aujourdhui(),
  fin date,
  active boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint annonces_periode check (fin is null or debut <= fin)
);
alter table public.annonces enable row level security;
create policy "annonces : lecture (comptes connectés)" on public.annonces for select to authenticated
  using ((select public.est_admin()) or (active and public.aujourdhui() >= debut and (fin is null or public.aujourdhui() <= fin)));
create policy "annonces : ajout (admin)" on public.annonces for insert to authenticated with check ((select public.est_admin()));
create policy "annonces : modification (admin)" on public.annonces for update to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
create policy "annonces : suppression (admin)" on public.annonces for delete to authenticated using ((select public.est_admin()));
grant select, insert, update, delete on public.annonces to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Journal des actions (abonnements, suspensions, contenus, commandes, comptes)
-- ---------------------------------------------------------------------------

create table public.journal_admin (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  auteur uuid references auth.users (id) on delete set null,
  action text not null,
  cible uuid,
  objet bigint,
  details jsonb
);
create index journal_admin_quand on public.journal_admin (quand desc);
alter table public.journal_admin enable row level security;
create policy "journal : lecture admin" on public.journal_admin for select to authenticated using ((select public.est_admin()));
grant select on public.journal_admin to authenticated;

-- Une instruction par table : PL/pgSQL ne prépare que la branche exécutée (les champs diffèrent d'une table à l'autre)
create function public.journaliser() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ligne jsonb := to_jsonb(coalesce(new, old)) - 'texte';
  v_action text;
begin
  if tg_table_name = 'abonnements' then
    if tg_op = 'INSERT' then v_action := 'abonnement_active';
    elsif new.supprime_le is not null and old.supprime_le is null then v_action := 'abonnement_supprime';
    elsif new.fin < old.fin then v_action := 'acces_coupe';
    else v_action := 'abonnement_modifie'; end if;
  elsif tg_table_name = 'suspensions' then
    if tg_op = 'INSERT' then v_action := 'abonnement_suspendu'; else v_action := 'abonnement_reactive'; end if;
  elsif tg_table_name = 'contenus' then
    if tg_op = 'INSERT' then v_action := 'contenu_ajoute';
    elsif tg_op = 'DELETE' then v_action := 'contenu_supprime';
    elsif new.publie and not old.publie then v_action := 'contenu_publie';
    elsif old.publie and not new.publie then v_action := 'contenu_retire';
    else v_action := 'contenu_modifie'; end if;
  elsif tg_table_name = 'commandes' then
    if tg_op = 'INSERT' then v_action := 'commande_ajoutee';
    elsif tg_op = 'DELETE' then v_action := 'commande_supprimee';
    elsif new.statut is distinct from old.statut then v_action := 'commande_' || new.statut;
    else v_action := 'commande_modifiee'; end if;
  else
    v_action := lower(tg_table_name || '_' || tg_op);
  end if;
  insert into public.journal_admin (auteur, action, cible, objet, details)
  values (auth.uid(), v_action,
          case when tg_table_name in ('abonnements', 'suspensions') then (v_ligne ->> 'user_id')::uuid end,
          (v_ligne ->> 'id')::bigint, v_ligne);
  return coalesce(new, old);
end $$;

-- Fonction de déclencheur : jamais appelée directement par l'API
revoke all on function public.journaliser() from public, anon, authenticated;

create trigger journal_abonnements after insert or update on public.abonnements
  for each row execute function public.journaliser();
create trigger journal_suspensions after insert or update on public.suspensions
  for each row execute function public.journaliser();
create trigger journal_contenus after insert or update or delete on public.contenus
  for each row execute function public.journaliser();
create trigger journal_commandes after insert or update or delete on public.commandes
  for each row execute function public.journaliser();

-- ---------------------------------------------------------------------------
-- 7. Déconnexion forcée et suppression des comptes jamais activés
-- ---------------------------------------------------------------------------

-- Coupe l'accès de tous les appareils du compte, dans la minute : l'appareil enregistré est remplacé par un
-- appareil fictif, la session en cours n'est donc plus reconnue (appareil_autorise). L'abonné peut se
-- reconnecter avec son mot de passe ; son abonnement n'est pas touché.
create function public.admin_deconnecter(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then
    raise exception 'Un administrateur ne peut pas être déconnecté ainsi' using errcode = '42501';
  end if;
  insert into public.connexions (user_id, session_id) values (p_user, gen_random_uuid());
  insert into public.journal_admin (auteur, action, cible) values (auth.uid(), 'compte_deconnecte', p_user);
end $$;

-- Supprime un compte qui n'a jamais eu d'abonnement (faux compte, inscription en double)
create function public.admin_supprimer_compte(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then
    raise exception 'Un compte administrateur ne peut pas être supprimé ici' using errcode = '42501';
  end if;
  if exists (select 1 from public.abonnements where user_id = p_user) then
    raise exception 'Ce compte a déjà eu un abonnement : il est conservé' using errcode = '42501';
  end if;
  select email into v_email from auth.users where id = p_user;
  delete from auth.users where id = p_user;
  insert into public.journal_admin (auteur, action, details)
  values (auth.uid(), 'compte_supprime', jsonb_build_object('email', v_email));
end $$;

revoke all on function public.admin_deconnecter(uuid) from public, anon;
revoke all on function public.admin_supprimer_compte(uuid) from public, anon;
grant execute on function public.admin_deconnecter(uuid) to authenticated;
grant execute on function public.admin_supprimer_compte(uuid) to authenticated;
