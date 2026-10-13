# Espace abonnés (Supabase)

L'espace abonnés repose sur un projet Supabase : comptes, abonnements, contenus exclusifs et fichiers.
Le site, lui, reste une suite de pages fixes sur GitHub Pages. **Aucun contenu exclusif n'est placé
dans ce dépôt** : le dépôt est public, les contenus vivent uniquement dans Supabase.

## Sécurité

- Les règles d'accès sont dans la base (`migrations/`, à appliquer dans l'ordre). Un compte connecté ne lit les contenus et ne
  peut demander un lien vers un fichier que si son abonnement est en cours ; les brouillons restent invisibles.
- Les fonctions d'administration vérifient que l'appelant figure dans la table `admins`.
- Ouvrages complets réservés aux formules d'un mois et plus (`20261013102633_ouvrages_formules_longues.sql`) :
  un contenu dont la matière commence par « Ouvrage » n'ouvre son fichier que si la période d'abonnement en cours
  compte au moins 28 jours (`acces_ouvrages`, `fichier_autorise`). Avec une formule courte, l'ouvrage reste visible
  dans la bibliothèque avec un cadenas. Un ouvrage doit donc être saisi avec une matière « Ouvrage · … ».
- Validation en deux étapes de l'administrateur (`20261013101259_admin_double_authentification.sql`) : une fois
  activée depuis la page d'administration (code QR à scanner avec Google Authenticator ou Microsoft Authenticator),
  `est_admin()` n'est vrai qu'avec une session validée par le code (niveau `aal2` du jeton). Toutes les règles
  d'accès et fonctions d'administration en dépendent ; `admin-mot-de-passe` fait la même vérification.
  Téléphone perdu : supprimer le facteur dans le tableau de bord Supabase (Authentication, Users, le compte,
  section MFA factors), puis réactiver la validation depuis la page d'administration.
- Seuls les comptes confirmés (créés par la fonction `inscription`) reçoivent un profil.
- La clé publique du projet (dans `assets/js/espace-config.js`) n'est pas secrète. La clé secrète
  (`service_role` ou `sb_secret_…`) ne doit **jamais** apparaître dans le site.
- Les vidéos s'ouvrent par des liens temporaires (4 heures), avec le nom et le téléphone de l'abonné en
  surimpression. Les PDF se lisent dans la page seulement (pages dessinées en image avec ce nom incrusté) :
  pas de bouton de téléchargement, ni de copie, de sélection, de clic droit ou d'impression ; lien de 60 secondes.
- Un compte ne s'utilise que sur un appareil à la fois (`20261012225803_un_appareil_a_la_fois.sql`) : après une
  connexion, le site enregistre la session (`prendre_appareil`) dans la table `connexions`, et seule la dernière
  session enregistrée donne accès aux contenus et aux fichiers (`abonnement_actif`). L'ancien appareil est
  déconnecté à sa prochaine action, ou dans la minute (`verifier_appareil`). Les administrateurs ne sont pas
  concernés. La page d'administration signale les comptes utilisés sur 3 appareils ou plus en 7 jours.

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
- `connexions` sans règle d'accès : seules les fonctions `prendre_appareil`, `verifier_appareil` et
  `admin_appareils` s'en servent.
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

La mise en pause est évitée par la tâche GitHub `.github/workflows/eveil-espace-abonnes.yml`, qui interroge la
base chaque matin (onglet Actions du dépôt, « Éveil de l'espace abonnés »). GitHub suspend les tâches planifiées
d'un dépôt resté 60 jours sans modification : il suffit alors de la réactiver dans l'onglet Actions. Si le projet
est tout de même en pause, le relancer depuis le tableau de bord Supabase (Restore project).
