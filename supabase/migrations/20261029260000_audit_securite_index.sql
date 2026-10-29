-- Contrôle de sécurité et de rapidité (29 octobre 2026)
-- 1) Contacts recueillis et publications Facebook : lecture réservée à l'administrateur AVEC la validation en deux
--    étapes (est_admin), comme le reste de l'administration ; la règle ne vérifiait que la table admins.
-- 2) Règles évaluées une seule fois par requête (select …) au lieu d'une fois par ligne.
-- 3) Index sur les clés étrangères qui n'en avaient pas.
drop policy if exists prospects_admin on public.prospects;
create policy prospects_admin on public.prospects for select to authenticated using ((select public.est_admin()));
drop policy if exists facebook_publications_admin on public.facebook_publications;
create policy facebook_publications_admin on public.facebook_publications for select to authenticated using ((select public.est_admin()));
drop policy if exists copies_vip_lecture on public.copies_vip;
create policy copies_vip_lecture on public.copies_vip for select to authenticated
  using (user_id = (select auth.uid()) or (select public.est_admin()));

create index if not exists cartes_progres_carte_id_idx on public.cartes_progres (carte_id);
create index if not exists commandes_cree_par_idx on public.commandes (cree_par);
create index if not exists concours_blancs_corrige_id_idx on public.concours_blancs (corrige_id);
create index if not exists copies_blanc_echange_id_idx on public.copies_blanc (echange_id);
create index if not exists copies_blanc_user_id_idx on public.copies_blanc (user_id);
create index if not exists copies_vip_corrigee_par_idx on public.copies_vip (corrigee_par);
create index if not exists demandes_activation_traitee_par_idx on public.demandes_activation (traitee_par);
create index if not exists grand_oral_contenu_id_idx on public.grand_oral (contenu_id);
create index if not exists journal_admin_auteur_idx on public.journal_admin (auteur);
create index if not exists pages_lues_contenu_id_idx on public.pages_lues (contenu_id);
create index if not exists parrainages_abonnement_id_idx on public.parrainages (abonnement_id);
create index if not exists parrainages_parrain_id_idx on public.parrainages (parrain_id);
create index if not exists profils_parrain_id_idx on public.profils (parrain_id);
create index if not exists qcm_progres_contenu_id_idx on public.qcm_progres (contenu_id);
create index if not exists telechargements_contenu_id_idx on public.telechargements (contenu_id);
create index if not exists visites_user_id_idx on public.visites (user_id);
