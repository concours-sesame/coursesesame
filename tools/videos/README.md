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
