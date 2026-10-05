# Les Cours Sésame et SAJ

Site : https://concours-sesame.github.io/coursesesame/

## Modifier les ouvrages, prix, avis ou FAQ

1. Tout le contenu se trouve dans `assets/js/data.js`.
   Pour ajouter un ouvrage, copiez une ligne de `OUVRAGES` et modifiez-la.
   Champs facultatifs : `"phase"` (ex. `"Présélection"`, `"Écrit"`), `"numerique":true`
   et `"extrait"` (nom d'un PDF placé dans `assets/extraits/`, proposé en extrait gratuit).
2. Régénérez les pages : `node tools/build.js`
   (met à jour l'accueil et toutes les pages générées, ainsi que `sitemap.xml`).
3. Publiez les fichiers modifiés sur la branche `main`.

Chaque ouvrage a sa page, `ouvrages/<adresse>/`, dont l'adresse est tirée du titre sans
l'édition : elle ne change pas quand l'ouvrage passe d'une édition à la suivante.

## Ajouter un sujet corrigé

1. Ajoutez sa fiche dans `contenu/sujets.js` (titre, épreuve, matière, concours, ouvrage d'origine…).
2. Placez son texte dans `contenu/sujets/<adresse>.html` : l'énoncé après `<!-- énoncé -->`,
   le corrigé après `<!-- corrigé -->`.
3. Lancez `node tools/build.js` : la page `sujets/<adresse>/` est créée et le sujet apparaît
   dans la liste, sur les pages des concours concernés et sur la page de l'ouvrage.

## Modifier les QCM

- QCM de méthode : `QCM` dans `assets/js/data.js` (page `methodes/`).
- QCM par matière : `assets/js/qcm-matieres.js` (pages `qcm/<matière>/`).
  L'ordre des réponses est mélangé à l'affichage ; `"bonne"` donne la position de la bonne
  réponse dans la liste écrite (0 = première).

## Images

- `assets/img/apercus/` : pages des extraits gratuits montrées sur les pages ouvrages
  (`<extrait>-p<numéro de page>.jpg`, 1000 pixels de large, tirées du PDF de l'extrait).
- `assets/img/ouvrages/` : image de partage de chaque ouvrage (1200 × 630), affichée quand on
  envoie le lien sur WhatsApp ou Facebook. Après l'ajout d'un ouvrage ou un changement de titre
  ou de prix : `node tools/images-partage.js` (nécessite Playwright), puis `node tools/build.js`.
  Sans image, la page utilise l'image générale du site.

## Organisation

- `index.html` : page d'accueil. Les parties entre `<!-- partial:… -->` sont reprises
  sur toutes les pages ; celles entre `<!-- build:… -->` sont remplies par le générateur.
- `concours/`, `ouvrages/`, `sujets/`, `qcm/` et `methodes/` : pages générées, à ne pas modifier à la main.
- `assets/js/render.js` : affichage des couvertures, fiches et packs (navigateur et générateur).
- `assets/js/app.js` : panier, filtres, test « Quel ouvrage pour moi ? », QCM, partage.
- `assets/css/style.css` : apparence (charte : bleu marine et or en aplats).
