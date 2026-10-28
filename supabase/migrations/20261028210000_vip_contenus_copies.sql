-- Espace VIP, contenus exclusifs :
-- 1. contenus.vip : un document réservé à l'espace VIP (banque de plans, grand oral, veille juridique, codes
--    consolidés…). Seule une période VIP l'ouvre (fichier_autorise) ; les VIP sont toujours des documents PDF, lus
--    page par page par la fonction pages, jamais des fiches « texte » dont le contenu serait lisible dans la table.
-- 2. copies_vip : une copie par mois civil, déposée par l'abonné VIP (texte tapé ou photos et PDF dans
--    exclusif/copies/<abonné>/), corrigée et notée sur 20 par un correcteur depuis l'administration.
-- La migration n'efface ni ne réécrit rien.

alter table public.contenus add column vip boolean not null default false;
comment on column public.contenus.vip is 'Contenu réservé à l''espace VIP (document PDF).';

create or replace function public.fichier_autorise(chemin text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.est_admin() or (
    public.abonnement_actif()
    and exists (
      select 1 from public.contenus c
      where c.fichier = chemin and c.publie and c.publie_le <= now()
        and (not public.est_ouvrage(c.matiere) or public.acces_ouvrages())
        and (c.type <> 'video' or public.acces_videos())
        and (not c.vip or public.acces_vip())));
$$;

create table public.copies_vip (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profils (id) on delete cascade,
  cree_le timestamptz not null default now(),
  epreuve text not null check (epreuve in ('dissertation', 'cas_pratique', 'commentaire', 'note_synthese', 'sog', 'autre')),
  sujet text not null check (char_length(sujet) between 5 and 4000),
  texte text check (char_length(texte) <= 60000),
  fichiers text[] not null default '{}',
  statut text not null default 'deposee' check (statut in ('deposee', 'corrigee')),
  note numeric(4, 2) check (note between 0 and 20),
  appreciation text check (char_length(appreciation) <= 4000),
  correction text check (char_length(correction) <= 60000),
  fichier_corrige text,
  corrigee_le timestamptz,
  corrigee_par uuid references auth.users (id) on delete set null,
  check (texte is not null or cardinality(fichiers) > 0)
);
create index copies_vip_user on public.copies_vip (user_id, cree_le desc);
create index copies_vip_a_corriger on public.copies_vip (cree_le) where statut = 'deposee';
alter table public.copies_vip enable row level security;
revoke all on table public.copies_vip from anon, authenticated;
create policy copies_vip_lecture on public.copies_vip for select to authenticated
  using (user_id = auth.uid() or (select public.est_admin()));
grant select on table public.copies_vip to authenticated;

-- Dépôt : abonné VIP en cours, une copie par mois civil (heure d'Abidjan), fichiers rangés dans son propre dossier
create function public.deposer_copie_vip(p_epreuve text, p_sujet text, p_texte text default null, p_fichiers text[] default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  f text;
begin
  if v_uid is null or not public.acces_vip() then
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
revoke all on function public.deposer_copie_vip(text, text, text, text[]) from public, anon;
grant execute on function public.deposer_copie_vip(text, text, text, text[]) to authenticated;

-- Correction par l'administrateur (ou le correcteur qu'il désigne parmi les administrateurs)
create function public.admin_corriger_copie(p_id bigint, p_note numeric, p_appreciation text, p_correction text default null,
  p_fichier_corrige text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Accès réservé à l''administrateur' using errcode = '42501';
  end if;
  if p_note is null or p_note < 0 or p_note > 20 then raise exception 'Note sur 20 attendue.'; end if;
  update public.copies_vip
     set note = p_note, appreciation = nullif(btrim(coalesce(p_appreciation, '')), ''), correction = nullif(btrim(coalesce(p_correction, '')), ''),
         fichier_corrige = coalesce(nullif(btrim(coalesce(p_fichier_corrige, '')), ''), fichier_corrige),
         statut = 'corrigee', corrigee_le = now(), corrigee_par = auth.uid()
   where id = p_id;
  if not found then raise exception 'Copie introuvable.'; end if;
end $$;
revoke all on function public.admin_corriger_copie(bigint, numeric, text, text, text) from public, anon;
grant execute on function public.admin_corriger_copie(bigint, numeric, text, text, text) to authenticated;

-- Stockage : l'abonné VIP dépose et relit ses propres fichiers (exclusif/copies/<abonné>/…) ; l'administrateur lit tout
-- (règle existante « exclusif : lecture ») et dépose le corrigé annoté (règle existante « exclusif : ajout (admin) »)
create policy "exclusif : copies VIP, dépôt" on storage.objects for insert to authenticated
  with check (bucket_id = 'exclusif' and name like 'copies/' || auth.uid()::text || '/%' and (select public.acces_vip()));
create policy "exclusif : copies VIP, lecture" on storage.objects for select to authenticated
  using (bucket_id = 'exclusif' and name like 'copies/' || auth.uid()::text || '/%');
