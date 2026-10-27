# Fiches de révision

Série de fiches courtes, une notion par fiche, publiées en PDF dans l'espace abonnés (rubrique « Fiches de révision »,
matière `Fiches · <matière>`). Objectif : 1 000 fiches. Les visiteurs non abonnés en voient les titres, avec un cadenas,
dans l'aperçu « Au programme » de la page Espace abonnés (`apercu_contenus`) ; seuls les abonnés les ouvrent.

**Le texte des fiches n'est pas dans ce dépôt, qui est public.** Les sources Markdown sont gardées dans le stockage
privé `exclusif`, en archives `textes/sources-fiches-NNNN-NNNN.pdf` (un `.tar.gz` sous ce nom, déposé par l'action
`televersement` de `import-texte`). La dernière archive, `textes/sources-fiches-0001-0050.pdf`, contient les fiches 1 à 50.

## Format d'une fiche (`NN.md`)

```
numero: 1
titre: Le principe de légalité des délits et des peines
matiere: Droit pénal général
concours: infj, greffe, penitentiaire, eppjej, ena
sources: Constitution du 8 novembre 2016, article 7 ; Code pénal (loi n° 2019-574 du 26 juin 2019), articles …
note: (facultatif) mention de bas de fiche remplaçant celle par défaut, par exemple pour le Code civil
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
- Pièges relevés en vérifiant : loidici ajoute des chiffres entre parenthèses (« soixante (60) ans ») absents du Journal
  officiel, a perdu un mot à l'article 95 du Code de procédure pénale (« à titre de simple renseignement ») et n'a pas
  reporté la loi de 2021 dans sa page de l'article 107 du Code pénal. Le Code civil n'étant pas dans l'espace, il est cité
  dans sa rédaction applicable (note de bas de fiche adaptée), en évitant les alinéas dont la version ivoirienne est
  incertaine (article 1384, alinéa 4).

## Fabrication et publication

```
python3 tools/fiches/rendu.py <dossier>             # NN.md -> NN.html (polices et logo du site)
node tools/fiches/pdf.js <dossier>                  # NN.html -> NN.pdf (A4, pied de page paginé)
node tools/fiches/pdf.js <dossier> 10,12 0.96       # resserre les fiches dont la dernière page serait presque vide
```

Avant publication, chaque PDF peut être repassé dans la chaîne du lecteur de l'espace (pdf-lib puis PDFium, comme la
fonction `pages`) pour s'assurer qu'il s'affiche. Un fichier déjà publié ne se remplace pas : on dépose `fiche-NNNN-v2`
et on met à jour `contenus.fichier`.

Puis, pour chaque fiche : adresse de dépôt `import-texte` `{ action: "televersement", nom: "fiche-NNNN" }`, envoi du
PDF (`PUT`, `Content-Type: application/pdf`), et ligne `contenus` : titre `Fiche n° N · <titre>`, type `pdf`, fichier
`textes/fiche-NNNN.pdf`, matière `Fiches · <matière>`, concours, `publie = true`. L'annonce aux abonnés part avec
l'e-mail quotidien des nouveautés.

## Fiches publiées

| N° | Thème | Contenus |
|---|---|---|
| 1 à 12 | Droit pénal général : légalité, élément moral, tentative, auteur et complice, légitime défense, ordre de la loi, état de nécessité, imputabilité, excuses, récidive, concours d'infractions, immunité familiale | 147 à 158 |
| 13 à 17 | Droit pénal spécial : escroquerie, abus de confiance, meurtre et assassinat, violences volontaires, violences domestiques et viol | 159 à 163 |
| 18 à 28 | Procédure pénale : actions publique et civile, extinction, police judiciaire, enquête préliminaire, flagrance, garde à vue, juge d'instruction, détention préventive, CRPC, appel et opposition, pourvoi | 164 à 174 |
| 29 à 35 | Famille : mariage (formation, effets), filiation, autorité parentale, tutelle, adoption, successions | 175 à 181 |
| 36 à 40 | Obligations : validité du contrat, vices du consentement, responsabilité du fait personnel, commettant, répétition de l'indu | 182 à 186 |
| 41 à 46 | Institutions : ordres de juridiction, Cour de cassation, Conseil d'État, recours pour excès de pouvoir, Conseil constitutionnel, révision de la Constitution | 187 à 192 |
| 47 à 50 | OHADA : commerçant, bail à usage professionnel, SARL, injonction de payer | 193 à 196 |
