#!/usr/bin/env node
/* Images de partage des ouvrages (1200 × 630), affichées quand on partage le lien
   d'un ouvrage sur WhatsApp ou Facebook.

   À relancer après l'ajout d'un ouvrage ou un changement de titre ou de prix :
       node tools/images-partage.js
       node tools/build.js

   Nécessite Playwright (npm install playwright, puis npx playwright install chromium).
   Les images sont écrites dans assets/img/ouvrages/<adresse de l'ouvrage>.jpg.
   Sans image, la page de l'ouvrage utilise l'image générale du site. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const DIR = path.resolve(__dirname, "..");
const OUT = path.join(DIR, "assets/img/ouvrages");
const read = f => fs.readFileSync(path.join(DIR, f), "utf8");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(read("assets/js/data.js") + "\n;globalThis.D={OUVRAGES};", ctx);
vm.runInContext(read("assets/js/render.js"), ctx);
const { OUVRAGES } = ctx.D;
const R = ctx.SESAME;

// Un titre proposé à plusieurs concours n'a qu'une page, donc une seule image
const livres = [];
for (const o of OUVRAGES) {
  let l = livres.find(x => x.titre === o.titre);
  if (!l) livres.push(l = { titre: o.titre, items: [] });
  l.items.push(o);
}

const sprite = read("index.html").match(/<!-- partial:sprite -->([\s\S]*?)<!-- \/partial:sprite -->/)[1];
const css = read("assets/css/style.css");
// Polices : celles du site (Google Fonts), ou des fichiers locaux si FONTS_DIR est indiqué
const fonts = process.env.FONTS_DIR
  ? `<style>${[["Gelasio", 500, "normal"], ["Gelasio", 700, "normal"], ["Gelasio", 700, "italic"], ["Manrope", 600, "normal"], ["Manrope", 700, "normal"], ["Manrope", 800, "normal"]]
      .map(([f, w, s]) => `@font-face{font-family:'${f}';font-weight:${w};font-style:${s};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(process.env.FONTS_DIR, `${f.toLowerCase()}-latin-${w}-${s}.woff2`)).toString("base64")})}`).join("")}</style>`
  : `<link href="https://fonts.googleapis.com/css2?family=Gelasio:ital,wght@0,500;0,700;1,700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">`;

function html(l) {
  const o = l.items[0];
  const concours = l.items.length > 1 ? l.items.map(x => R.CONCOURS.find(c => c.id === x.categorie).court).join(" · ") : o.concours.replace(/^INFJ\s+/, "");
  const cover = R.coverHTML(l.items.length > 1 ? Object.assign({}, o, { concours: "Concours de Côte d'Ivoire" }) : o);
  const titre = o.titre.replace(/\s+—\s+(Édition \d{4})$/, "<small>$1</small>");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">${fonts}<style>${css}
  html,body{width:1200px;height:630px;overflow:hidden;background:var(--navy)}
  .og{position:relative;width:1200px;height:630px;background:var(--navy);color:#fff;display:grid;grid-template-columns:1fr 360px;gap:56px;align-items:center;padding:0 80px 0 76px}
  .og::after{content:"";position:absolute;left:0;right:0;bottom:0;height:12px;background:var(--gold)}
  .og-brand{display:flex;align-items:center;gap:16px;font-family:var(--serif);font-weight:700;font-size:26px;line-height:1.1}
  .og-brand .mark{width:58px;height:58px}
  .og-brand i{display:block;width:120px;height:2px;background:var(--gold);margin-top:8px}
  .og-concours{margin-top:40px;font-size:16px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
  .og-titre{font-family:var(--serif);font-weight:700;font-size:${o.titre.length > 70 ? 44 : o.titre.length > 48 ? 50 : 58}px;line-height:1.08;letter-spacing:-.01em;margin-top:14px}
  .og-titre small{display:block;font-size:.52em;font-style:italic;font-weight:500;color:rgba(255,255,255,.75);margin-top:10px;letter-spacing:0}
  .og-bas{display:flex;align-items:center;gap:18px;margin-top:34px}
  .og-prix{font-family:var(--serif);font-weight:700;font-size:40px;color:var(--gold)}
  .og-prix small{font-family:var(--sans);font-size:16px;font-weight:800;margin-left:6px;color:rgba(255,255,255,.7)}
  .og-badge{font-size:15px;font-weight:800;color:var(--navy);background:#fff;border-radius:999px;padding:8px 16px}
  .og .product-cover .cover{box-shadow:16px 16px 0 var(--gold);animation:none}
  .og .product-cover .cover-title{font-size:1.6rem;-webkit-line-clamp:5}
  </style></head><body>${sprite}
  <div class="og on-dark">
    <div>
      <div class="og-brand"><svg class="mark" aria-hidden="true"><use href="#logo"/></svg><span>Les Cours<br>Sésame et SAJ<i></i></span></div>
      <div class="og-concours">${concours}</div>
      <div class="og-titre">${titre}</div>
      <div class="og-bas"><span class="og-prix">${o.prix}<small>FCFA</small></span>${o.extrait ? `<span class="og-badge">Extrait gratuit</span>` : ""}${o.numerique ? `<span class="og-badge">Version numérique</span>` : ""}</div>
    </div>
    <div class="product-cover">${cover}</div>
  </div></body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const l of livres) {
    await page.setContent(html(l), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const f = path.join(OUT, R.ouvrageSlug(l.items[0]) + ".jpg");
    await page.screenshot({ path: f, type: "jpeg", quality: 86 });
    console.log("écrit", path.relative(DIR, f));
  }
  await browser.close();
})();
