-- Accès particuliers : l'administrateur ouvre à un abonné en formule normale une partie de l'espace VIP,
-- sans le passer en VIP.
--   copies   : la copie corrigée et notée du mois (dépôt, fichiers, correction)
--   ouvrages : les ouvrages complets, sauf les Codes commentés (ouvrages VVIP) et les Annales
-- L'accès vaut tant qu'un abonnement est en cours, jusqu'à la date « jusqu_au » (sans date : sans limite).
-- Les vidéos réservées, les documents VIP, les cartes, le plan de révision et le classement restent au VIP.

create table if not exists public.acces_particuliers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  copies boolean not null default false,
  ouvrages boolean not null default false,
  jusqu_au date,
  note text,
  cree_le timestamptz not null default now(),
  cree_par uuid
);
alter table public.acces_particuliers enable row level security;
create policy "acces_particuliers : lecture (titulaire, admin)" on public.acces_particuliers for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));

-- Ouvrages que l'accès particulier n'ouvre jamais : les Codes commentés (« …, ouvrage VVIP ») et les Annales
create or replace function public.ouvrage_reserve_vip(p_titre text, p_matiere text)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(p_titre ~* '\mVVIP\M', false) or coalesce(p_titre ~* '\mannales\M', false) or coalesce(p_matiere ~* '\mannales\M', false);
$$;

create or replace function public.acces_particulier(p_droit text)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.abonnement_actif() and exists (
    select 1 from public.acces_particuliers a
    where a.user_id = auth.uid() and (a.jusqu_au is null or public.aujourdhui() <= a.jusqu_au)
      and case p_droit when 'copies' then a.copies when 'ouvrages' then a.ouvrages else false end);
$$;
revoke execute on function public.acces_particulier(text) from public, anon;
grant execute on function public.acces_particulier(text) to authenticated;

-- Lecture des fichiers : un ouvrage s'ouvre aussi par l'accès particulier, sauf Codes commentés et Annales
create or replace function public.fichier_autorise(chemin text)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie and public.contenu_ouvert(c.publie_le, c.avant_premiere)
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages()
             or (public.acces_particulier('ouvrages') and not public.ouvrage_reserve_vip(c.titre, c.matiere)))
        and (c.type <> 'video' or c.video_ouverte or public.acces_videos())
        and (not c.vip or public.acces_vip())));
$$;

-- Copie corrigée du mois : VIP ou accès particulier
create or replace function public.deposer_copie_vip(p_epreuve text, p_sujet text, p_texte text default null, p_fichiers text[] default '{}')
returns bigint language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  f text;
begin
  if v_uid is null or not (public.acces_vip() or public.acces_particulier('copies')) then
    raise exception 'Réservé aux abonnés VIP' using errcode = '42501';
  end if;
  if exists (select 1 from public.copies_vip c where c.user_id = v_uid
             and date_trunc('month', c.cree_le at time zone 'Africa/Abidjan') = date_trunc('month', now() at time zone 'Africa/Abidjan')) then
    raise exception 'Vous avez déjà déposé votre copie de ce mois. La prochaine pourra l''être le 1er du mois prochain.';
  end if;
  if cardinality(coalesce(p_fichiers, '{}')) > 8 then raise exception 'Huit fichiers au plus.'; end if;
  foreach f in array coalesce(p_fichiers, '{}') loop
    if f !~ ('^copies/' || v_uid::text || '/[A-Za-z0-9._-]{1,120}$') then raise exception 'Fichier invalide.'; end if;
  end loop;
  insert into public.copies_vip (user_id, epreuve, sujet, texte, fichiers)
  values (v_uid, p_epreuve, btrim(p_sujet), nullif(btrim(coalesce(p_texte, '')), ''), coalesce(p_fichiers, '{}'))
  returning id into v_id;
  return v_id;
end $$;

drop policy if exists "exclusif : copies VIP, dépôt" on storage.objects;
create policy "exclusif : copies VIP, dépôt" on storage.objects for insert to authenticated
  with check (bucket_id = 'exclusif' and name like 'copies/' || auth.uid()::text || '/%'
              and ((select public.acces_vip()) or (select public.acces_particulier('copies'))));

-- Administration : ouvrir, modifier ou retirer un accès particulier
create or replace function public.admin_acces_particulier(p_user uuid, p_copies boolean, p_ouvrages boolean, p_jusqu_au date default null, p_note text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not public.est_admin() then raise exception 'Réservé à l''administrateur' using errcode = '42501'; end if;
  if not p_copies and not p_ouvrages then
    delete from public.acces_particuliers where user_id = p_user;
  else
    insert into public.acces_particuliers (user_id, copies, ouvrages, jusqu_au, note, cree_par)
    values (p_user, p_copies, p_ouvrages, p_jusqu_au, p_note, auth.uid())
    on conflict (user_id) do update set copies = excluded.copies, ouvrages = excluded.ouvrages,
      jusqu_au = excluded.jusqu_au, note = excluded.note, cree_par = excluded.cree_par, cree_le = now();
  end if;
  insert into public.journal_admin (auteur, action, cible, details)
  values (auth.uid(), 'acces_particulier', p_user, jsonb_build_object('copies', p_copies, 'ouvrages', p_ouvrages, 'jusqu_au', p_jusqu_au));
end $$;
revoke execute on function public.admin_acces_particulier(uuid, boolean, boolean, date, text) from public, anon;
grant execute on function public.admin_acces_particulier(uuid, boolean, boolean, date, text) to authenticated;
