# Espace abonnés (Supabase)

L'espace abonnés repose sur un projet Supabase : comptes, abonnements, contenus exclusifs et fichiers.
Le site, lui, reste une suite de pages fixes sur GitHub Pages. **Aucun contenu exclusif n'est placé
dans ce dépôt** : le dépôt est public, les contenus vivent uniquement dans Supabase.

## Sécurité

- Les règles d'accès sont dans la base (`migrations/`, à appliquer dans l'ordre). Un compte connecté ne lit les contenus et ne
  peut demander un lien vers un fichier que si son abonnement est en cours ; les brouillons restent invisibles.
- Les fonctions d'administration vérifient que l'appelant figure dans la table `admins`.
- Seuls les comptes confirmés (créés par la fonction `inscription`) reçoivent un profil.
- La clé publique du projet (dans `assets/js/espace-config.js`) n'est pas secrète. La clé secrète
  (`service_role` ou `sb_secret_…`) ne doit **jamais** apparaître dans le site.
- Les vidéos s'ouvrent par des liens temporaires (4 heures), avec le nom et le téléphone de l'abonné en
  surimpression. Les PDF sont remis avec ce nom sur chaque page.

## Fonctions

- `functions/inscription` : crée un compte confirmé (le site n'envoie pas d'e-mails), au plus 60 par heure
  et par adresse IP (les clients d'un même opérateur mobile, ou d'une même salle de cours, partagent souvent
  une adresse). À déployer **sans** vérification de jeton.
- `functions/admin-mot-de-passe` : mot de passe provisoire donné par l'administrateur. Déployée sans
  vérification de jeton par la plateforme : la fonction vérifie elle-même la session de l'appelant,
  puis qu'il figure dans la table `admins`.

## Mise en service (faite le 9 octobre 2026)

Projet `iyftcjszvnaaakirlsdd`, région Paris (eu-west-3).

1. Créer le projet Supabase, région Europe (les mentions légales l'indiquent).
2. Appliquer les fichiers de `migrations/`, dans l'ordre.
3. Déployer les deux fonctions.
4. Renseigner l'adresse du projet et la clé publique dans `assets/js/espace-config.js`.
5. Créer le compte de l'administrateur sur la page « Espace abonnés » du site, puis exécuter :
   `insert into public.admins (user_id) select id from auth.users where email = 'adresse@exemple.com';`

## Alertes du conseiller Supabase

Le tableau de bord signale quelques points qui sont voulus :

- `journal_inscriptions` sans règle d'accès : seule la fonction `inscription` (clé secrète) s'en sert.
- `apercu_contenus` appelable sans connexion : elle ne renvoie que les titres des contenus publiés.
- Fonctions appelables par les comptes connectés : celles d'administration vérifient `est_admin()`,
  les autres ne renvoient que la situation du compte qui les appelle.
- Protection contre les mots de passe divulgués : option de l'offre Pro.

En cas de souci, les erreurs inattendues des deux fonctions apparaissent dans leurs journaux (Edge Functions, Logs).

Connexions : Supabase en accepte par défaut 150 toutes les 5 minutes depuis une même adresse, ce qui suffit
pour une salle de cours (plafond réglable dans Authentication, Rate Limits).

## Gestion courante

Tout se fait depuis `espace-abonnes/admin/` : activer ou prolonger un abonnement après paiement,
relancer sur WhatsApp, donner un mot de passe provisoire, ajouter et publier les contenus.

## Limites de l'offre gratuite de Supabase

50 Mo par fichier, 1 Go de fichiers, 5 Go de téléchargement par mois (environ 900 visionnages de vidéos
de 5 Mo), et mise en pause du projet après une semaine sans activité. Au-delà, l'offre Pro.
