-- Notifications sur le téléphone (Web Push) : l'abonné qui les active reçoit une notification à la sortie de chaque
-- vidéo du jour (19 h). Abonnements du navigateur dans push_abonnements (chacun gère les siens) ; clés VAPID dans le
-- coffre (push_vapid), créées une fois par la fonction notifications ; la clé publique seule est lisible par le site.
create table if not exists public.push_abonnements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  cree_le timestamptz not null default now()
);
create index if not exists push_abonnements_user on public.push_abonnements (user_id);
alter table public.push_abonnements enable row level security;
revoke all on table public.push_abonnements from anon;
revoke truncate, references, trigger, update on table public.push_abonnements from authenticated;
grant select, insert, delete on table public.push_abonnements to authenticated;
create policy "push : lecture (les siens)" on public.push_abonnements for select to authenticated using (user_id = (select auth.uid()));
create policy "push : ajout (les siens)" on public.push_abonnements for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push : suppression (les siens)" on public.push_abonnements for delete to authenticated using (user_id = (select auth.uid()));

-- Clé publique VAPID (lisible par tous : elle sert au navigateur à s'abonner)
create or replace function public.push_cle_publique()
 returns text language sql stable security definer set search_path to ''
as $$ select (decrypted_secret::jsonb)->>'publicKey' from vault.decrypted_secrets where name = 'push_vapid' $$;
grant execute on function public.push_cle_publique() to anon, authenticated;

-- Clés complètes et enregistrement : réservés à la fonction notifications (clé secrète)
create or replace function public.push_cles()
 returns jsonb language sql stable security definer set search_path to ''
as $$ select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'push_vapid' $$;
create or replace function public.push_enregistrer_cles(p_cles jsonb)
 returns boolean language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'push_vapid') then return false; end if;
  perform vault.create_secret(p_cles::text, 'push_vapid', 'Clés VAPID des notifications Web Push');
  return true;
end $$;
revoke all on function public.push_cles() from public, anon, authenticated;
revoke all on function public.push_enregistrer_cles(jsonb) from public, anon, authenticated;
grant execute on function public.push_cles() to service_role;
grant execute on function public.push_enregistrer_cles(jsonb) to service_role;

-- Destinataires : abonnements des abonnés en cours (ou administrateurs)
create or replace function public.push_destinataires()
 returns table(id bigint, endpoint text, p256dh text, auth text)
 language sql stable security definer set search_path to ''
as $$
  select p.id, p.endpoint, p.p256dh, p.auth from public.push_abonnements p
  where exists (select 1 from public.abonnements a where a.user_id = p.user_id and a.supprime_le is null
                  and public.aujourdhui() between a.debut and a.fin)
     or exists (select 1 from public.admins d where d.user_id = p.user_id);
$$;
revoke all on function public.push_destinataires() from public, anon, authenticated;
grant execute on function public.push_destinataires() to service_role;

-- Vidéos déjà annoncées (une notification par vidéo, même si la tâche repasse)
create table if not exists public.push_envois (
  contenu_id bigint primary key references public.contenus(id) on delete cascade,
  envoye_le timestamptz not null default now(),
  envoyes int not null default 0,
  echecs int not null default 0
);
alter table public.push_envois enable row level security;
revoke all on table public.push_envois from anon, authenticated;
