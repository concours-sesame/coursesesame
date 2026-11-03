// « Le QCM du jour » : un script vidéo par question des QCM gratuits du site (assets/js/qcm-matieres.js).
// Usage : node qcm-du-jour.mjs            -> scripts/qcm/qcm-du-jour-NNN.json et scripts/qcm/legendes.json
// Ordre : les matières alternent (une question de chaque matière à tour de rôle), pour varier d'un jour à l'autre.
// Le texte affiché reste celui du QCM, vérifié sur les textes ; seule la version dite (« dit ») est adaptée à la voix :
// sigles développés ou épelés, numéros de loi remplacés par l'année, mentions de source omises.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
import { oral } from './oral.mjs';
const ICI = path.dirname(new URL(import.meta.url).pathname);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ICI, '../../assets/js/qcm-matieres.js'), 'utf8') + '\n;globalThis.Q=QCM_MATIERES;', ctx);
const Q = ctx.Q;

const HASHTAGS = {
  'droit-civil': '#droitcivil', 'droit-de-la-famille': '#droitdelafamille', 'droit-penal': '#droitpenal', 'droit-penal-general': '#droitpenal',
  'droit-penal-special': '#droitpenal', 'droit-administratif': '#droitadministratif', 'droit-constitutionnel': '#droitconstitutionnel',
  'droits-de-l-enfant': '#droitsdelenfant', 'organisation-judiciaire': '#organisationjudiciaire', 'procedure-penale': '#procedurepenale',
  'droit-ohada': '#OHADA', 'culture-generale': '#culturegenerale'
};
// Alternance des matières
const files = Q.map(m => m.questions.map((q, k) => ({ m, q, k })));
const ordre = [];
for (let r = 0; ordre.length < files.reduce((n, f) => n + f.length, 0); r++) for (const f of files) if (f[r]) ordre.push(f[r]);

const DOSSIER = path.join(ICI, 'scripts/qcm'); fs.mkdirSync(DOSSIER, { recursive: true });
const L = 'ABCD', legendes = [];
const fin = x => /[.?!]$/.test(x) ? x : x + '.';
ordre.forEach(({ m, q, k }, i) => {
  const n = i + 1, num = String(n).padStart(3, '0');
  const options = q.options;
  const script = {
    fichier: `qcm-du-jour-${num}`, titre: `Le QCM du jour n° ${n}`, serie: 'LE QCM DU JOUR', rubrique: `Question n° ${n}`,
    source: { matiere: m.slug, question: k },
    scenes: [
      { type: 'intro', titre: m.nom, dit: ['Le Q C M du jour.', `En *${m.nom.toLowerCase()}*.`], st: ['Le QCM du jour.', `En *${m.nom.toLowerCase()}*.`] },
      { type: 'qcm', titre: 'La question', question: q.q, options, pause: 5,
        dit: [oral(q.q), ...options.map((o, j) => fin(`${L[j]} : ${oral(o)}`)), 'À vous de jouer !'],
        st: [q.q, ...options.map((o, j) => fin(`${L[j]} : ${o}`)), 'À vous de jouer !'] },
      { type: 'reponse', titre: 'La réponse', bonne: q.bonne, texte: options[q.bonne], explication: q.explication,
        dit: [`Bonne réponse : *${L[q.bonne]}*.`, oral(q.explication)], st: [`Bonne réponse : *${L[q.bonne]}*.`, q.explication] },
      { type: 'outro', dit: ['Tous nos Q C M sont gratuits sur cours sésame point com.', 'Les Cours Sésame et SAJ, votre réussite est notre mission.'],
        st: ['Tous nos QCM sont gratuits sur coursesesame.com.', 'Les Cours Sésame et SAJ, votre réussite est notre mission.'] }
    ]
  };
  fs.writeFileSync(path.join(DOSSIER, `${script.fichier}.json`), JSON.stringify(script, null, 1));
  legendes.push({
    n, fichier: script.fichier, matiere: m.nom,
    legende: `Le QCM du jour n° ${n}, en ${m.nom.toLowerCase()} : ${q.q}\n\nA, B, C ou D ? Répondez en commentaire avant la fin de la vidéo.\n\n` +
      `Tous nos QCM sont gratuits sur coursesesame.com\n\n#QCM ${HASHTAGS[m.slug] || '#droit'} #droitivoirien #concours #INFJ #ENA #CoteDIvoire #revision`
  });
});
fs.writeFileSync(path.join(DOSSIER, 'legendes.json'), JSON.stringify(legendes, null, 1));
console.log(ordre.length, 'scripts dans', DOSSIER);
