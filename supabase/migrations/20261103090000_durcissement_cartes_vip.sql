-- Audit du 3 novembre 2026 : les tables des cartes de l'espace VIP, créées après la migration durcissement_acces,
-- gardaient tous les droits par défaut pour le rôle anon. Les règles d'accès (réservées au rôle authenticated)
-- les protégeaient déjà ; on retire ces droits par prudence, comme pour les autres tables.
revoke all on table public.cartes_articles from anon;
revoke all on table public.cartes_progres from anon;
-- Les abonnés n'ont besoin que de lire (cartes) et d'enregistrer leurs progrès ; pas de vidage de table.
revoke truncate, references, trigger on table public.cartes_articles from authenticated;
revoke truncate, references, trigger on table public.cartes_progres from authenticated;
