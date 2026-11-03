// « L'article du jour » : un script vidéo par carte d'article (table cartes_articles de l'espace abonnés, textes cités
// mot pour mot et vérifiés), avec l'essentiel de la fiche de révision d'où vient la carte (contenu/fiches.js, public).
// Usage : node article-du-jour.mjs <export des cartes.json> <dossier de sortie>
// L'export des cartes et les scripts produits restent hors du dépôt public (la sélection des cartes est réservée
// à l'espace VIP) ; seul le texte de loi cité et l'essentiel public de la fiche apparaissent dans la vidéo.
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
import { oral } from './oral.mjs';
const ICI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const FICHES = require(path.join(ICI, '../../contenu/fiches.js'));
const [, , entree, sortie] = process.argv;
const cartes = JSON.parse(fs.readFileSync(entree, 'utf8')).filter(c => c.texte.length <= 700);
fs.mkdirSync(sortie, { recursive: true });

const sansBalises = s => s.replace(/<[^>]+>/g, '');
// Première carte de chaque fiche : c'est l'article principal, auquel l'essentiel de la fiche s'applique
const premiere = new Map();
for (const c of cartes) if (!premiere.has(c.fiche) || c.ordre < premiere.get(c.fiche)) premiere.set(c.fiche, c.ordre);
// Alternance des matières
const groupes = new Map();
for (const c of cartes) { if (!groupes.has(c.matiere)) groupes.set(c.matiere, []); groupes.get(c.matiere).push(c); }
const files = [...groupes.values()], ordre = [];
for (let r = 0; ordre.length < cartes.length; r++) for (const f of files) if (f[r]) ordre.push(f[r]);

// Citation affichée : sans les guillemets d'ouverture et de fermeture (le cadre les dessine), alinéas conservés
const affiche = t => t.replace(/^«\s*/, '').replace(/\s*»$/, '').replace(/\s*»\n«\s*/g, '\n');
const reference = r => r.replace(/, alinéa 1er/, ', alinéa premier');
const legendes = [];
ordre.forEach((c, i) => {
  const n = i + 1, num = String(n).padStart(3, '0');
  const fiche = FICHES.find(f => f.numero === c.fiche);
  const essentiel = fiche && premiere.get(c.fiche) === c.ordre ? sansBalises(fiche.essentiel[0]) : '';
  const lu = oral(c.texte.replace(/[«»]/g, '').replace(/\s*\[…\]\s*/g, ', ').replace(/\n+/g, ' '));
  const scenes = [
    { type: 'intro', titre: c.reference, dit: ["L'article du jour.", `*${oral(reference(c.reference))}*.`], st: ["L'article du jour.", `*${c.reference}*.`] },
    { type: 'article', titre: c.reference, citation: affiche(c.texte), cueCitation: 0, dit: [lu], st: [c.texte.replace(/\n+/g, ' ')] }
  ];
  if (essentiel) scenes.push({ type: 'blocs', titre: 'À retenir', items: [{ t: `Fiche n° ${c.fiche} · ${fiche.titre}`, d: essentiel, cue: 0 }], dit: [oral(essentiel)], st: [essentiel] });
  else if (fiche) scenes.push({ type: 'blocs', titre: 'Pour aller plus loin', items: [{ t: `Fiche de révision n° ${c.fiche}`, d: fiche.titre, cue: 0 }],
    dit: [`Pour aller plus loin : la fiche de révision numéro ${c.fiche}, ${oral(fiche.titre)}.`], st: [`Pour aller plus loin : la fiche de révision n° ${c.fiche}, ${fiche.titre}.`] });
  scenes.push({ type: 'outro', dit: ['Fiches de révision et Q C M sur cours sésame point com.', 'Les Cours Sésame et SAJ, votre réussite est notre mission.'],
    st: ['Fiches de révision et QCM sur coursesesame.com.', 'Les Cours Sésame et SAJ, votre réussite est notre mission.'] });
  const script = { fichier: `article-du-jour-${num}`, titre: `L'article du jour n° ${n}`, serie: "L'ARTICLE DU JOUR", rubrique: c.matiere, source: { carte: c.id, fiche: c.fiche }, scenes };
  fs.writeFileSync(path.join(sortie, `${script.fichier}.json`), JSON.stringify(script, null, 1));
  legendes.push({ n, fichier: script.fichier, matiere: c.matiere, legende:
    `L'article du jour n° ${n} : ${c.reference}. À connaître mot pour mot pour l'écrit et l'oral des concours.\n\n` +
    `${fiche ? `Fiche de révision n° ${c.fiche} : ${fiche.titre}. ` : ''}Fiches et QCM sur coursesesame.com\n\n#droit #droitivoirien #concours #INFJ #ENA #CoteDIvoire #revision` });
});
fs.writeFileSync(path.join(sortie, 'legendes.json'), JSON.stringify(legendes, null, 1));
console.log(ordre.length, 'scripts dans', sortie);
