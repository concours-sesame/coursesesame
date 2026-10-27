# Plan de publication Facebook

Deux posts par jour sur la page « LES Cours Sesame et Saj », à 7 h 30 et 19 h 30 (heure d'Abidjan), du 28 octobre 2026 au 27 janvier 2027 : 184 posts, rangés dans la table `facebook_publications` et publiés à l'heure par la tâche pg_cron `facebook-publications` (fonction `facebook`, action `planif`, voir `supabase/README.md`).

- `semaines/s01.json` (semaine 1, rédigée à la main) et `semaines/s02-s14.json` (semaines 2 à 14) : le texte, le lien, l'image ou la vidéo de chaque post.
- `plan.py` : produit `s02-s14.json` à partir des contenus vérifiés du site (scripts des vidéos, QCM par matière, sujets corrigés, fiches des ouvrages, sujets de SOG des concours blancs) et des textes rédigés dans le fichier (fonctions de l'espace abonnés, méthodes, conseils).
- `visuels.js` : les visuels 1080 × 1350, un par post qui en a un (`node tools/facebook/visuels.js <semaine.json> <dossier>`).

Mise en ligne d'un lot : les images (base64) et les lignes de la table sont déposées en deux fichiers JSON par l'action `televersement` (format `lot`), puis rangées par les actions `deballer` et `plan`. Les images restent dans le stockage privé (`exclusif/facebook/`), jamais dans le dépôt.

Règles de fond : aucune information qui ne vienne d'un contenu vérifié, noms de personnes inventés, zéro tiret cadratin.
