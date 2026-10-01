# Les Cours Sésame et SAJ

Site : https://concours-sesame.github.io/coursesesame/

## Modifier les ouvrages, prix, avis ou FAQ

1. Tout le contenu se trouve dans `assets/js/data.js`.
   Pour ajouter un ouvrage, copiez une ligne de `OUVRAGES` et modifiez-la.
   Champs facultatifs : `"phase"` (ex. `"Présélection"`, `"Écrit"`) et `"numerique":true`.
2. Régénérez les pages : `node tools/build.js`
   (met à jour l'accueil, les pages `concours/…`, la page `methodes/` et `sitemap.xml`).
3. Publiez les fichiers modifiés sur la branche `main`.

## Organisation

- `index.html` : page d'accueil. Les parties entre `<!-- partial:… -->` sont reprises
  sur toutes les pages ; celles entre `<!-- build:… -->` sont remplies par le générateur.
- `concours/<concours>/` et `methodes/` : pages générées, à ne pas modifier à la main.
- `assets/js/render.js` : affichage des couvertures, fiches et packs (navigateur et générateur).
- `assets/js/app.js` : panier, filtres, test « Quel ouvrage pour moi ? », QCM.
- `assets/css/style.css` : apparence (charte : bleu marine et or en aplats).
