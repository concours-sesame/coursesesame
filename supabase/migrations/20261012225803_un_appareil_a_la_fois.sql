-- Espace abonnés : un compte ne s'utilise que sur un appareil à la fois
--
-- Chaque connexion (e-mail et mot de passe) ouvre une session Supabase Auth, dont l'identifiant figure
-- dans le jeton de l'abonné (champ « session_id »). Le site enregistre cette session comme l'appareil
-- du compte (prendre_appareil). Seule la dernière session enregistrée donne accès aux contenus et aux
-- fichiers : se connecter sur un nouvel appareil coupe l'accès de l'appareil précédent.
-- Les administrateurs ne sont pas concernés.

create table public.connexions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  cree_le timestamptz not null default now()
);
comment on table public.connexions is 'Appareils successifs de chaque compte : la dernière ligne est le seul appareil autorisé.';
create index connexions_user on public.connexions (user_id, id desc);

alter table public.connexions enable row level security;
revoke all on public.connexions from anon, authenticated;

-- Session de l'appelant, lue dans son jeton
create function public.session_appelant() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

-- Vrai si l'appelant utilise l'appareil enregistré pour son compte (ou si aucun n'est encore enregistré)
create function public.appareil_autorise() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.est_admin() or not exists (
    select 1 from (
      select c.session_id from public.connexions c
      where c.user_id = auth.uid() order by c.id desc limit 1) d
    where d.session_id is distinct from public.session_appelant());
$$;

-- Appelée par le site juste après une connexion : cet appareil devient celui du compte
create function public.prendre_appareil() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid := public.session_appelant();
begin
  if auth.uid() is null or v_session is null or public.est_admin() then return; end if;
  if exists (
    select 1 from (
      select c.session_id from public.connexions c
      where c.user_id = auth.uid() order by c.id desc limit 1) d
    where d.session_id = v_session) then
    return;
  end if;
  insert into public.connexions (user_id, session_id) values (auth.uid(), v_session);
end $$;

-- Appelée par le site à l'ouverture de la page et régulièrement : faux si le compte a été ouvert
-- sur un autre appareil depuis. Un compte encore sans appareil enregistré adopte celui-ci.
create function public.verifier_appareil() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.connexions where user_id = auth.uid()) then
    perform public.prendre_appareil();
  end if;
  return public.appareil_autorise();
end $$;

-- L'abonnement ne vaut que sur l'appareil enregistré : cette règle s'applique aux contenus
-- (règle d'accès de la table « contenus ») et aux fichiers (fichier_autorise)
create or replace function public.abonnement_actif() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.appareil_autorise() and exists (
    select 1 from public.abonnements
    where user_id = auth.uid() and public.aujourdhui() between debut and fin);
$$;

-- Administration : nombre d'appareils différents utilisés par chaque compte ces 7 derniers jours
-- (un nombre élevé peut révéler un compte partagé)
create function public.admin_appareils()
returns table (user_id uuid, appareils_7j bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  return query
    select c.user_id, count(distinct c.session_id)
    from public.connexions c
    where c.cree_le > now() - interval '7 days'
    group by c.user_id;
end $$;

revoke execute on function public.session_appelant(), public.appareil_autorise(), public.prendre_appareil(),
  public.verifier_appareil(), public.admin_appareils() from public, anon;
grant execute on function public.session_appelant(), public.appareil_autorise(), public.prendre_appareil(),
  public.verifier_appareil(), public.admin_appareils() to authenticated;
