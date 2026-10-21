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
  Clés de secours : la page d'administration permet d'enregistrer d'autres facteurs du même type (« Clé de
  secours … »), dont la clé est recopiée sur papier ou scannée sur un second appareil ; à la connexion, le code est
  essayé sur chaque facteur validé. Téléphone perdu : se connecter avec une clé de secours, puis retirer le téléphone
  depuis « Gérer ». Sans clé de secours : supprimer le facteur dans le tableau de bord Supabase (Authentication,
  Users, le compte, section MFA factors), puis réactiver la validation depuis la page d'administration.
- Suspension, suppression, présence et suivi en direct (`20261013180000_suspension_presence_direct.sql`) :
  `admin_suspendre` coupe l'accès sans toucher aux périodes (table `suspensions`) ; `admin_reactiver` décale les
  périodes en cours ou à venir du nombre de jours suspendus. `admin_supprimer_abonnement` marque une période (ou la
  période en cours et ses prolongations) comme supprimée (`supprime_le`, `supprime_par`) : elle est ignorée partout,
  sans être effacée. `verifier_appareil` note l'heure du dernier passage (`connexions.vu_le`), lue par
  `admin_activite`. Les tables `abonnements`, `suspensions` et `profils` sont diffusées par Supabase Realtime
  (publication `supabase_realtime`), sous les règles d'accès : seul l'administrateur reçoit les changements de tous.
- Seuls les comptes confirmés (créés par la fonction `inscription`) reçoivent un profil.
- La clé publique du projet (dans `assets/js/espace-config.js`) n'est pas secrète. La clé secrète
  (`service_role` ou `sb_secret_…`) ne doit **jamais** apparaître dans le site.
- Les vidéos s'ouvrent par des liens temporaires (4 heures), avec le nom et le téléphone de l'abonné en
  surimpression. Les PDF se lisent dans la page seulement (pages dessinées en image avec ce nom incrusté, et une
  signature répétée sur toute la page : nom, téléphone, e-mail, date et heure de lecture) : pas de bouton de
  téléchargement, ni de copie, de sélection, de clic droit ou d'impression ; lien de 60 secondes. Les fiches et QCM
  portent la même signature répétée. Le contenu est voilé dès que la page perd le premier plan (outil de capture,
  autre application) ; la touche Impr. écran vide le presse-papiers. Aucune de ces mesures n'empêche une capture
  faite par le téléphone ou l'ordinateur : elles la découragent et la rendent traçable.
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
- `functions/agent-revision` : agent de révision (rédaction intégrale ou correction notée sur 20 d'un cas
  pratique, d'une dissertation ou d'un commentaire d'article). Déployée sans vérification de jeton : la
  fonction vérifie la session, l'abonnement (formules d'un mois et plus), l'appareil, le quota et le plafond
  de dépense du mois (`agent_reglages`). Elle cherche les passages utiles dans `passages` (texte des contenus,
  préparé depuis l'administration), lit la méthode dans `agent_consignes` (réservée à l'administrateur,
  jamais dans ce dépôt public) et appelle l'API d'Anthropic avec le secret `ANTHROPIC_API_KEY`. Seuls le
  sujet, la copie et les passages sont transmis, jamais le nom, l'e-mail ou le téléphone de l'abonné.
  Chaque demande est enregistrée dans `agent_echanges` (historique de l'abonné, coûts pour l'administrateur).
- `functions/pages` : seule porte d'accès des abonnés aux PDF (les règles de `storage.objects` ne leur ouvrent plus
  que les vidéos, par `fichier_direct_autorise`). Déployée sans vérification de jeton : la fonction vérifie la session,
  l'appareil et le droit de lire le document (`fichier_autorise`, avec le jeton de l'abonné). Elle découpe le document
  en morceaux de 20 pages (`exclusif/pages/<contenu>/<empreinte du fichier>/<n>.pdf`, préparés à la première lecture),
  imprime la signature de l'abonné sur la page puis la transforme en image (PDFium en WebAssembly, chargé depuis
  jsDelivr et contrôlé par son empreinte SHA-256) : le filigrane fait partie des pixels. Lecture à l'écran : 300 pages
  différentes par jour (`noter_page_lue`, table `pages_lues`). Téléchargement : réservation par `reserver_telechargement`
  (5 % du total des pages sur 7 jours glissants, 15 pages par document, table `telechargements`), puis chaque page
  réservée livrée en PDF image pendant 30 minutes. Nombre de pages gardé dans `documents_pages`.
- `functions/telechargement` : fermée le 19 octobre 2026 (réponse 410), remplacée par `pages`.
- `functions/emails` : e-mails aux abonnés par Brevo, depuis infos@coursesesame.com (secret `BREVO_API_KEY`).
  Déployée sans vérification de jeton. La tâche planifiée `emails-abonnes` (pg_cron, toutes les 15 minutes) l'appelle
  avec une clé gardée dans le coffre (Vault, `emails_planif`), vérifiée par `emails_verifier_planif`. La base prépare la
  file (`emails_file`) : bienvenue au premier abonnement, rappels 7 et 3 jours avant la fin d'un abonnement non
  prolongé, relance d'inactivité (abonné en cours sans passage depuis 5 jours, entre 9 h et 20 h, une par semaine au
  plus, jamais un jour d'annonce ni dans les 3 derniers jours ; dernier passage lu dans `connexions.vu_le`),
  annonce quotidienne (à partir de 9 h) des contenus mis en ligne, aux abonnés en cours qui ne l'ont pas refusée
  (`profils.emails_nouveautes`, lien de désinscription par `profils.jeton_emails`). Rien ne part tant que
  `emails_reglages.actif` est faux (onglet « E-mails » de l'administration). Chaque envoi est noté dans `emails_envoyes`,
  dont la clé unique empêche les doublons.

- Recherche dans les textes : `rechercher_textes` (abonnés en cours et administrateur) cherche dans `passages`, pour
  les seuls contenus « Texte officiel » et « Jurisprudence », et renvoie un court extrait par page trouvée. Elle ne
  donne des résultats qu'après « Préparer le texte pour l'agent de révision » dans l'administration.
- Parrainage : `profils.code_parrain` (6 caractères, créé à l'inscription), `profils.parrain_id` (enregistré par
  `functions/inscription` à partir du code saisi ou du lien `espace-abonnes/?parrain=CODE`). Au premier abonnement
  payé du filleul, le déclencheur `abonnements_parrainage` offre 7 jours au parrain (période à 0 FCFA, moyen
  « Parrainage », à la suite de son abonnement) et l'inscrit dans `parrainages` (une récompense par filleul).
  Pour annuler une récompense abusive : supprimer cette période depuis l'administration.
- Concours blanc : tables `concours_blancs` (créées et publiées par l'administrateur, onglet « Concours blancs ») et
  `copies_blanc`. `mes_concours_blancs` ne livre le sujet qu'à partir de l'heure du début ; `enregistrer_copie_blanc`
  accepte la copie jusqu'à 5 minutes après la fin, puis la fige une fois rendue ; `noter_copie_blanc` ne retient la note
  de l'agent que si la correction porte exactement sur le sujet et la copie rendue. Classement anonyme (rang, nombre de
  copies notées, moyenne, meilleure note).
  Chaque épreuve peut être rattachée à un corrigé-type (`concours_blancs.corrige_id`, contenu programmé pour paraître à
  la fin de l'épreuve) ; `corrige_blanc` ne le livre qu'après la fin. Les corrigés se rattachent en SQL pour l'instant.
- Sauvegarde automatique : `sauvegardes.prendre()`, chaque dimanche à 3 h (pg_cron `sauvegarde-hebdomadaire`), copie
  les tables essentielles dans `sauvegardes.instantanes` (schéma privé, 8 emplacements réutilisés à tour de rôle).
  Protège contre une erreur de manipulation, pas contre la perte du projet (voir la sauvegarde du README principal).

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
- `apercu_contenus` appelable sans connexion : elle ne renvoie que les titres, descriptions, types, matières et
  concours des contenus publiés (jamais un fichier, un texte ou un lien), au plus 1 000. La page de l'espace
  abonnés s'en sert pour la liste « Au programme », rangée par rubrique.
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
