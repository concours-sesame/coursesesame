/* Connexion de l'espace abonnés à Supabase.
   L'adresse du projet et la clé publique ne sont pas secrètes : elles servent seulement à joindre la base.
   La sécurité repose sur les règles d'accès de la base (supabase/migrations) : sans abonnement en cours,
   aucun contenu exclusif n'est lisible. Ne jamais placer ici la clé secrète (service_role ou sb_secret). */
const ESPACE_CONFIG = {
  url: "",
  cle: ""
};
