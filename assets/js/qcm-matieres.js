/* QCM par matière (pages qcm/<matière>/). Chaque réponse est tirée du contenu de nos ouvrages,
   dont les extraits gratuits sont en ligne : l'explication renvoie au texte applicable.
   Exception : le QCM de culture générale s'appuie sur les sources listées dans "sources" (affichées
   sous le QCM) ; chaque réponse y a été vérifiée. "approfondir" remplace le texte d'introduction
   des ouvrages conseillés quand les questions ne sont pas tirées de ces ouvrages.
   "bonne" = position de la bonne réponse (0 = première).
   "titre" = titre de la page ; "ouvrages" = titres exacts (data.js) des ouvrages conseillés pour approfondir. */
const QCM_MATIERES = [
{
  "slug": "droit-civil", "titre": "QCM de droit civil", "nom": "Droit civil", "concours": ["infj"],
  "intro": "Le mariage selon la loi n° 2019-570 du 26 juin 2019, les quasi-contrats et la responsabilité civile délictuelle : dix questions pour vérifier vos bases avant l'écrit de la magistrature.",
  "ouvrages": ["Le Résumé de Droit Civil au Concours de la Magistrature", "Les 50 Cas Pratiques Corrigés de la Magistrature, Édition 2026", "Le Petit Manuel de Droit Civil"],
  "questions": [
    {"q": "Selon la loi du 26 juin 2019 relative au mariage, quel est l'âge nubile ?", "options": ["16 ans pour la femme et 18 ans pour l'homme", "18 ans révolus pour l'homme et la femme, sans dispense possible", "18 ans révolus, avec dispense possible du procureur", "21 ans pour les deux époux"], "bonne": 1, "explication": "L'âge nubile est fixé à dix-huit ans révolus pour l'homme et la femme indistinctement, sans dispense légale possible (article 2)."},
    {"q": "Quelle est la durée du délai de viduité imposé à la femme avant un remariage ?", "options": ["Cent quatre-vingts jours", "Un an", "Trois cents jours", "Aucun délai n'est imposé"], "bonne": 2, "explication": "La femme ne peut se remarier qu'à l'expiration d'un délai de trois cents jours à compter de la dissolution du précédent mariage, sauf abrégement judiciaire ; le délai prend fin en cas d'accouchement (article 6)."},
    {"q": "L'officier de l'état civil constate un empêchement au mariage. Dans quel délai doit-il en aviser le procureur de la République ?", "options": ["Vingt-quatre heures", "Quarante-huit heures", "Huit jours", "Un mois"], "bonne": 1, "explication": "Il sursoit à la célébration et en avise le procureur dans les quarante-huit heures ; celui-ci peut autoriser à passer outre ou former lui-même l'opposition (article 8)."},
    {"q": "Combien de temps avant la célébration l'officier de l'état civil procède-t-il à la publication du mariage par affichage ?", "options": ["Dix jours francs", "Un mois", "Trois mois", "Quarante-huit heures"], "bonne": 1, "explication": "Le dossier matrimonial est déposé dix jours francs avant la célébration, et la publication par affichage intervient un mois avant celle-ci (articles 15 à 19)."},
    {"q": "La nullité relative du mariage pour vice du consentement est couverte par :", "options": ["La naissance d'un enfant commun", "Un an de mariage", "Six mois de cohabitation depuis la découverte du vice", "La seule volonté du procureur"], "bonne": 2, "explication": "Seul le vice du consentement de l'article 4 ouvre une nullité relative, réservée à l'époux dont le consentement a été vicié et couverte par six mois de cohabitation depuis la découverte du vice (articles 30 à 32)."},
    {"q": "Combien de causes de dissolution du mariage l'article 103 de la loi relative au mariage énumère-t-il ?", "options": ["Deux", "Trois", "Quatre", "Cinq"], "bonne": 3, "explication": "Le décès, le divorce, l'annulation, ainsi que l'absence et le décès judiciairement déclarés en cas de disparition : cinq causes limitativement énumérées."},
    {"q": "Quel quasi-contrat a été dégagé par la jurisprudence, sans texte du Code civil ?", "options": ["La gestion d'affaires", "La répétition de l'indu", "L'enrichissement sans cause", "Le mandat"], "bonne": 2, "explication": "Le Code civil organise la gestion d'affaires et le paiement de l'indu. L'enrichissement sans cause a été dégagé par la jurisprudence sur le fondement de l'équité ; il est sanctionné par l'action de in rem verso."},
    {"q": "Le gérant d'affaires a-t-il droit à une rémunération ?", "options": ["Oui, fixée par le juge", "Non, la gestion d'affaires est par nature désintéressée", "Oui, si l'affaire a été bien administrée", "Oui, à hauteur de ses dépenses majorées"], "bonne": 1, "explication": "Le maître de l'affaire rembourse les dépenses utiles ou nécessaires et exécute les engagements pris en son nom (article 1375), mais le gérant n'a droit à aucune rémunération."},
    {"q": "Dans l'action de in rem verso, l'indemnité due à l'appauvri est :", "options": ["Égale au montant de l'enrichissement", "Égale au montant de l'appauvrissement", "Plafonnée à la plus faible des deux sommes, enrichissement et appauvrissement", "Fixée librement par le juge"], "bonne": 2, "explication": "L'action est subsidiaire et l'indemnité est plafonnée à la plus faible des deux sommes que représentent l'enrichissement et l'appauvrissement."},
    {"q": "Quelles sont les trois conditions de la responsabilité du fait personnel (articles 1382 et 1383 du Code civil) ?", "options": ["Une faute, un dommage et un lien de causalité", "Une faute intentionnelle, un dommage et un contrat", "Un dommage, la garde d'une chose et un lien de causalité", "Une faute lourde, un préjudice moral et une mise en demeure"], "bonne": 0, "explication": "Trois conditions cumulatives : la faute, intentionnelle ou d'imprudence, le dommage certain, direct et personnel, et le lien de causalité, dont la preuve incombe à la victime."}
  ]
},
{
  "slug": "droit-penal", "titre": "QCM de droit pénal", "nom": "Droit pénal et procédure pénale", "concours": ["infj"],
  "intro": "Tentative, légitime défense, garde à vue, escroquerie et corruption : dix questions sur le Code pénal du 26 juin 2019 et le Code de procédure pénale de 2018.",
  "ouvrages": ["Le Sésame de Droit Pénal au Concours de la Magistrature", "1000 Fiches de Cours pour Réussir l'Écrit de la Magistrature", "Le Petit Manuel de Droit Pénal"],
  "questions": [
    {"q": "Quel critère l'article 28 du Code pénal ivoirien retient-il pour caractériser la tentative ?", "options": ["Le commencement d'exécution", "Un acte impliquant, sans équivoque, l'intention irrévocable de commettre l'infraction", "La simple résolution criminelle exprimée devant témoins", "Tout acte préparatoire"], "bonne": 1, "explication": "Le texte ivoirien ne parle pas de commencement d'exécution : il exige un acte révélant sans équivoque l'intention irrévocable de l'auteur, et un échec dû à des circonstances indépendantes de sa volonté."},
    {"q": "La tentative de délit est-elle punissable ?", "options": ["Toujours", "Jamais", "Seulement dans les cas prévus par une disposition de la loi", "Seulement si le délit est puni de plus de cinq ans"], "bonne": 2, "explication": "La tentative de crime est toujours punissable ; la tentative de délit ne l'est que dans les cas déterminés par la loi (article 28, alinéa 2)."},
    {"q": "L'auteur tire sur une victime déjà morte, ce qu'il ignorait. Que décide le Code pénal ?", "options": ["Il n'y a pas d'infraction, faute d'objet", "La tentative est punissable alors même que le but ne pouvait être atteint", "Seule une contravention peut être retenue", "Le juge doit relaxer au bénéfice du doute"], "bonne": 1, "explication": "La tentative est punissable alors même que le but recherché ne pouvait être atteint en raison d'une circonstance de fait (article 28, alinéa 3) : l'infraction impossible est réprimée."},
    {"q": "Quelles qualités la défense doit-elle présenter pour constituer la légitime défense (article 97 du Code pénal) ?", "options": ["Être nécessaire, concomitante et proportionnée", "Être préméditée et proportionnée", "Être postérieure à l'attaque et mesurée", "Être autorisée par un officier de police judiciaire"], "bonne": 0, "explication": "L'attaque doit être actuelle et injuste, et ne pouvoir être écartée autrement ; la défense doit être nécessaire, concomitante et proportionnée. Une riposte postérieure à l'attaque n'est pas couverte."},
    {"q": "Dans quel cas la loi présume-t-elle la légitime défense (article 98 du Code pénal) ?", "options": ["Lorsqu'on repousse de jour l'entrée d'un inconnu dans son jardin", "Lorsqu'on repousse pendant la nuit l'escalade ou l'effraction d'une maison habitée", "Lorsqu'on poursuit un voleur qui s'enfuit", "Dans tous les cas de vol simple"], "bonne": 1, "explication": "La présomption joue pour celui qui repousse pendant la nuit l'escalade ou l'effraction des clôtures, murs ou entrées d'une maison habitée, ou qui se défend contre les auteurs de vols ou de pillages exécutés avec violence. Elle ne s'étend pas à une effraction commise de jour."},
    {"q": "Qui peut décider d'un placement en garde à vue ?", "options": ["L'agent de police judiciaire", "L'officier de police judiciaire", "Le greffier", "La victime"], "bonne": 1, "explication": "L'officier de police judiciaire peut placer en garde à vue une personne contre laquelle existent des indices graves et concordants ; l'agent de police judiciaire n'a pas ce pouvoir (articles 33 et 71 du Code de procédure pénale)."},
    {"q": "Quelle est la durée de la garde à vue d'un majeur ?", "options": ["Vingt-quatre heures, sans prolongation", "Quarante-huit heures, prolongeable de quarante-huit heures par le procureur", "Soixante-douze heures", "Huit jours"], "bonne": 1, "explication": "L'officier ne peut retenir la personne plus de quarante-huit heures ; le procureur peut autoriser une prolongation de quarante-huit heures (article 72 du Code de procédure pénale)."},
    {"q": "À partir de quand court la garde à vue ?", "options": ["De l'arrivée de la personne dans le bureau de l'enquêteur", "De l'heure de l'appréhension ou de la présentation dans les locaux", "De la notification des droits", "De l'avis donné au procureur"], "bonne": 1, "explication": "La garde à vue court de l'heure de l'appréhension ou de la présentation dans les locaux, et les gardes à vue antérieures pour les mêmes faits s'imputent sur sa durée (article 73)."},
    {"q": "Un simple mensonge suffit-il à constituer l'escroquerie ?", "options": ["Oui, dès lors qu'il a déterminé la remise", "Non, il doit être corroboré par des éléments extérieurs, mise en scène ou intervention d'un tiers", "Oui, s'il est écrit", "Non, l'escroquerie suppose toujours un faux document"], "bonne": 1, "explication": "Le simple mensonge ne suffit pas : il doit être corroboré par des éléments extérieurs qui constituent la manœuvre frauduleuse. L'article 471 vise aussi le faux nom, la fausse qualité et l'abus de qualité vraie."},
    {"q": "La corruption d'un agent public est-elle consommée si l'acte promis n'a pas été accompli ?", "options": ["Non, l'acte doit avoir été accompli", "Oui, elle est consommée par la sollicitation ou la proposition, même sans suite", "Seulement si l'avantage a été remis", "Seulement en cas de corruption active"], "bonne": 1, "explication": "Corruption passive et corruption active sont deux infractions distinctes et autonomes, chacune consommée par la sollicitation ou la proposition, même sans suite (ordonnance du 20 septembre 2013, articles 28 et 29)."}
  ]
},
{
  "slug": "droit-administratif", "titre": "QCM de droit administratif", "nom": "Droit administratif", "concours": ["infj", "greffe", "penitentiaire", "eppjej", "ena"],
  "intro": "Les grands arrêts à connaître par cœur, de Blanco à Société des Centaures routiers : dix questions sur la jurisprudence administrative applicable en Côte d'Ivoire.",
  "ouvrages": ["Les Fiches d'Arrêts de Droit Administratif, Édition 2026", "Le Résumé de Droit Administratif au Concours de la Magistrature", "Le Droit Administratif en 125 Dissertations Corrigées, Tome II"],
  "questions": [
    {"q": "Que décide l'arrêt Blanco (Tribunal des conflits, 8 février 1873) ?", "options": ["La responsabilité de l'État pour les dommages causés par un service public obéit à des règles spéciales, distinctes du Code civil", "L'État est irresponsable des dommages causés par ses agents", "Les litiges impliquant l'État relèvent toujours du juge judiciaire", "Le préfet ne peut jamais élever le conflit"], "bonne": 0, "explication": "La responsabilité de l'État ne peut être régie par les principes du Code civil ; elle obéit à des règles spéciales et son contentieux relève de la juridiction administrative. C'est l'arrêt fondateur de l'autonomie du droit administratif."},
    {"q": "Quel arrêt est considéré comme l'équivalent ivoirien de l'arrêt Blanco ?", "options": ["Diby Yao Georges", "Société des Centaures routiers", "Mlle Audran", "SATMACI c/ Kripa Amoin"], "bonne": 1, "explication": "Par l'arrêt Société des Centaures routiers (Chambre administrative de la Cour suprême, 14 janvier 1970), le juge applique le droit administratif au bac exploité par l'État : l'unité de juridiction n'emporte pas unité du droit applicable."},
    {"q": "Selon l'arrêt Quéralt, le pouvoir hiérarchique :", "options": ["N'existe qu'en vertu d'un texte exprès", "Existe de plein droit, sans texte, et permet d'annuler ou de réformer pour des motifs de légalité comme d'opportunité", "Ne permet qu'un contrôle de légalité", "Appartient au seul juge administratif"], "bonne": 1, "explication": "Le pouvoir hiérarchique existe de plein droit, sans texte : le supérieur peut annuler ou réformer les décisions de son subordonné, pour l'illégalité comme pour l'inopportunité, sauf texte contraire."},
    {"q": "Que retient l'arrêt Dame Lamotte (Conseil d'État, 17 février 1950) ?", "options": ["Le recours pour excès de pouvoir n'est ouvert que si un texte le prévoit", "Le recours pour excès de pouvoir est ouvert même sans texte contre tout acte administratif, et ne peut être exclu que par une disposition législative expresse", "Les concessions de terres échappent à tout recours", "Le juge ne contrôle pas les actes du préfet"], "bonne": 1, "explication": "Le recours pour excès de pouvoir est un principe général du droit, reçu en droit ivoirien par les arrêts Diby Yao Georges et Deflorin."},
    {"q": "Quel arrêt est l'arrêt fondateur du recours pour excès de pouvoir ivoirien ?", "options": ["Diby Yao Georges (1er avril 1964)", "Copagri c/ Cimaf (18 mai 2016)", "Kouamé Kouadio (11 décembre 1970)", "By Jules (20 février 1963)"], "bonne": 0, "explication": "La révocation d'un interprète, dépourvue de base légale, est annulée pour erreur de droit : le recours pour excès de pouvoir est ouvert même en l'absence de texte."},
    {"q": "D'après l'arrêt Benjamin (1933), une mesure de police restreignant la liberté de réunion est légale :", "options": ["Dès qu'un trouble est possible", "Seulement si elle est nécessaire, la menace ne pouvant être prévenue par des mesures moins contraignantes", "Si elle est demandée par une association", "Toujours, le maire étant seul juge de l'ordre public"], "bonne": 1, "explication": "Le juge exerce un contrôle de proportionnalité des mesures de police : l'interdiction n'est légale que si les troubles graves ne peuvent être évités autrement."},
    {"q": "Selon l'arrêt Dame Cachet (1922), un acte individuel créateur de droits et illégal peut être retiré :", "options": ["À tout moment", "Dans le délai du recours contentieux et, si un recours a été formé, tant que le juge n'a pas statué", "Jamais", "Dans un délai de cinq ans"], "bonne": 1, "explication": "C'est l'arrêt de principe du retrait des actes illégaux créateurs de droits ; il ne concerne pas les actes réguliers, dont le retrait est en principe impossible."},
    {"q": "Dans l'arrêt Anguet (1911), l'usager blessé par la faute personnelle d'agents dans un bureau de poste fermé avant l'heure peut :", "options": ["Agir uniquement contre les agents", "Demander réparation intégrale à l'Administration, en raison du cumul de fautes", "N'obtenir qu'une réparation partielle", "Agir seulement devant le juge pénal"], "bonne": 1, "explication": "Lorsque le dommage résulte à la fois d'une faute de service et d'une faute personnelle, la victime peut demander réparation intégrale à l'Administration : c'est le cumul de fautes."},
    {"q": "L'arrêt Regnault-Desroziers (1919) illustre :", "options": ["La responsabilité pour faute lourde", "La responsabilité sans faute pour choses dangereuses", "L'irresponsabilité de l'État en temps de guerre", "La théorie de l'imprévision"], "bonne": 1, "explication": "L'accumulation d'explosifs près d'une agglomération crée des risques excédant les limites normales du voisinage : la responsabilité de l'État est engagée sans faute."},
    {"q": "Que prévoit l'arrêt Compagnie générale d'éclairage de Bordeaux (30 mars 1916) en cas de bouleversement imprévisible de l'économie du contrat ?", "options": ["Le cocontractant peut cesser l'exécution", "Le contrat est résilié de plein droit", "Le cocontractant doit poursuivre l'exécution mais a droit à une indemnité couvrant une partie du déficit", "L'Administration doit couvrir l'intégralité des pertes"], "bonne": 2, "explication": "C'est l'arrêt fondateur de la théorie de l'imprévision : obligation de continuer, en contrepartie d'une indemnité partielle."}
  ]
},
{
  "slug": "droits-de-l-enfant", "titre": "QCM sur les droits de l'enfant", "nom": "Droits de l'enfant", "concours": ["eppjej", "greffe", "penitentiaire"],
  "intro": "Définition de l'enfant, seuils d'âge de la responsabilité pénale, juridictions pour mineurs et mesures éducatives : dix questions pour le concours EPPJEJ et les concours INFJ.",
  "ouvrages": ["Le Résumé des Droits de l'Enfant aux Concours Administratifs", "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027"],
  "questions": [
    {"q": "Selon l'article 1er de la Convention internationale relative aux droits de l'enfant, l'enfant est :", "options": ["Tout être humain âgé de moins de seize ans", "Tout être humain âgé de moins de dix-huit ans, sauf majorité atteinte plus tôt en vertu de la loi applicable", "Tout être humain âgé de moins de vingt et un ans", "Tout mineur non émancipé de moins de quinze ans"], "bonne": 1, "explication": "Le droit ivoirien s'aligne sur cette définition : la loi n° 2019-572 du 26 juin 2019 relative à la minorité qualifie de mineur la personne qui n'a pas atteint dix-huit ans accomplis."},
    {"q": "Quand la Charte africaine des droits et du bien-être de l'enfant (CADBE) a-t-elle été adoptée ?", "options": ["Le 20 novembre 1989 à New York", "Le 11 juillet 1990 à Addis-Abeba", "Le 29 novembre 1999 à Abidjan", "Le 26 juin 2019 à Yamoussoukro"], "bonne": 1, "explication": "Adoptée le 11 juillet 1990 à Addis-Abeba par la conférence des chefs d'État de l'OUA, la Charte est entrée en vigueur le 29 novembre 1999."},
    {"q": "En deçà de quel âge les faits commis par un mineur ne sont-ils susceptibles ni de qualification ni de poursuites pénales ?", "options": ["Huit ans", "Dix ans", "Treize ans", "Seize ans"], "bonne": 1, "explication": "C'est le seuil d'irresponsabilité absolue de l'article 113 du Code pénal, modifié par la loi du 21 décembre 2021. L'enfant peut seulement faire l'objet de mesures de protection."},
    {"q": "Un enfant de douze ans commet un vol. Quelle peine peut-il encourir ?", "options": ["La moitié de la peine encourue par un majeur", "Aucune peine : il bénéficie de droit de l'excuse absolutoire de minorité", "Une peine d'emprisonnement avec sursis", "Une amende seulement"], "bonne": 1, "explication": "Âgé de dix ans au moins et de moins de treize ans, il ne peut se voir infliger aucune peine ; seules des mesures de protection, d'assistance, de surveillance et d'éducation peuvent être prononcées par le juge des enfants."},
    {"q": "À partir de treize ans, de quoi le mineur bénéficie-t-il ?", "options": ["De l'excuse absolutoire de minorité", "De l'excuse atténuante de minorité, qui réduit de moitié les peines encourues", "D'aucune excuse particulière", "D'une immunité totale pour les délits"], "bonne": 1, "explication": "À partir de treize ans, le mineur ne bénéficie plus que de l'excuse atténuante de minorité (article 113 du Code pénal)."},
    {"q": "Un mineur de treize ans et plus, auteur d'une contravention, peut-il être condamné à l'emprisonnement ?", "options": ["Oui, pour dix jours au plus", "Non : seuls un travail d'intérêt général ou une admonestation peuvent être prononcés", "Oui, si la contravention est de cinquième classe", "Oui, avec l'accord des parents"], "bonne": 1, "explication": "L'excuse atténuante de minorité exclut, en matière de contravention, toute peine privative de liberté."},
    {"q": "Quel juge décide des mesures de protection et d'assistance éducative à l'égard d'un enfant en danger ?", "options": ["Le juge des tutelles", "Le juge des enfants", "Le juge d'instruction", "Le président du tribunal du travail"], "bonne": 1, "explication": "Le juge des enfants intervient lorsque la santé, la sécurité, la moralité ou les conditions d'éducation du mineur sont gravement compromises, en s'appuyant sur le Service de la protection judiciaire de l'enfance et de la jeunesse."},
    {"q": "Lorsque les parents sont défaillants, quel magistrat confie la garde de l'enfant à la personne ou à l'institution qui l'a recueilli ?", "options": ["Le juge des tutelles", "Le procureur de la République", "Le juge des enfants, dans tous les cas", "Le maire"], "bonne": 0, "explication": "Le juge des tutelles décide, par ordonnance et dans l'intérêt supérieur de l'enfant, de confier tout ou partie de l'exercice de l'autorité parentale, notamment la garde (loi du 26 juin 2019 relative à la minorité)."},
    {"q": "Quelle juridiction est compétente pour les crimes commis par des mineurs de seize ans au moins ?", "options": ["Le Tribunal pour enfants", "Le Tribunal criminel pour mineurs", "Le tribunal criminel de droit commun", "Le juge des enfants statuant seul"], "bonne": 1, "explication": "Le Tribunal pour enfants connaît des délits, des contraventions de cinquième classe et des crimes commis par les mineurs de moins de seize ans ; le Tribunal criminel pour mineurs juge les crimes des mineurs de seize ans au moins."},
    {"q": "Que signifie le sigle COM ?", "options": ["Comité d'orientation des mineurs", "Centre d'observation des mineurs", "Commission d'office des magistrats", "Centre officiel de médiation"], "bonne": 1, "explication": "Le Centre d'observation des mineurs accueille les mineurs en conflit avec la loi placés par le juge des enfants, pour l'observation de leur personnalité, de leur comportement et de leur milieu."}
  ]
},
{
  "slug": "organisation-judiciaire", "titre": "QCM d'organisation judiciaire", "nom": "Organisation judiciaire", "concours": ["greffe", "penitentiaire", "eppjej", "infj"],
  "intro": "Juridictions suprêmes, Tribunal des conflits, loi du 28 mars 2025 portant organisation des juridictions et juridictions spécialisées : dix questions à jour des dernières réformes.",
  "ouvrages": ["Le Résumé d'Organisation Judiciaire aux Concours Administratifs", "Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027", "Le Petit Manuel d'Organisation Judiciaire et Informatique"],
  "questions": [
    {"q": "Combien la Côte d'Ivoire compte-t-elle de juridictions suprêmes ?", "options": ["Une, la Cour suprême", "Deux, la Cour de cassation et le Conseil d'État", "Trois, la Cour de cassation, le Conseil d'État et la Cour des comptes", "Quatre, en comptant le Conseil constitutionnel"], "bonne": 2, "explication": "Ces trois juridictions, consacrées par la révision constitutionnelle du 19 mars 2020, ont succédé aux chambres judiciaire, administrative et des comptes de l'ancienne Cour suprême."},
    {"q": "Le Conseil constitutionnel est-il la juridiction suprême d'un ordre de juridictions ?", "options": ["Oui, de l'ordre judiciaire", "Oui, de l'ordre administratif", "Non, il se situe en dehors de cette architecture", "Oui, de tous les ordres à la fois"], "bonne": 2, "explication": "Juge de la constitutionnalité des lois et du contentieux électoral, le Conseil constitutionnel n'est pas une juridiction suprême d'un ordre de juridictions."},
    {"q": "Quel texte porte aujourd'hui organisation des juridictions en Côte d'Ivoire ?", "options": ["La loi n° 61-155 du 18 mai 1961", "La loi n° 2025-219 du 28 mars 2025", "La loi organique n° 2020-968 du 17 décembre 2020", "Le décret n° 2025-633 du 30 juillet 2025"], "bonne": 1, "explication": "La loi du 28 mars 2025 abroge la loi du 18 mai 1961 portant organisation judiciaire, texte plus que soixantenaire."},
    {"q": "Quel est le rôle du Tribunal des conflits ?", "options": ["Juger en appel les décisions des cours d'appel", "Désigner l'ordre de juridictions compétent lorsque naissent des difficultés de compétence entre l'ordre judiciaire et l'ordre administratif", "Contrôler la constitutionnalité des lois", "Juger les comptes des comptables publics"], "bonne": 1, "explication": "Régi par la loi organique du 21 octobre 2020, il ne tranche pas le fond des litiges, sauf en cas de contrariété de décisions aboutissant à un déni de justice. Ses décisions ne sont susceptibles d'aucun recours."},
    {"q": "Qu'appelle-t-on un conflit négatif de compétence ?", "options": ["Deux juridictions d'un même ordre rendent des décisions contraires", "Les juridictions des deux ordres se sont successivement déclarées incompétentes pour un même litige", "Une juridiction judiciaire refuse de se dessaisir d'un litige administratif", "Le justiciable renonce à son action"], "bonne": 1, "explication": "Le justiciable se trouve alors sans juge ; le Tribunal des conflits règle ce conflit en désignant l'ordre compétent. Le conflit positif survient au contraire quand une juridiction judiciaire refuse de se dessaisir."},
    {"q": "La Cour de cassation rejuge-t-elle les faits ?", "options": ["Oui, toujours", "Non : elle statue sur les pourvois sans rejuger les faits et veille à l'unité d'interprétation du droit", "Oui, en matière pénale seulement", "Oui, lorsque l'affaire lui est renvoyée par le Conseil d'État"], "bonne": 1, "explication": "Juridiction suprême de l'ordre judiciaire, régie par la loi organique du 17 décembre 2020, elle statue sur les pourvois formés contre les décisions rendues en dernier ressort."},
    {"q": "Quelle innovation majeure la loi du 28 mars 2025 apporte-t-elle à l'ordre administratif ?", "options": ["Elle supprime le Conseil d'État", "Elle en fait un ordre complet à trois niveaux : tribunaux administratifs, cours administratives d'appel et Conseil d'État", "Elle confie le contentieux administratif à la Cour de cassation", "Elle rétablit la chambre administrative de la Cour suprême"], "bonne": 1, "explication": "Le dualisme juridictionnel, affirmé par la Constitution de 2016, reçoit ainsi une traduction organique complète."},
    {"q": "Qu'a décidé le décret n° 2025-633 du 30 juillet 2025 ?", "options": ["Il a supprimé les tribunaux de première instance", "Il a érigé les sections détachées en tribunaux de première instance, portant leur nombre à cinquante", "Il a créé la Cour d'appel de commerce", "Il a fixé le statut des greffiers"], "bonne": 1, "explication": "Tirant les conséquences de la suppression de la notion de section détachée par la loi de 2025, le décret a érigé les trente-cinq sections existantes en tribunaux de première instance de plein exercice."},
    {"q": "Quelle juridiction connaît des infractions économiques et financières d'une particulière gravité ou complexité ?", "options": ["Le Tribunal de commerce d'Abidjan", "Le Pôle pénal économique et financier", "La Cour des comptes", "Le Tribunal militaire d'Abidjan"], "bonne": 1, "explication": "Régi par la loi du 11 mars 2022, le Pôle pénal économique et financier juge notamment les détournements de deniers publics, la corruption et le blanchiment de capitaux ; ses décisions sont frappées d'appel devant la Cour d'appel d'Abidjan."},
    {"q": "Devant quelle juridiction sont portés les appels contre les décisions du Tribunal de commerce d'Abidjan ?", "options": ["La Cour d'appel d'Abidjan", "La Cour d'appel de commerce d'Abidjan", "La Cour de cassation directement", "Le Conseil d'État"], "bonne": 1, "explication": "Le Tribunal de commerce d'Abidjan, créé par la loi du 8 décembre 2016, relève en appel de la Cour d'appel de commerce d'Abidjan, juridiction spécialisée de second degré."}
  ]
},
{
  "slug": "procedure-penale", "titre": "QCM de procédure pénale", "nom": "Procédure pénale", "concours": ["infj", "greffe", "penitentiaire"],
  "intro": "Principes directeurs, action publique et action civile, prescription, flagrance, garde à vue et comparution sur reconnaissance préalable de culpabilité : dix questions sur le Code de procédure pénale de 2018, tel que modifié en 2022.",
  "ouvrages": ["Le Sésame de Droit Pénal au Concours de la Magistrature", "Le Petit Manuel de Droit Pénal"],
  "questions": [
    {"q": "Quelle garantie l'article 1er du Code de procédure pénale pose-t-il, sauf exception prévue par la loi ?", "options": ["La gratuité de la justice pénale", "La séparation des fonctions de poursuite, d'instruction et de jugement", "La collégialité de toutes les juridictions répressives", "Le caractère public de l'enquête"], "bonne": 1, "explication": "La procédure pénale doit, sauf exception prévue par la loi, garantir la séparation des fonctions de poursuite, d'instruction et de jugement (article 1er)."},
    {"q": "Selon l'article 3, les mesures de contrainte visant la personne mise en cause doivent être :", "options": ["Décidées par l'officier de police judiciaire seul", "Limitées aux nécessités de la procédure et proportionnées à la gravité de l'infraction, sous le contrôle de l'autorité judiciaire", "Systématiques en matière criminelle", "Autorisées par la victime"], "bonne": 1, "explication": "Prises sous le contrôle de l'autorité judiciaire, elles doivent être limitées aux nécessités de la procédure, proportionnées à la gravité de l'infraction reprochée et ne pas porter atteinte à la dignité de la personne (article 3)."},
    {"q": "Que garantit l'article 5 du Code de procédure pénale à toute personne condamnée ?", "options": ["Une remise de peine automatique", "Le droit de faire examiner sa cause par une juridiction supérieure", "Le droit d'être jugée par un jury", "L'effacement de la condamnation après cinq ans"], "bonne": 1, "explication": "L'article 5 impose qu'il soit statué définitivement dans un délai raisonnable et reconnaît à toute personne condamnée le droit de faire examiner sa cause par une juridiction supérieure."},
    {"q": "La victime a porté son action en réparation devant le juge civil compétent. Peut-elle ensuite la porter devant la juridiction répressive ?", "options": ["Oui, à tout moment", "Non, sauf si le ministère public a saisi la juridiction répressive avant qu'un jugement sur le fond ait été rendu par le juge civil", "Oui, si elle se désiste devant le juge civil", "Non, en aucun cas"], "bonne": 1, "explication": "C'est la règle electa una via de l'article 10 : la partie qui a exercé son action devant la juridiction civile compétente ne peut la porter devant la juridiction répressive, sauf si celle-ci a été saisie par le ministère public avant un jugement civil sur le fond."},
    {"q": "Lequel de ces événements n'est pas une cause d'extinction de l'action publique selon l'article 11 ?", "options": ["L'amnistie", "La mort de la personne poursuivie", "L'indemnisation de la victime par l'auteur", "L'abrogation de la loi pénale"], "bonne": 2, "explication": "L'action publique s'éteint par la mort de la personne poursuivie, la prescription, l'amnistie, l'abrogation de la loi pénale et la chose jugée, et aussi par la transaction lorsque la loi le prévoit ou le retrait de plainte lorsque la plainte est une condition de la poursuite (article 11). L'indemnisation de la victime n'en fait pas partie."},
    {"q": "Par quel délai l'action publique se prescrit-elle en matière de crime (article 12, dans sa rédaction issue de la loi du 11 mars 2022) ?", "options": ["Trois années révolues", "Cinq années révolues", "Dix années révolues", "Vingt années révolues"], "bonne": 2, "explication": "En matière de crime, l'action publique se prescrit par dix années révolues ; si des actes d'instruction ou de poursuite ont été accomplis, le délai court à compter du dernier acte (article 12)."},
    {"q": "Quelles infractions l'article 12 déclare-t-il imprescriptibles ?", "options": ["Tous les crimes punis de l'emprisonnement à vie", "Les crimes contre l'humanité, le génocide, les crimes de guerre et le crime d'agression", "Les crimes commis contre des mineurs", "Les détournements de deniers publics"], "bonne": 1, "explication": "L'article 12 rend imprescriptibles les crimes contre l'humanité, le génocide, les crimes de guerre et le crime d'agression."},
    {"q": "Comment l'article 77 définit-il le crime ou le délit flagrant ?", "options": ["L'infraction commise en présence d'un magistrat", "L'infraction qui est en train de se commettre ou qui vient de se commettre", "Toute infraction commise de nuit", "L'infraction avouée par son auteur"], "bonne": 1, "explication": "Est flagrant le crime ou le délit qui est en train de se commettre ou qui vient de se commettre. Il l'est aussi lorsque, dans un temps très voisin de l'action, la personne est poursuivie par la clameur publique ou trouvée en possession d'objets ou de traces laissant penser qu'elle a participé à l'infraction (article 77)."},
    {"q": "Pendant la garde à vue, l'examen médical de la personne retenue est :", "options": ["Interdit avant la fin de la mesure", "De droit si la personne gardée à vue ou un membre de sa famille le demande", "Laissé à l'appréciation de l'officier de police judiciaire", "Réservé aux mineurs"], "bonne": 1, "explication": "L'examen médical est de droit si la personne gardée à vue ou un membre de sa famille le demande (article 75)."},
    {"q": "La comparution sur reconnaissance préalable de culpabilité (CRPC) est ouverte pour :", "options": ["Tous les crimes", "Les délits punis de cinq ans d'emprisonnement au plus, lorsque le prévenu reconnaît les faits", "Les infractions commises par des mineurs", "Les délits de presse seulement"], "bonne": 1, "explication": "Le procureur de la République peut y recourir, d'office ou à la demande du prévenu, pour un délit passible de cinq ans d'emprisonnement au plus (article 521, rédaction de 2022). Elle est exclue notamment lorsqu'un mineur est poursuivi, pour les délits de presse et les agressions sexuelles (article 530)."}
  ]
},
{
  "slug": "droit-ohada", "titre": "QCM de droit OHADA", "nom": "Droit des affaires OHADA", "concours": ["infj"],
  "intro": "Commerçant, prescription, bail à usage professionnel, fonds de commerce et sociétés commerciales : dix questions sur l'Acte uniforme relatif au droit commercial général et l'Acte uniforme relatif aux sociétés commerciales et au GIE.",
  "ouvrages": ["Le Résumé de Droit Commercial au Concours de la Magistrature", "Le Petit Manuel de Droit Commercial"],
  "questions": [
    {"q": "Selon l'article 2 de l'AUDCG, qui est commerçant ?", "options": ["Toute personne immatriculée au RCCM", "Celui qui fait de l'accomplissement d'actes de commerce par nature sa profession", "Celui qui réalise un acte de commerce, même isolé", "Toute personne qui exploite une entreprise individuelle"], "bonne": 1, "explication": "Est commerçant celui qui fait de l'accomplissement d'actes de commerce par nature sa profession (article 2 AUDCG). L'immatriculation est une obligation du commerçant, pas le critère de sa qualité."},
    {"q": "Comment se prouvent les actes de commerce à l'égard des commerçants (article 5 AUDCG) ?", "options": ["Uniquement par écrit", "Par tous moyens, même par voie électronique", "Par acte authentique au-delà d'un certain montant", "Par témoins seulement"], "bonne": 1, "explication": "Les actes de commerce se prouvent par tous moyens, même par voie électronique, à l'égard des commerçants. Tout commencement de preuve par écrit autorise le commerçant à prouver par tous moyens contre un non-commerçant (article 5 AUDCG)."},
    {"q": "Par quel délai se prescrivent les obligations nées à l'occasion de leur commerce entre commerçants, ou entre commerçants et non-commerçants ?", "options": ["Deux ans", "Trois ans", "Cinq ans", "Dix ans"], "bonne": 2, "explication": "Elles se prescrivent par cinq ans si elles ne sont pas soumises à des prescriptions plus courtes (article 16 AUDCG)."},
    {"q": "À quelle condition le preneur d'un bail à usage professionnel acquiert-il le droit au renouvellement ?", "options": ["Avoir exploité l'activité prévue au bail pendant au moins deux ans, conformément au bail", "Être immatriculé au RCCM depuis cinq ans", "Avoir payé une indemnité au bailleur", "Avoir conclu un bail d'au moins neuf ans"], "bonne": 0, "explication": "Le droit au renouvellement est acquis au preneur qui justifie avoir exploité, conformément aux stipulations du bail, l'activité prévue pendant une durée minimale de deux ans (article 123 AUDCG)."},
    {"q": "Le bailleur peut-il s'opposer au renouvellement du bail à usage professionnel ?", "options": ["Non, jamais", "Oui, librement et sans contrepartie", "Oui, en réglant au preneur une indemnité d'éviction", "Oui, mais seulement si le bail est à durée indéterminée"], "bonne": 2, "explication": "Le bailleur peut s'opposer au droit au renouvellement, que le bail soit à durée déterminée ou indéterminée, en réglant au locataire une indemnité d'éviction (article 126 AUDCG)."},
    {"q": "Quels éléments le fonds de commerce comprend-il nécessairement (article 136 AUDCG) ?", "options": ["Le droit au bail et le matériel", "La clientèle et l'enseigne, ou la clientèle et le nom commercial", "Les marchandises en stock et la clientèle", "Les brevets et les marques"], "bonne": 1, "explication": "Le fonds de commerce comprend nécessairement la clientèle et l'enseigne, ou la clientèle et le nom commercial, sans préjudice de leur cumul (article 136). Les autres éléments, comme le droit au bail ou le matériel, sont facultatifs (article 137)."},
    {"q": "À partir de quand une société commerciale jouit-elle de la personnalité juridique ?", "options": ["De la signature des statuts", "De la libération du capital", "De son immatriculation au RCCM, sauf disposition contraire de l'acte uniforme", "De sa première assemblée générale"], "bonne": 2, "explication": "Toute société jouit de la personnalité juridique à compter de son immatriculation au registre du commerce et du crédit mobilier, à moins que l'acte uniforme en dispose autrement (article 98 AUSCGIE). La société en participation n'est pas immatriculée (article 97)."},
    {"q": "Dans la société en nom collectif, les associés :", "options": ["Ne répondent des dettes qu'à concurrence de leurs apports", "Sont tous commerçants et répondent indéfiniment et solidairement des dettes sociales", "Peuvent être poursuivis par les créanciers sans mise en demeure préalable de la société", "Ne sont pas commerçants"], "bonne": 1, "explication": "Tous les associés de la SNC sont commerçants et répondent indéfiniment et solidairement des dettes sociales (article 270 AUSCGIE). Les créanciers ne peuvent toutefois les poursuivre que soixante jours au moins après avoir vainement mis en demeure la société (article 271)."},
    {"q": "Quel est le capital social minimum de la société anonyme, et combien d'actionnaires faut-il au moins ?", "options": ["1 000 000 FCFA et deux actionnaires", "10 000 000 FCFA, et la société peut ne comprendre qu'un seul actionnaire", "10 000 000 FCFA et sept actionnaires", "100 000 000 FCFA et trois actionnaires"], "bonne": 1, "explication": "La société anonyme peut ne comprendre qu'un seul actionnaire (article 385 AUSCGIE) et son capital social minimum est fixé à dix millions de francs CFA (article 387)."},
    {"q": "Le groupement d'intérêt économique (GIE) :", "options": ["Doit être constitué avec un capital minimum", "A pour but premier de réaliser et partager des bénéfices", "Peut être constitué sans capital et ne donne pas lieu par lui-même à réalisation et partage de bénéfices", "Ne peut réunir que des commerçants"], "bonne": 2, "explication": "Le GIE peut être constitué sans capital (article 869 AUSCGIE) et ne donne pas lieu par lui-même à réalisation et partage de bénéfices (article 870). Deux personnes physiques ou morales au moins peuvent le constituer, y compris des membres de professions libérales (article 871)."}
  ]
},
{
  "slug": "culture-generale",
  "titre": "QCM de culture générale",
  "nom": "Culture générale",
  "concours": [
    "infj",
    "greffe",
    "penitentiaire",
    "eppjej",
    "ena"
  ],
  "intro": "Indépendance, symboles de la République, grandes organisations africaines et internationales : dix questions de culture générale pour les concours ivoiriens. Chaque réponse renvoie à sa source.",
  "approfondir": "L'épreuve de culture générale se prépare surtout avec le sujet d'ordre général (SOG) : méthode, sujets corrigés et repères.",
  "ouvrages": [
    "Le Résumé de SOG aux Concours Administratifs",
    "Les Annales des Anciens Sujets Corrigés de SOG aux Concours Administratifs"
  ],
  "sources": [
    {
      "nom": "APA News : le 7 août 1960, proclamation de l'indépendance",
      "url": "https://fr.apanews.net/news/cote-divoire-le-7-aout-1960-proclamation-de-lindependance/"
    },
    {
      "nom": "Wikipédia : Yamoussoukro",
      "url": "https://fr.wikipedia.org/wiki/Yamoussoukro"
    },
    {
      "nom": "Wikipédia : Côte d'Ivoire",
      "url": "https://fr.wikipedia.org/wiki/C%C3%B4te_d%27Ivoire"
    },
    {
      "nom": "Constitution de la Côte d'Ivoire, article 48 (Loi d'ici)",
      "url": "https://loidici.biz/?p=118"
    },
    {
      "nom": "Nations unies : la Déclaration universelle des droits de l'homme",
      "url": "https://www.un.org/fr/about-us/universal-declaration-of-human-rights"
    },
    {
      "nom": "Nations unies : la Charte des Nations unies",
      "url": "https://www.un.org/fr/about-us/un-charter"
    },
    {
      "nom": "Union africaine : message pour le 60e anniversaire de l'OUA/UA",
      "url": "https://au.int/sites/default/files/newsevents/pressreleases/42804-PR-Message_celebration_60e_anniversaire_OUAUA_002_002_final_1.pdf"
    },
    {
      "nom": "CEDEAO : présentation de la Communauté (site officiel, en anglais)",
      "url": "https://ecowas.int/?page_id=40"
    },
    {
      "nom": "Wikipédia : Union économique et monétaire ouest-africaine (en anglais)",
      "url": "https://en.wikipedia.org/wiki/West_African_Economic_and_Monetary_Union"
    },
    {
      "nom": "BCEAO : présentation de la Banque centrale",
      "url": "https://www.bceao.int/fr/content/presentation-de-la-bceao"
    },
    {
      "nom": "Wikipédia : Organisation pour l'harmonisation en Afrique du droit des affaires",
      "url": "https://fr.wikipedia.org/wiki/Organisation_pour_l%27harmonisation_en_Afrique_du_droit_des_affaires"
    },
    {
      "nom": "Banque africaine de développement : qui sommes-nous",
      "url": "https://www.afdb.org/fr/about-us"
    },
    {
      "nom": "Wikipédia : De l'esprit des lois",
      "url": "https://fr.wikipedia.org/wiki/De_l%27esprit_des_lois"
    }
  ],
  "questions": [
    {
      "q": "À quelle date la Côte d'Ivoire a-t-elle proclamé son indépendance ?",
      "options": [
        "Le 3 novembre 1960",
        "Le 4 avril 1960",
        "Le 7 août 1960",
        "Le 1er janvier 1961"
      ],
      "bonne": 2,
      "explication": "Le 7 août 1960, Félix Houphouët-Boigny, alors président du Conseil du gouvernement, proclame l'indépendance de la Côte d'Ivoire au nom du peuple ivoirien. Source : APA News."
    },
    {
      "q": "Depuis quand Yamoussoukro est-elle la capitale politique et administrative de la Côte d'Ivoire ?",
      "options": [
        "Depuis l'indépendance, en 1960",
        "Depuis mars 1983",
        "Depuis 1993",
        "Depuis la Constitution de 2016"
      ],
      "bonne": 1,
      "explication": "Yamoussoukro est devenue la capitale politique et administrative du pays en mars 1983. Abidjan reste le principal centre urbain et économique. Source : Wikipédia."
    },
    {
      "q": "Quelle est la devise de la République de Côte d'Ivoire ?",
      "options": [
        "Unité, Travail, Progrès",
        "Paix, Justice, Travail",
        "Un peuple, un but, une foi",
        "Union, Discipline, Travail"
      ],
      "bonne": 3,
      "explication": "Article 48 de la Constitution : « La devise de la République est : Union, Discipline, Travail. » Le même article fait du drapeau tricolore orange, blanc, vert l'emblème national et de l'Abidjanaise l'hymne national."
    },
    {
      "q": "Quand l'Assemblée générale des Nations unies a-t-elle adopté la Déclaration universelle des droits de l'homme ?",
      "options": [
        "Le 26 juin 1945",
        "Le 10 décembre 1948",
        "Le 4 novembre 1950",
        "Le 25 mai 1963"
      ],
      "bonne": 1,
      "explication": "Le 10 décembre 1948, les 58 États membres qui composaient alors l'Assemblée générale ont adopté la Déclaration universelle. Le 26 juin 1945 est la date de la signature de la Charte des Nations unies, à San Francisco. Source : Nations unies."
    },
    {
      "q": "L'Organisation de l'unité africaine (OUA), à laquelle a succédé l'Union africaine, est née :",
      "options": [
        "Le 28 mai 1975, à Lagos",
        "Le 7 août 1960, à Abidjan",
        "Le 25 mai 1963, à Addis-Abeba",
        "Le 10 janvier 1994, à Dakar"
      ],
      "bonne": 2,
      "explication": "L'OUA est fondée le 25 mai 1963 à Addis-Abeba (Éthiopie), lors d'un sommet qui réunissait 32 chefs d'État africains. L'Union africaine lui a officiellement succédé le 9 juillet 2002, à Durban (Afrique du Sud). Source : Union africaine."
    },
    {
      "q": "Le traité instituant la Communauté économique des États de l'Afrique de l'Ouest (CEDEAO) a été signé :",
      "options": [
        "Le 28 mai 1975, à Lagos",
        "Le 25 mai 1963, à Addis-Abeba",
        "Le 10 janvier 1994, à Dakar",
        "Le 17 octobre 1993, à Port-Louis"
      ],
      "bonne": 0,
      "explication": "Les chefs d'État et de gouvernement de quinze pays d'Afrique de l'Ouest ont signé le traité de la CEDEAO le 28 mai 1975 à Lagos, au Nigeria. Source : CEDEAO."
    },
    {
      "q": "Où siège la Commission de l'Union économique et monétaire ouest-africaine (UEMOA) ?",
      "options": [
        "À Dakar",
        "À Ouagadougou",
        "À Abidjan",
        "À Lomé"
      ],
      "bonne": 1,
      "explication": "La Commission de l'UEMOA siège à Ouagadougou (Burkina Faso), comme la Cour de justice et la Cour des comptes de l'Union. Le traité de l'UEMOA a été signé à Dakar le 10 janvier 1994, et la Banque centrale des États de l'Afrique de l'Ouest (BCEAO) a son siège à Dakar. Sources : Wikipédia, BCEAO."
    },
    {
      "q": "Où siège la Cour commune de justice et d'arbitrage (CCJA) de l'OHADA ?",
      "options": [
        "À Yaoundé",
        "À Porto-Novo",
        "À Port-Louis",
        "À Abidjan"
      ],
      "bonne": 3,
      "explication": "La CCJA siège à Abidjan. Le traité OHADA a été signé le 17 octobre 1993 à Port-Louis (île Maurice) ; le Secrétariat permanent est à Yaoundé et l'École régionale supérieure de la magistrature (ERSUMA) à Porto-Novo. Source : Wikipédia."
    },
    {
      "q": "Où se trouve le siège de la Banque africaine de développement (BAD) ?",
      "options": [
        "À Abidjan",
        "À Addis-Abeba",
        "À Lagos",
        "À Nairobi"
      ],
      "bonne": 0,
      "explication": "Le Groupe de la Banque africaine de développement, fondé en 1964, est basé à Abidjan, en Côte d'Ivoire. Source : Banque africaine de développement."
    },
    {
      "q": "Qui est l'auteur de De l'esprit des lois, l'ouvrage de 1748 associé à la séparation des pouvoirs ?",
      "options": [
        "Jean-Jacques Rousseau",
        "Voltaire",
        "Montesquieu",
        "Alexis de Tocqueville"
      ],
      "bonne": 2,
      "explication": "Montesquieu publie De l'esprit des lois à Genève en 1748. On en retient la séparation des pouvoirs législatif, exécutif et judiciaire, et la formule « le pouvoir arrête le pouvoir ». Source : Wikipédia."
    }
  ]
}
];
