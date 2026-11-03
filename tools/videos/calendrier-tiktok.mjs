// Calendrier des trois rendez-vous TikTok : 8 h « Le QCM du jour », 13 h « L'article du jour », 19 h « La fiche du jour »
// (heure d'Abidjan, égale à l'heure universelle). Le premier jour, la vidéo de 8 h est celle du plan de départ.
// Usage : node calendrier-tiktok.mjs <premier jour AAAA-MM-JJ> <nombre de jours> <légendes QCM> <légendes articles> <légendes fiches> <sortie.json>
// Produit la liste { quand, serie, n, fichier, source, titre, legende } utilisée pour programmer tiktok_publications
// et pour la page de publication à la main.
import fs from 'fs';
const [, , debut, jours, lq, la, lf, sortie] = process.argv;
const L = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const qcm = L(lq), articles = L(la), fiches = L(lf);
const plan = [];
for (let j = 0; j < Number(jours); j++) {
  const d = new Date(debut + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + j);
  const jour = d.toISOString().slice(0, 10);
  const ajout = (heure, serie, dossier, x, titre) => x && plan.push({ quand: `${jour}T${heure}:00Z`, serie, n: x.n, fichier: x.fichier,
    source: `tiktok/${dossier}/${x.fichier}.mp4`, titre, legende: x.legende });
  if (j > 0) ajout('08:00', 'qcm', 'qcm', qcm[j - 1], `Le QCM du jour n° ${j}`);
  ajout('13:00', 'article', 'articles', articles[j], `L'article du jour n° ${j + 1}`);
  ajout('19:00', 'fiche', 'fiches', fiches[j], `La fiche du jour n° ${j + 1}`);
}
fs.writeFileSync(sortie, JSON.stringify(plan, null, 1));
console.log(plan.length, 'publications du', plan[0].quand, 'au', plan[plan.length - 1].quand);
