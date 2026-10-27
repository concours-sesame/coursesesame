# Vidéos « Une notion, une minute »

Format vertical 720 × 1280, 30 images par seconde, voix de synthèse Kokoro (voix `ff_siwis`, licence Apache 2.0, gratuite et libre d'usage commercial), sous-titres calés phrase par phrase, charte bleu marine et or.

## Une vidéo = un script

Chaque vidéo est décrite par un fichier JSON de `scripts/` : `fichier` (nom du MP4), `titre`, `rubrique`, puis les `scenes`. Chaque scène a un `type` et la liste `dit` des phrases prononcées ; les mots entre astérisques s'affichent en or dans les sous-titres. Les éléments d'une scène portent un `cue` : numéro de la phrase à laquelle ils apparaissent.

Types de scènes : `intro`, `question` (titre + `texte`), `etapes` (cartes numérotées), `blocs` (encadrés à étiquette, `fort` pour la conclusion), `article` (`citation` exacte du texte, entre guillemets), `cas` (`ok` vrai ou faux), `piege`, `outro` (coordonnées WhatsApp).

Règles de fond : citation d'article mot pour mot, vérifiée dans le texte officiel ; une reformulation va dans `blocs`, jamais dans `article` ; noms de personnes inventés ; aucun tiret cadratin.

## Fabrication

1. Voix (Python 3, `pip install kokoro-onnx soundfile`, modèles `kokoro-v1.0.onnx` et `voices-v1.0.bin` des versions du dépôt thewh1teagle/kokoro-onnx, dans `modeles/` ou le dossier indiqué par `KOKORO_DIR`, sous les noms `kokoro.onnx` et `voices.bin`) : `python voix.py scripts/X.json travail/X`
2. Calendrier, piste sonore et sous-titres : `python montage.py scripts/X.json travail/X`
3. Aperçu de quelques images (fin de chaque scène par défaut, ou instants donnés) : `node apercu.mjs scripts/X.json travail/X [secondes...]`
4. Vidéo (Playwright et Chromium, ffmpeg) : `node images.mjs scripts/X.json travail/X` produit `travail/X/video.mp4`.
5. Contrôle de la voix (`pip install faster-whisper`) : `python controle.py scripts/X.json travail/X/video.mp4` transcrit la vidéo et signale les écarts avec le script.

Mise en ligne : copier la vidéo dans `assets/video/<fichier>.mp4`, une image de l'introduction en 540 × 960 dans `assets/img/videos/<fichier>.jpg`, déclarer la vidéo dans `VIDEOS` (assets/js/data.js), puis `node tools/build.js`.

## Vidéo réservée aux abonnés

Le fichier ne va jamais dans le dépôt, qui est public : il est déposé dans le stockage privé `exclusif` de l'espace abonnés, et seule l'affiche est publique. Les abonnés la lisent par une adresse signée de quatre heures, à partir de la formule d'une semaine.

1. Adresse de dépôt : appeler la fonction `import-texte` depuis la base (en-tête `x-import`, clé du coffre `textes_import`) avec `{ "action": "televersement", "nom": "<fichier>", "format": "mp4" }`. Elle renvoie une adresse signée, valable deux heures, pour `exclusif/videos/<fichier>.mp4` (sans remplacement d'un fichier existant).
2. Envoi : `curl -X PUT -H 'Content-Type: video/mp4' --data-binary @travail/X/video.mp4 '<adresse>'`.
3. Contenu de l'espace abonnés, en SQL : `insert into contenus (titre, description, type, fichier, matiere, concours, publie)` avec le titre « Une notion, une minute : … », une description qui donne la durée et les articles cités, le type `video`, le fichier `videos/<fichier>.mp4`, la matière seule (« Droit pénal », « Procédure pénale », « Droit civil », « Droit administratif », « Droit OHADA ») et `publie` à `true`.
4. Aperçu public : l'image de l'introduction en 540 × 960 dans `assets/img/videos/<fichier>.jpg`, une entrée dans `VIDEOS_ABONNES` (assets/js/data.js : `fichier`, `duree`, `tag`, `titre`, `desc`, `concours`), puis `node tools/build.js`. La carte, avec un cadenas, mène à l'inscription ; la vidéo ne figure pas dans les données structurées pour Google.
