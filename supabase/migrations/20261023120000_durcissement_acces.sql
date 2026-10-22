-- Durcissement des accès (audit de sécurité de l'espace abonnés)
--
-- L'audit n'a trouvé aucune faille : sans abonnement en cours, aucun contenu, aucun fichier, aucun corrigé n'est
-- lisible, que l'on soit anonyme ou connecté (règles d'accès des tables, fonctions et stockage vérifiées une à une).
-- Les mesures ci-dessous sont de simple précaution : elles retirent des droits qui ne servent à personne.

-- 1. Les visiteurs non connectés (rôle anon) n'ont aucune raison d'atteindre ces tables. Les règles d'accès
--    (RLS) les bloquaient déjà, faute de règle pour ce rôle ; le droit lui-même est désormais retiré.
revoke all on table
  public.agent_consignes, public.agent_echanges, public.agent_reglages, public.annonces, public.commandes,
  public.grand_oral, public.journal_admin, public.lectures, public.notes_abonnes, public.passages,
  public.qcm_progres, public.telechargements
from anon;

-- 2. Statistiques de visites : réservées à l'administrateur (déjà vérifié dans les fonctions)
revoke execute on function public.admin_visites(integer), public.admin_visites_jours(integer) from public, anon;
grant execute on function public.admin_visites(integer), public.admin_visites_jours(integer) to authenticated;

-- 3. Fonction d'essai des sauvegardes : chemin de recherche figé
alter function sauvegardes.essai() set search_path = '';
revoke execute on function sauvegardes.essai() from public, anon, authenticated;
