#!/usr/bin/env node
/* Icônes de l'application (site ajouté à l'écran d'accueil d'un téléphone), tirées du logo
   assets/img/favicon.svg :
   - assets/img/icone-192.png et icone-512.png : le logo tel quel, angles arrondis ;
   - assets/img/icone-masquable-512.png : fond bleu marine plein et logo réduit, pour Android,
     qui découpe l'icône en rond ou en carré arrondi selon le téléphone.
   Elles sont déclarées dans manifest.webmanifest. À relancer seulement si le logo change :
       PLAYWRIGHT=/opt/node-tools/node_modules/playwright node tools/icones-application.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

const DIR = path.resolve(__dirname, "..");
const logo = fs.readFileSync(path.join(DIR, "assets/img/favicon.svg"), "utf8");
// Version masquable : le dessin doit tenir dans le cercle central (80 % de l'icône)
const masquable = logo
  .replace(/<rect[^>]*\/>/, '<rect width="100" height="100" fill="#0f2a5c"/>')
  .replace(/translate\(14 12\) scale\(\.72\)/, "translate(22 21) scale(.56)");

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  for (const [svg, taille, nom] of [[logo, 192, "icone-192.png"], [logo, 512, "icone-512.png"], [masquable, 512, "icone-masquable-512.png"]]) {
    await page.setViewportSize({ width: taille, height: taille });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`);
    await page.screenshot({ path: path.join(DIR, "assets/img", nom), omitBackground: true });
    console.log("écrit assets/img/" + nom);
  }
  await browser.close();
})();
