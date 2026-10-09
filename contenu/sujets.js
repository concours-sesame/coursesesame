/* Sujets corrigés publiés sur le site (pages sujets/<adresse>/).
   Chaque sujet a ici sa fiche, et son texte dans contenu/sujets/<adresse>.html :
   l'énoncé après le repère <!-- énoncé -->, le corrigé après le repère <!-- corrigé -->.
   Champs :
   - concours : identifiants des concours concernés (infj, greffe, penitentiaire, eppjej, ena)
   - ouvrage : titre exact de l'ouvrage d'où le corrigé est tiré (tel qu'il figure dans data.js)
   - session : pour un sujet réellement tombé, le concours et la session ; laisser vide sinon
   Après une modification : node tools/build.js */
module.exports = [
  {
    adresse: "theorie-imprevision-contrat-administratif",
    titre: "La théorie de l'imprévision dans le contrat administratif",
    epreuve: "Dissertation juridique", matiere: "Droit administratif", concours: ["infj", "ena"],
    ouvrage: "Le Droit Administratif en 125 Dissertations Corrigées, Tome II",
    resume: "Analyse du sujet, arrêts de référence et devoir intégralement rédigé : les conditions puis les effets de l'imprévision, de l'arrêt Gaz de Bordeaux au droit ivoirien."
  },
  {
    adresse: "refere-administratif",
    titre: "Le référé administratif",
    epreuve: "Dissertation juridique", matiere: "Droit administratif", concours: ["infj", "ena"],
    ouvrage: "Le Droit Administratif en 125 Dissertations Corrigées, Tome II",
    resume: "Notion, conditions, catégories et effets du référé administratif devant le Conseil d'État : analyse du sujet, textes applicables et devoir intégralement rédigé."
  },
  {
    adresse: "cas-pratique-accident-cause-par-un-mineur",
    titre: "L'accident causé par un mineur et la responsabilité des parents",
    epreuve: "Cas pratique", matiere: "Droit civil", concours: ["infj"],
    ouvrage: "Les 50 Cas Pratiques Corrigés de la Magistrature, Édition 2026",
    resume: "Responsabilité des parents du fait de leur enfant mineur et étendue de la réparation due à la victime : corrigé-type rédigé selon le syllogisme juridique."
  },
  {
    adresse: "cas-pratique-sarl-gerant-depassement-pouvoirs",
    titre: "La SARL dont le gérant a outrepassé ses pouvoirs",
    epreuve: "Cas pratique", matiere: "Droit commercial OHADA", concours: ["infj"],
    ouvrage: "Les 50 Cas Pratiques Corrigés de la Magistrature, Édition 2026",
    resume: "Opposabilité à la société d'un bail signé par le gérant en violation des statuts, puis responsabilité du gérant envers les associés au regard de l'AUSCGIE révisé."
  },
  {
    adresse: "cas-pratique-legitime-defense-agression-nocturne",
    titre: "La légitime défense invoquée après une agression nocturne",
    epreuve: "Cas pratique", matiere: "Droit pénal", concours: ["infj"],
    ouvrage: "Les 50 Cas Pratiques Corrigés de la Magistrature, Édition 2026",
    resume: "Qualification des violences, degré de participation, présomption de légitime défense et juridiction compétente : corrigé-type suivant le quadriptyque pénal."
  },
  {
    adresse: "cas-pratique-accident-voirie-communale",
    titre: "L'accident sur voirie communale et la responsabilité de la commune",
    epreuve: "Cas pratique", matiere: "Droit administratif", concours: ["infj"],
    ouvrage: "Les 50 Cas Pratiques Corrigés de la Magistrature, Édition 2026",
    resume: "Défaut d'entretien normal de l'ouvrage public, régime de responsabilité de la commune et chefs de préjudice indemnisables."
  },
  {
    adresse: "commentaire-article-1376-repetition-indu",
    titre: "Commentaire de l'article 1376 du Code civil : la répétition de l'indu",
    epreuve: "Commentaire d'article", matiere: "Droit civil", concours: ["infj"],
    session: "Concours direct de la magistrature, session d'août 2025",
    ouvrage: "Les Annales des Anciens Sujets Corrigés Magistrature",
    resume: "Sujet tombé en août 2025 : les conditions puis les conséquences de la répétition de l'indu, commentées au plus près du texte."
  },
  {
    adresse: "cas-pratique-kfk-gang-des-barbares",
    titre: "L'affaire KFK et le gang des barbares",
    epreuve: "Cas pratique", matiere: "Droit pénal", concours: ["infj"],
    session: "Concours direct de la magistrature, session de juillet 2025",
    ouvrage: "Les Annales des Anciens Sujets Corrigés Magistrature",
    resume: "Sujet tombé en juillet 2025 : tentative de vol aggravé, association de malfaiteurs, légitime défense, ordre de l'autorité légitime et juridiction compétente."
  },
  {
    adresse: "cas-pratique-magistrature-2023-dorpa",
    titre: "Trois cas pratiques de droit pénal : DORPA, POUASS et la bande de BRI",
    epreuve: "Cas pratique", matiere: "Droit pénal", concours: ["infj"],
    session: "Concours de la magistrature, session de septembre 2023",
    ouvrage: "Le Sésame de Droit Pénal au Concours de la Magistrature",
    resume: "Sujet tombé en 2023 : tentative de vol par un mineur, homicide involontaire et omission de porter secours, complicité et légitime défense."
  },
  {
    adresse: "commentaire-article-28-code-penal-tentative",
    titre: "Commentaire de l'article 28 du Code pénal : la tentative punissable",
    epreuve: "Commentaire d'article", matiere: "Droit pénal", concours: ["infj"],
    ouvrage: "Le Sésame de Droit Pénal au Concours de la Magistrature",
    resume: "La constitution de la tentative punissable, puis sa répression : commentaire entièrement rédigé de l'article 28 du Code pénal ivoirien."
  },
  {
    adresse: "plan-garde-a-vue-droit-ivoirien",
    titre: "La garde à vue en droit ivoirien",
    epreuve: "Plan détaillé", matiere: "Procédure pénale", concours: ["infj"],
    ouvrage: "Le Concours de la Magistrature en 1200 Dissertations Corrigées",
    resume: "Plan détaillé intégral : les conditions de la garde à vue, puis la limitation de sa durée et les garanties de la personne retenue."
  },
  {
    adresse: "plan-recherche-judiciaire-paternite",
    titre: "La recherche judiciaire de paternité en droit ivoirien",
    epreuve: "Plan détaillé", matiere: "Droit de la famille", concours: ["infj"],
    ouvrage: "Le Concours de la Magistrature en 1200 Dissertations Corrigées",
    resume: "Plan détaillé intégral : les cas d'ouverture de l'action, puis ses fins de non-recevoir et ses règles d'exercice (loi de 2019 relative à la filiation)."
  },
  {
    adresse: "commentaire-article-45-loi-divorce-autorite-parentale",
    titre: "Commentaire de l'article 45 de la loi relative au divorce : l'autorité parentale après le divorce",
    epreuve: "Commentaire d'article", matiere: "Droit de la famille", concours: ["infj"],
    ouvrage: "Le Résumé de Droit Civil au Concours de la Magistrature",
    resume: "La continuité de l'autorité parentale malgré le divorce, puis la réserve d'aménagement prévue par la loi du 13 octobre 2022."
  },
  {
    adresse: "dissertation-controle-hierarchique-controle-de-tutelle",
    titre: "Contrôle hiérarchique et contrôle de tutelle",
    epreuve: "Dissertation juridique", matiere: "Droit administratif", concours: ["infj", "greffe", "ena"],
    ouvrage: "Le Résumé de Droit Administratif au Concours de la Magistrature",
    resume: "Deux contrôles opposés dans leurs principes et dans leurs modalités d'exercice : dissertation entièrement rédigée."
  },
  {
    adresse: "greffe-organisation-judiciaire-2026",
    titre: "Organisation judiciaire : cinq questions sur les juridictions ivoiriennes",
    epreuve: "Questions-réponses", matiere: "Organisation judiciaire", concours: ["greffe"],
    session: "Concours direct d'admission 2027, cycle des administrateurs des greffes et parquets, session de juillet 2026",
    ouvrage: "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027",
    resume: "Juridictions spéciales, Tribunal des conflits, juridictions suprêmes, loi du 28 mars 2025 portant organisation des juridictions et ressort de la Cour d'appel d'Abidjan."
  },
  {
    adresse: "greffe-dissertation-contrats-administratifs-2026",
    titre: "Les particularités des contrats administratifs",
    epreuve: "Dissertation juridique", matiere: "Droit administratif", concours: ["greffe"],
    session: "Concours direct d'admission 2027, cycle des administrateurs des greffes et parquets, session de juillet 2026",
    ouvrage: "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027",
    resume: "Ce qui distingue le contrat administratif, de sa formation à son exécution : dissertation entièrement rédigée."
  },
  {
    adresse: "greffe-opeaj-2026",
    titre: "OPEAJ : dix questions sur les institutions et l'administration ivoiriennes",
    epreuve: "Questions-réponses", matiere: "OPEAJ", concours: ["greffe"],
    session: "Concours direct d'entrée 2027, cycle moyen supérieur de l'École des greffes, session d'août 2026",
    ouvrage: "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027",
    resume: "Commissions parlementaires, Sénat, procédure législative, institutions de la République, district autonome, commune et tribunaux de première instance."
  },
  {
    adresse: "penitentiaire-dissertation-amnistie-grace-2026",
    titre: "L'amnistie et la grâce",
    epreuve: "Dissertation juridique", matiere: "Droit pénal", concours: ["penitentiaire"],
    session: "Concours direct d'entrée 2027, cycle des administrateurs des services pénitentiaires, session de juillet 2026",
    ouvrage: "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027",
    resume: "Deux mesures de clémence convergentes dans leur finalité, mais distinctes par leur source, leur forme et la portée de leurs effets."
  },
  {
    adresse: "droits-enfant-eppjej-2026",
    titre: "Droits de l'enfant : dix questions de cours",
    epreuve: "Questions-réponses", matiere: "Droits de l'enfant", concours: ["eppjej"],
    session: "Concours direct d'entrée 2027, cycle des inspecteurs de la protection judiciaire de l'enfance et de la jeunesse, session de juillet 2026",
    ouvrage: "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027",
    resume: "Définition de l'enfant, juge des enfants, détention des mineurs, excuse de minorité, CADBE, admonestation et structures de la protection judiciaire."
  },
  {
    adresse: "cas-pratique-responsabilite-penale-mineur",
    titre: "La responsabilité pénale d'un mineur de douze ans",
    epreuve: "Cas pratique", matiere: "Droits de l'enfant", concours: ["eppjej", "greffe", "penitentiaire"],
    ouvrage: "Le Résumé des Droits de l'Enfant aux Concours Administratifs",
    resume: "Un vol commis par un enfant de douze ans : qualification, règle de l'article 113 du Code pénal, application et conclusion."
  },
  {
    adresse: "dissertation-specificite-justice-penale-mineurs",
    titre: "La spécificité de la justice pénale des mineurs",
    epreuve: "Dissertation juridique", matiere: "Droits de l'enfant", concours: ["eppjej", "greffe", "penitentiaire"],
    ouvrage: "Le Résumé des Droits de l'Enfant aux Concours Administratifs",
    resume: "Une finalité éducative affirmée, mais limitée par la gravité des actes et par les moyens : dissertation entièrement rédigée."
  },
  {
    adresse: "sog-migration-clandestine",
    titre: "« Nous bravons les déserts et les mers… » : la migration clandestine",
    epreuve: "SOG", matiere: "Culture générale", concours: ["infj"],
    session: "Concours direct de l'École de la magistrature, session de juin 2018",
    ouvrage: "Les Annales des Anciens Sujets Corrigés de SOG aux Concours Administratifs",
    resume: "Sujet dialectique : fiche d'analyse en sept rubriques (consigne, type de sujet, termes clés, problématique, plan, barème, pièges), puis devoir intégralement rédigé."
  },
  {
    adresse: "sog-ouvrez-des-ecoles-vous-fermerez-des-prisons",
    titre: "Victor Hugo : « Ouvrez des écoles, vous fermerez des prisons »",
    epreuve: "SOG", matiere: "Culture générale", concours: ["eppjej"],
    session: "Concours direct EPPJEJ, cycle moyen, session 2022",
    ouvrage: "Les Annales des Anciens Sujets Corrigés de SOG aux Concours Administratifs",
    resume: "Éducation et prévention de la délinquance : fiche d'analyse en sept rubriques, puis devoir intégralement rédigé."
  },
  {
    adresse: "sog-ivoirien-nouveau-developpement-durable",
    titre: "« Pas d'ivoirien nouveau, pas de développement durable »",
    epreuve: "SOG", matiere: "Culture générale", concours: ["ena"],
    session: "Concours direct de l'ENA, cycle supérieur, session 2020",
    ouvrage: "Les Annales des Anciens Sujets Corrigés de SOG",
    resume: "Transformation des mentalités ou réformes institutionnelles ? Fiche d'analyse en sept rubriques, puis devoir intégralement rédigé."
  }
];
