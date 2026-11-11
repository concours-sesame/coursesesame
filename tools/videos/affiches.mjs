// Affiches des vidéos qui ne suivent pas le modèle « Une notion, une minute » : la présentation, la vidéo d'un
// ouvrage, « Un article, une minute » et les annales décryptées. Même modèle pour toutes : nuit marine, emblème,
// surtitre or, titre en Libre Baskerville, pastille or (bas : marge du bas, pour le bouton « Regarder » du site). Aucune balance ni autre symbole exclu par l'identité visuelle.
// Usage : node tools/videos/affiches.mjs   (écrit assets/img/videos/<fichier>.jpg, puis lancer node tools/build.js)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "../..");
// Polices du dossier fonts/, incorporées dans la page (une page sans adresse ne peut pas lire un fichier local)
const police = f => "data:font/woff2;base64," + readFileSync(path.join(ICI, "fonts", f)).toString("base64");

const AFFICHES = [
  { fichier: "presentation-les-cours-sesame-et-saj", l: 720, h: 720, surtitre: "Présentation", titre: "Un concours ne se prépare pas au hasard.", sous: "Il se prépare avec méthode.", bas: 0.12 },
  { fichier: "resume-droit-civil-2027", l: 540, h: 960, surtitre: "Nos ouvrages", titre: "Le Résumé de Droit Civil", pastille: "Édition 2027" },
  { fichier: "article-1376-un-article-une-minute", l: 540, h: 960, surtitre: "Un article, une minute", titre: "L'article 1376 du Code civil", pastille: "Droit civil" },
  { fichier: "annales-sog-magistrature-2019", l: 540, h: 960, surtitre: "Annales décryptées", titre: "SOG Magistrature 2019", pastille: "Sujet d'ordre général" },
  { fichier: "annales-sog-penitentiaire-2019", l: 540, h: 960, surtitre: "Annales décryptées", titre: "SOG Pénitentiaire 2019", pastille: "Sujet d'ordre général" }
];

// Emblème du site (assets/img/favicon.svg), sans son fond
const emblème = readFileSync(path.join(RACINE, "assets/img/favicon.svg"), "utf8")
  .replace(/<rect[^>]*\/>/, "").replace(/<circle fill="#0f2a5c"/, '<circle fill="#0f2a5c"');

// Semis d'étoiles à graine fixe : la même affiche à chaque exécution
function étoiles(l, h, graine) {
  let g = graine;
  const alea = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
  let s = "";
  for (let i = 0; i < 70; i++) {
    const r = 0.6 + alea() * 1.3;
    s += `<circle cx="${(alea() * l).toFixed(1)}" cy="${(alea() * h).toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.12 + alea() * 0.35).toFixed(2)}"/>`;
  }
  return `<svg class="ciel" viewBox="0 0 ${l} ${h}" aria-hidden="true">${s}</svg>`;
}

const page = a => `<!doctype html><html lang="fr"><meta charset="utf-8"><style>
@font-face{font-family:LB;src:url(${police("libre-baskerville-latin-400-normal.woff2")});font-weight:400}
@font-face{font-family:LB;src:url(${police("libre-baskerville-latin-400-italic.woff2")});font-weight:400;font-style:italic}
@font-face{font-family:LB;src:url(${police("libre-baskerville-latin-700-normal.woff2")});font-weight:700}
@font-face{font-family:MS;src:url(${police("montserrat-latin-700-normal.woff2")});font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${a.l}px;height:${a.h}px}
body{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  padding:0 ${Math.round(a.l * 0.1)}px ${Math.round(a.h * (a.bas || 0))}px;color:#fff;background:radial-gradient(ellipse 90% 70% at 50% 46%,#16397a 0%,#0f2a5c 48%,#0a1f48 100%)}
.ciel{position:absolute;inset:0;width:100%;height:100%}
.emb{position:relative;width:${Math.round(a.l * 0.3)}px;height:${Math.round(a.l * 0.3)}px;margin-bottom:${Math.round(a.l * 0.03)}px}
.emb svg{width:100%;height:100%}
.sur{position:relative;font:700 ${Math.round(a.l * 0.03)}px MS;letter-spacing:.2em;text-transform:uppercase;color:#e8a62b}
.filet{position:relative;width:${Math.round(a.l * 0.085)}px;height:2px;margin:${Math.round(a.l * 0.03)}px 0 ${Math.round(a.l * 0.04)}px;background:#e8a62b}
h1{position:relative;font:700 ${Math.round(a.l * (a.titre.length > 30 ? 0.076 : 0.092))}px/1.18 LB;text-wrap:balance}
.sous{position:relative;margin-top:${Math.round(a.l * 0.03)}px;font:italic 400 ${Math.round(a.l * 0.05)}px/1.3 LB;color:#f0b94a}
.pastille{position:relative;margin-top:${Math.round(a.l * 0.055)}px;padding:${Math.round(a.l * 0.014)}px ${Math.round(a.l * 0.04)}px;border-radius:99px;
  font:700 ${Math.round(a.l * 0.027)}px MS;letter-spacing:.14em;text-transform:uppercase;color:#0f2a5c;background:#e8a62b}
</style><body>${étoiles(a.l, a.h, a.fichier.length * 7919)}
<div class="emb">${emblème}</div>
<p class="sur">${a.surtitre}</p><div class="filet"></div>
<h1>${a.titre}</h1>${a.sous ? `<p class="sous">${a.sous}</p>` : ""}
${a.pastille ? `<p class="pastille">${a.pastille}</p>` : ""}</body></html>`;

const nav = await chromium.launch();
for (const a of AFFICHES) {
  const p = await nav.newPage({ viewport: { width: a.l, height: a.h }, deviceScaleFactor: 1 });
  await p.setContent(page(a), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(RACINE, "assets/img/videos", a.fichier + ".jpg"), type: "jpeg", quality: 86 });
  await p.close();
  console.log("écrit assets/img/videos/" + a.fichier + ".jpg");
}
await nav.close();
