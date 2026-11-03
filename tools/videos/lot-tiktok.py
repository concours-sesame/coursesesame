# Prépare un lot de vidéos pour la fonction tiktok-depot : python3 lot-tiktok.py <lot> <dossier distant> <video.mp4>...
# Le nom distant de chaque vidéo est lu dans le fichier « nom » placé à côté d'elle (ex. qcm-du-jour-001).
# Format : 10 chiffres (longueur de l'index), index JSON [{chemin, taille}], puis les fichiers bout à bout.
import json, os, sys
lot, dossier, videos = sys.argv[1], sys.argv[2], sys.argv[3:]
index, morceaux = [], []
for v in videos:
    nom = open(os.path.join(os.path.dirname(v), 'nom')).read().strip()
    data = open(v, 'rb').read()
    index.append({'chemin': f'{dossier}/{nom}.mp4', 'taille': len(data)}); morceaux.append(data)
tete = json.dumps(index).encode()
with open(lot, 'wb') as f:
    f.write(b'%010d' % len(tete)); f.write(tete)
    for m in morceaux: f.write(m)
print(len(index), 'vidéos,', round(os.path.getsize(lot) / 1e6, 1), 'Mo')
