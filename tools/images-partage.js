#!/usr/bin/env node
/* Images de partage (1200 × 630), affichées quand on partage un lien du site sur WhatsApp ou Facebook :
   une image par ouvrage (assets/img/ouvrages/<adresse de l'ouvrage>.jpg) et l'image générale du site
   (assets/img/og-image.png). Elles montrent la vraie première page des ouvrages qui ont un extrait,
   et, pour les autres, la page de titre composée comme dans le catalogue.

   À relancer après l'ajout d'un ouvrage, ou un changement de titre ou de prix :
       node tools/images-partage.js
       node tools/build.js

   Nécessite Playwright (variable PLAYWRIGHT : chemin du module, CHROMIUM : chemin du navigateur). */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const DIR = path.resolve(__dirname, "..");
const OUT = path.join(DIR, "assets/img/ouvrages");
const ROOT = pathToFileURL(DIR + "/").href;
const read = f => fs.readFileSync(path.join(DIR, f), "utf8");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(read("assets/js/data.js") + "\n;globalThis.D={OUVRAGES};", ctx);
vm.runInContext(read("assets/js/render.js"), ctx);
const { OUVRAGES } = ctx.D;
const R = ctx.SESAME;
R.setRoot(ROOT);

// Un titre proposé à plusieurs concours n'a qu'une page, donc une seule image
const livres = [];
for (const o of OUVRAGES) {
  let l = livres.find(x => x.titre === o.titre);
  if (!l) livres.push(l = { titre: o.titre, items: [] });
  l.items.push(o);
}

const sprite = read("index.html").match(/<!-- partial:sprite -->([\s\S]*?)<!-- \/partial:sprite -->/)[1];

// Mise en page commune : fond bleu marine, filet or en bas, marque en haut à gauche, adresse du site en bas
const STYLE = `
  html,body{width:1200px;height:630px;margin:0;overflow:hidden;background:var(--navy)}
  .og{position:relative;box-sizing:border-box;width:1200px;height:630px;background:var(--navy);color:#fff;display:grid;align-items:center;padding:0 72px}
  .og::after{content:"";position:absolute;left:0;right:0;bottom:0;height:8px;background:var(--gold)}
  .og-marque{display:flex;align-items:center;gap:14px;font-family:var(--serif);font-weight:700;font-size:25px;line-height:1.1}
  .og-marque .mark{width:54px;height:54px;--m-n:#fff;--m-g:var(--gold);--m-w:var(--navy)}
  .og-site{position:absolute;left:72px;bottom:34px;font-size:20px;font-weight:600;color:rgba(255,255,255,.72)}
  .og-page{background:#fff;border-radius:6px;padding:10px;box-shadow:0 18px 40px rgba(0,0,0,.28)}
  .og-page .cover{border:0}
  .og-page .cover-made{gap:7%}
  .og-page .cover-top{font-size:17px}
  .og-page .cover-series{font-size:15px}
  .og-page .cover-title{font-size:30px;-webkit-line-clamp:3}
  .og-page .cover-foot{font-size:14px}
`;

function document(contenu) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <link rel="stylesheet" href="${ROOT}assets/css/style.css"><style>${STYLE}</style></head>
  <body>${sprite}${contenu}</body></html>`;
}

function ouvrageHTML(l) {
  const o = l.items[0];
  const concours = l.items.length > 1
    ? l.items.map(x => R.CONCOURS.find(c => c.id === x.categorie).court).join(", ")
    : o.concours.replace(/^INFJ\s+/, "");
  const m = o.titre.match(/^(.*?),\s+(Édition \d{4})$/);
  const titre = m ? m[1] : o.titre;
  const taille = titre.length > 80 ? 40 : titre.length > 56 ? 46 : 54;
  const cover = R.coverHTML(l.items.length > 1 ? Object.assign({}, o, { concours: "Concours de Côte d'Ivoire" }) : o, true)
    .replace(/ loading="lazy"/, "");
  return document(`<div class="og" style="grid-template-columns:1fr 470px;gap:56px">
    <div>
      <div class="og-marque"><svg class="mark" aria-hidden="true"><use href="#logo"/></svg><span>Les Cours<br>Sésame et SAJ</span></div>
      <div style="margin-top:40px;font-size:22px;font-weight:600;color:var(--gold)">${concours}</div>
      <div style="font-family:var(--serif);font-weight:700;font-size:${taille}px;line-height:1.1;margin-top:10px;text-wrap:balance">${titre}</div>
      ${m ? `<div style="font-size:22px;color:rgba(255,255,255,.75);margin-top:12px">${m[2]}</div>` : ""}
      <div style="display:flex;align-items:center;gap:16px;margin-top:30px">
        <span style="font-family:var(--serif);font-weight:700;font-size:38px;color:var(--gold)">${o.prix} <small style="font-family:var(--sans);font-size:18px;font-weight:600;color:rgba(255,255,255,.75)">FCFA</small></span>
        ${o.extrait ? `<span style="font-size:17px;font-weight:700;color:var(--navy);background:#fff;border-radius:6px;padding:7px 14px">Extrait gratuit</span>` : ""}
        ${o.numerique ? `<span style="font-size:17px;font-weight:700;color:var(--navy);background:#fff;border-radius:6px;padding:7px 14px">Version numérique</span>` : ""}
      </div>
    </div>
    <div class="og-page">${cover}</div>
    <div class="og-site">coursesesame.com</div>
  </div>`);
}

// Image générale : la marque, les concours préparés et trois vraies premières pages
function generaleHTML() {
  const pages = ["annales-anciens-sujets-infj-2027", "50-cas-pratiques-corriges", "1000-fiches-ecrit-magistrature"];
  const pile = pages.map((p, i) => `<div class="og-page" style="position:absolute;width:380px;left:${i * 54}px;top:${i * 62}px">
      <div class="cover cover-page"><img src="${ROOT}assets/img/pages/${p}-600.jpg" alt=""></div></div>`).join("");
  return document(`<div class="og" style="grid-template-columns:1fr 500px;gap:40px">
    <div>
      <div class="og-marque" style="font-size:34px;gap:18px"><svg class="mark" aria-hidden="true" style="width:76px;height:76px"><use href="#logo"/></svg><span>Les Cours<br>Sésame et SAJ</span></div>
      <div style="font-family:var(--serif);font-weight:700;font-size:50px;line-height:1.12;margin-top:44px;text-wrap:balance">Préparation aux concours de la justice et de l'administration</div>
      <div style="font-size:24px;color:rgba(255,255,255,.8);margin-top:18px">${R.CONCOURS.map(c => c.court).join(", ")}</div>
    </div>
    <div style="position:relative;height:420px">${pile}</div>
    <div class="og-site">coursesesame.com</div>
  </div>`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "images-partage-"));
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  async function capture(html, fichier, type) {
    const f = path.join(tmp, "page.html");
    fs.writeFileSync(f, html);
    await page.goto(pathToFileURL(f).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot(type === "png" ? { path: fichier, type } : { path: fichier, type, quality: 86 });
    console.log("écrit", path.relative(DIR, fichier));
  }
  for (const l of livres) await capture(ouvrageHTML(l), path.join(OUT, R.ouvrageSlug(l.items[0]) + ".jpg"), "jpeg");
  await capture(generaleHTML(), path.join(DIR, "assets/img/og-image.png"), "png");
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})();
