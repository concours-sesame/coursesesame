# Fiches de révision

Série de fiches courtes, une notion par fiche, publiées en PDF dans l'espace abonnés (rubrique « Fiches de révision »,
matière `Fiches · <matière>`). Objectif : 1 000 fiches. Les visiteurs non abonnés en voient les titres, avec un cadenas,
dans l'aperçu « Au programme » de la page Espace abonnés (`apercu_contenus`) ; seuls les abonnés les ouvrent.

**Le texte des fiches n'est pas dans ce dépôt, qui est public.** Les sources Markdown sont gardées dans le stockage
privé `exclusif`, en archives `textes/sources-fiches-NNNN-NNNN.pdf` (un `.tar.gz` sous ce nom, déposé par l'action
`televersement` de `import-texte`). La dernière archive, `textes/sources-fiches-0001-0100.pdf`, contient les fiches 1 à 100.

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
- Pour les textes absents de loidici ou dont loidici n'a qu'une version ancienne (loi de 2018 sur l'état civil, loi de 2023
  sur les majeurs protégés, AUPSRVE de 2023, AUA de 2017), la lecture se fait directement dans `passages`. L'OCR y est
  parfois bruité (« fans » pour « faits », colonnes entremêlées) : un écart à la vérification se contrôle à l'écran avant
  de conclure. Quand le Journal officiel contient lui-même une coquille (numérotation « 1°, 2°, 2° » de l'article 308 du
  Code pénal), la citation la reproduit et le signale.
- Une loi temporaire dont le maintien en vigueur n'est pas établi (loi n° 2018-863 sur la procédure spéciale de
  déclaration de naissance) ne fait pas l'objet d'une fiche.

## Fabrication et publication

```
python3 tools/fiches/rendu.py <dossier>             # NN.md -> NN.html (polices et logo du site)
node tools/fiches/pdf.js <dossier>                  # NN.html -> NN.pdf (A4, pied de page paginé)
node tools/fiches/pdf.js <dossier> 10,12 0.96       # resserre les fiches dont la dernière page serait presque vide
                                                    # (0.93 si 0.96 ne suffit pas, comme pour la fiche 65)
```

Avant publication, chaque PDF peut être repassé dans la chaîne du lecteur de l'espace (pdf-lib puis PDFium, comme la
fonction `pages`) pour s'assurer qu'il s'affiche. Un fichier déjà publié ne se remplace pas : on dépose `fiche-NNNN-v2`
et on met à jour `contenus.fichier`.

Puis, pour chaque fiche : adresse de dépôt `import-texte` `{ action: "televersement", nom: "fiche-NNNN" }`, envoi du
PDF (`PUT`, `Content-Type: application/pdf`), et ligne `contenus` : titre `Fiche n° N · <titre>`, type `pdf`, fichier
`textes/fiche-NNNN.pdf`, matière `Fiches · <matière>`, concours, `publie = true`. L'annonce aux abonnés part avec
l'e-mail quotidien des nouveautés.

## Vitrine publique (fiches/)

Chaque fiche publiée a une page publique `fiches/NNN-titre/` : titre, « L'essentiel en une phrase », sources et plan,
le reste étant réservé aux abonnés. Après une nouvelle série, régénérer les données puis le site :

```
python3 tools/fiches/vitrine.py <dossier des sources>   # -> contenu/fiches.js (seulement ce que la vitrine affiche)
node tools/build.js
```

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
| 51 à 66 | Pénal : vol, recel, association de malfaiteurs, omission de porter secours, faux, circonstances atténuantes, classification, loi pénale dans le temps et dans l'espace, peines principales, peines complémentaires et confiscation (2024), mesures de sûreté, sursis, grâce et prescription de la peine, personnes morales, mineur | 197 à 212 |
| 67 à 78 | Procédure pénale : ministère public, contrôle judiciaire, chambre d'instruction, tribunal criminel, contumace, saisine du tribunal correctionnel, casier judiciaire, réhabilitation, libération conditionnelle, juridictions pour mineurs, révision, nullités | 213 à 224 |
| 79 à 86 | Personnes et famille : actes de l'état civil, rectification et jugements supplétifs, émancipation, communauté de biens, séparation de biens, option successorale, partage, majeurs protégés | 225 à 232 |
| 87 à 89 | Institutions : indépendance et statut du magistrat, Conseil supérieur de la magistrature, Haute Cour de justice | 233 à 235 |
| 90 à 100 | OHADA : fonds de commerce et location-gérance, vente du fonds, vente commerciale, cautionnement, hypothèque, gage, saisie-attribution, saisie-vente, redressement et liquidation, conciliation et règlement préventif, arbitrage | 236 à 246 |

Les fiches 2, 13, 14 et 16 ont été republiées en version 2 (`fiche-NNNN-v2.pdf`) après correction de l'espace des
milliers dans `rendu.py` : « 3.000.000 » s'affichait « 3 000.000 ».
