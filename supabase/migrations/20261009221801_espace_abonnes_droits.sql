-- Espace abonnés : droits resserrés après la mise en service (alertes du conseiller de sécurité Supabase)

-- Les fonctions qui servent aux règles d'accès ne concernent que les comptes connectés :
-- un visiteur non connecté ne peut plus les appeler. L'aperçu des titres (apercu_contenus) reste public.
revoke execute on function public.est_admin(), public.abonnement_actif(), public.fichier_autorise(text) from public, anon;
grant execute on function public.est_admin(), public.abonnement_actif(), public.fichier_autorise(text) to authenticated;

-- Index de la clé étrangère « cree_par » (utile à la suppression d'un compte administrateur)
create index if not exists abonnements_cree_par on public.abonnements (cree_par);
