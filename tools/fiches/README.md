# Fiches de révision

Série de fiches courtes, une notion par fiche, publiées en PDF dans l'espace abonnés (rubrique « Fiches de révision »,
matière `Fiches · <matière>`). Objectif : 1 000 fiches. Les visiteurs non abonnés en voient les titres, avec un cadenas,
dans l'aperçu « Au programme » de la page Espace abonnés (`apercu_contenus`) ; seuls les abonnés les ouvrent.

**Le texte des fiches n'est pas dans ce dépôt, qui est public.** Les sources Markdown sont gardées dans le stockage
privé `exclusif`, en archives `textes/sources-fiches-NNNN-NNNN.pdf` (un `.tar.gz` sous ce nom, déposé par l'action
`televersement` de `import-texte`).

## Format d'une fiche (`NN.md`)

```
numero: 1
titre: Le principe de légalité des délits et des peines
matiere: Droit pénal général
concours: infj, greffe, penitentiaire, eppjej, ena
sources: Constitution du 8 novembre 2016, article 7 ; Code pénal (loi n° 2019-574 du 26 juin 2019), articles …
---
## 1. L'essentiel en une phrase
…
```

Corps : titres `##`, paragraphes, listes `- ` et `1. `, citations `> ` (une ligne par alinéa), tableaux `| … |`,
`**gras**`, `*italique*`. Plan : l'essentiel, les textes cités mot pour mot, conditions et effets, exemples (noms
inventés), pièges des correcteurs, à l'écrit, testez-vous avec corrigé.

## Règles de rédaction

- Rien qui ne soit lu dans un texte : chaque citation entre « » est vérifiée dans le texte officiel (`passages`) ;
  pour une disposition modifiée, dans la loi modificative. Les textes de loidici.biz (`sources_loidici`, table privée)
  servent à trouver et à suivre les modifications, pas de source de citation : le site ajoute parfois une virgule ou
  un chiffre entre parenthèses, et ses pages consolidées ne suivent pas toujours les lois modificatives.
- Pas de tiret cadratin ni demi-cadratin, pas de date d'arrêt du droit, pas de jurisprudence non lue.

## Fabrication et publication

```
python3 tools/fiches/rendu.py <dossier>   # NN.md -> NN.html (polices et logo du site)
node tools/fiches/pdf.js <dossier>        # NN.html -> NN.pdf (A4, pied de page paginé)
```

Puis, pour chaque fiche : adresse de dépôt `import-texte` `{ action: "televersement", nom: "fiche-NNNN" }`, envoi du
PDF (`PUT`, `Content-Type: application/pdf`), et ligne `contenus` : titre `Fiche n° N · <titre>`, type `pdf`, fichier
`textes/fiche-NNNN.pdf`, matière `Fiches · <matière>`, concours, `publie = true`. L'annonce aux abonnés part avec
l'e-mail quotidien des nouveautés.

## Fiches publiées

| N° | Titre | Contenu |
|---|---|---|
| 1 à 10 | Droit pénal général : légalité, élément moral, tentative, auteur et complice, légitime défense, ordre de la loi, état de nécessité, imputabilité, excuses, récidive | 147 à 156 |
