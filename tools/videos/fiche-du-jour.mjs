// « La fiche du jour » : un script vidéo par fiche de révision, à partir de ce que la vitrine publique en montre
// (contenu/fiches.js : titre, matière, l'essentiel en une phrase, plan). La fiche complète reste réservée aux abonnés.
// Usage : node fiche-du-jour.mjs <dossier de sortie>
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
import { oral } from './oral.mjs';
const ICI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const FICHES = require(path.join(ICI, '../../contenu/fiches.js'));
const sortie = process.argv[2];
fs.mkdirSync(sortie, { recursive: true });

const sansBalises = s => s.replace(/<[^>]+>/g, '');
const liste = l => l.map(p => p.replace(/\s*[.?!]$/, '')).join(' ; ');
// Rubriques communes à toutes les fiches : non reprises dans « Au programme »
const COMMUNES = /^(L'essentiel en une phrase|Les? textes?|Exemples?|Un exemple|Les pièges des correcteurs|À l'écrit|Testez-vous)$/i;
const groupes = new Map();
for (const f of FICHES) { if (!groupes.has(f.matiere)) groupes.set(f.matiere, []); groupes.get(f.matiere).push(f); }
const files = [...groupes.values()], ordre = [];
for (let r = 0; ordre.length < FICHES.length; r++) for (const g of files) if (g[r]) ordre.push(g[r]);

const legendes = [];
ordre.forEach((f, i) => {
  const n = i + 1, num = String(n).padStart(3, '0');
  const essentiel = sansBalises(f.essentiel[0]);
  const programme = f.plan.filter(p => !COMMUNES.test(p)).slice(0, 4);
  const scenes = [
    { type: 'intro', titre: f.titre, dit: ['La fiche du jour.', `*${oral(f.titre)}*.`], st: ['La fiche du jour.', `*${f.titre}*.`] },
    { type: 'blocs', titre: "L'essentiel", items: [{ t: `Fiche n° ${f.numero} · ${f.matiere}`, d: essentiel, cue: 0, fort: false }], dit: [oral(essentiel)], st: [essentiel] }
  ];
  if (programme.length >= 2) scenes.push({
    type: 'etapes', titre: 'Au programme de la fiche', items: programme.map((p, k) => ({ n: String(k + 1), t: p, d: '', cue: 0 })),
    dit: [oral(`Au programme de la fiche : ${liste(programme)}.`)], st: [`Au programme de la fiche : ${liste(programme)}.`]
  });
  scenes.push({ type: 'blocs', titre: 'La fiche complète', items: [{ t: 'Dans l’espace abonnés', d: 'Les textes cités mot pour mot, des exemples, les pièges des correcteurs et un exercice corrigé.', cue: 0, fort: true }],
    dit: ["La fiche complète, avec les textes, des exemples, les pièges des correcteurs et un exercice corrigé, est dans l'espace abonnés de cours sésame point com."],
    st: ["La fiche complète, avec les textes, des exemples, les pièges des correcteurs et un exercice corrigé, est dans l'espace abonnés de coursesesame.com."] });
  scenes.push({ type: 'outro', dit: ['Les Cours Sésame et SAJ.', 'Votre réussite est notre mission.'] });
  const script = { fichier: `fiche-du-jour-${num}`, titre: `La fiche du jour n° ${n}`, serie: 'LA FICHE DU JOUR', rubrique: f.matiere, source: { fiche: f.numero }, scenes };
  fs.writeFileSync(path.join(sortie, `${script.fichier}.json`), JSON.stringify(script, null, 1));
  legendes.push({ n, fichier: script.fichier, matiere: f.matiere, legende:
    `La fiche du jour : ${f.titre} (${f.matiere.toLowerCase()}). ${essentiel}\n\n` +
    `La fiche complète est dans l'espace abonnés de coursesesame.com : textes, exemples, pièges des correcteurs et exercice corrigé.\n\n#droit #droitivoirien #concours #INFJ #ENA #CoteDIvoire #revision #fiche` });
});
fs.writeFileSync(path.join(sortie, 'legendes.json'), JSON.stringify(legendes, null, 1));
console.log(ordre.length, 'scripts dans', sortie);
