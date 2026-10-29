#!/usr/bin/env node
/* Générateur des pages du site Les Cours Sésame & SAJ.

   À lancer après chaque modification de assets/js/data.js :
       node tools/build.js

   Il met à jour :
   - index.html : cartes des concours, catalogue, FAQ et données Google (entre les repères build:)
   - concours/<concours>/index.html : une page par concours
   - ouvrages/index.html et ouvrages/<ouvrage>/index.html : la liste des ouvrages et une page par ouvrage
   - sujets/ : les sujets corrigés (contenu/sujets.js et contenu/sujets/)
   - qcm/ : les QCM par matière (assets/js/qcm-matieres.js)
   - methodes/index.html : fiches méthode et QCM
   - sitemap.xml : plan du site pour Google
   - robots.txt : adresse du plan du site pour les moteurs de recherche
   L'en-tête, le pied de page et le panier des pages sont copiés depuis index.html
   (entre les repères partial:), pour qu'il n'y ait qu'un seul endroit à modifier. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.resolve(__dirname, "..");
const SITE = "https://coursesesame.com/";
const OG_IMAGE = SITE + "assets/img/og-image.png";
// Mesure d'audience GoatCounter (sans cookies) : tableau de bord sur https://<code>.goatcounter.com
const GOATCOUNTER = "coursesesame";
const STATS = `<script data-goatcounter="https://${GOATCOUNTER}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`;
const TODAY = new Date().toISOString().slice(0, 10);
const read = f => fs.readFileSync(path.join(DIR, f), "utf8");
// Feuilles de style et scripts du site appelés avec ?v=<empreinte du fichier> : une mise à jour est chargée tout
// de suite par les navigateurs, sans attendre la fin de leur cache
const empreintes = new Map();
const empreinte = f => {
  if (!empreintes.has(f)) empreintes.set(f, require("crypto").createHash("sha1").update(fs.readFileSync(path.join(DIR, f))).digest("hex").slice(0, 10));
  return empreintes.get(f);
};
const versionner = html => html.replace(/((?:\.\.\/)*assets\/(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g, (m, url) => {
  const f = url.replace(/^(\.\.\/)+/, "");
  return fs.existsSync(path.join(DIR, f)) ? `${url}?v=${empreinte(f)}"` : m;
});
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(DIR, f)), { recursive: true }); fs.writeFileSync(path.join(DIR, f), f.endsWith(".html") ? versionner(s) : s); console.log("écrit", f); };

/* ---------- Données ---------- */
const ctx = {};
vm.createContext(ctx);
vm.runInContext(read("assets/js/data.js") + "\n;globalThis.D={WA,WA2,OUVRAGES,TEMOIGNAGES,FAQ,METHODO,EPREUVES,SUJETS,QCM,VIDEOS,VIDEOS_ABONNES,TARIFS_ABONNEMENT,TARIFS_VIP};", ctx);
vm.runInContext(read("assets/js/render.js"), ctx);
const { WA, OUVRAGES, FAQ, METHODO, EPREUVES, SUJETS, VIDEOS, VIDEOS_ABONNES } = ctx.D;
const R = ctx.SESAME;
const { CONCOURS, EPREUVES_PAR_CONCOURS, fmt, parsePrice, plural, slugify, attr, svg } = R;
const byCat = id => OUVRAGES.filter(o => o.categorie === id);
// Ouvrages du catalogue dont la version intégrale se lit dans l'espace abonnés ("abonnement":true dans data.js).
// Chaque livre une seule fois : deux titres qui partagent le même extrait sont le même livre. Pour la valeur
// au catalogue, on retient le prix le plus bas du livre.
// Espace VIP : ouvrages complets et vidéos réservées, au triple du tarif normal (TARIFS_VIP dans data.js)
const TARIFS_VIP = ctx.D.TARIFS_VIP || [];
const VIP_JOUR = TARIFS_VIP.find(t => t.cle === "vip-j1");
const VIP_MOIS = TARIFS_VIP.find(t => t.cle === "vip-m1");
const vipDes = VIP_JOUR ? `dès ${VIP_JOUR.prix} FCFA la journée` : "sur abonnement VIP";
const LIVRES_ABONNEMENT = (() => {
  const livres = new Map();
  for (const o of OUVRAGES.filter(x => x.abonnement)) {
    const k = o.extrait || o.titre;
    if (!livres.has(k)) livres.set(k, { o, cats: [], prix: parsePrice(o.prix) });
    const l = livres.get(k);
    if (!l.cats.includes(o.categorie)) l.cats.push(o.categorie);
    l.prix = Math.min(l.prix, parsePrice(o.prix));
  }
  return [...livres.values()];
})();
const WA_URL = "https://wa.me/" + WA;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripTags = s => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const jsonld = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

/* ---------- Outils sur index.html ---------- */
let index = read("index.html");
function inject(html, name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error("repère introuvable : build:" + name);
  return html.replace(re, (m, a, b) => a + content + b);
}
function partial(name) {
  const re = new RegExp(`<!-- partial:${name} -->([\\s\\S]*?)<!-- /partial:${name} -->`);
  const m = index.match(re);
  if (!m) throw new Error("repère introuvable : partial:" + name);
  return m[1];
}
// Adapte les liens d'un morceau de l'accueil pour une page placée plus bas dans l'arborescence
function rebase(html, prefix) {
  const fix = h => {
    if (h === "#top") return prefix || "./";
    if (h.startsWith("#")) return prefix + h;
    if (/^(methodes\/|concours\/|ouvrages\/|sujets\/|qcm\/|assets\/|mentions-legales\/|conditions-de-vente\/|espace-abonnes\/|concours-blancs\/)/.test(h)) return prefix + h;
    return h;
  };
  return html.replace(/(<a\b[^>]*?\shref=")([^"]*)(")/g, (m, a, h, b) => a + fix(h) + b);
}

/* ---------- Morceaux réutilisés ---------- */
// Les boutons n'ont plus de flèche décorative : le texte dit ce que fait le bouton
const arrow = "";
const waIcon = svg("i-wa", 'fill="currentColor"');

function concoursCard(c, i, prefix) {
  const items = byCat(c.id);
  const min = Math.min(...items.map(o => parsePrice(o.prix)));
  return `<a class="concours-card" href="${prefix}concours/${c.slug}/">
        <span class="cc-name">${c.court}</span>
        <span class="cc-sub">${c.long}, ${plural(items.length, "ouvrage")} dès ${fmt(min)} FCFA</span>
        <span class="cc-go">Voir la page${svg("i-arrow")}</span>
      </a>`;
}

// Accueil : quelques ouvrages dont l'extrait gratuit se lit en ligne, le catalogue entier étant sur ouvrages/
const ACCUEIL_EXTRAITS = ["annales-magistrature.pdf", "annales-anciens-sujets-infj-2027.pdf", "guide-methodologique-magistrature-2027.pdf", "resume-droit-civil.pdf",
  "sesame-droit-penal.pdf", "50-cas-pratiques-corriges.pdf", "annales-sog.pdf", "resume-droits-enfant.pdf"];
function selectionHTML() {
  const sel = ACCUEIL_EXTRAITS.map(e => { const o = OUVRAGES.find(x => x.extrait === e); if (!o) throw new Error("accueil : extrait introuvable : " + e); return o; });
  return `<div class="books">${sel.map(o => R.bookHTML(horsConcours(livreDe(o)), OUVRAGES.indexOf(o), false)).join("")}</div>`;
}

// Accueil : deux formules normales et deux formules VIP, d'après TARIFS_ABONNEMENT et TARIFS_VIP (data.js)
function abonnementHTML() {
  const t = cle => [...(ctx.D.TARIFS_ABONNEMENT || []), ...TARIFS_VIP].find(x => x.cle === cle);
  const [j1, m1, vj1, vm1] = ["j1", "m1", "vip-j1", "vip-m1"].map(t);
  if (!j1 || !m1 || !vj1 || !vm1) throw new Error("accueil : formules j1, m1, vip-j1 et vip-m1 attendues dans data.js");
  const carte = (f, nom, quoi, cls = "") => `<li class="formule${cls}"><span class="formule-duree">${nom}</span><b>${f.prix} <small>FCFA</small></b><span class="formule-quoi">${quoi}</span></li>`;
  return `
      <ul class="formules">
        ${carte(j1, "1 jour", "Sujets corrigés, fiches de révision, QCM, textes et jurisprudence")}
        ${carte(m1, "1 mois", "Tout cela pendant un mois, avec les corrigés des concours blancs")}
        ${carte(vj1, "VIP, 1 jour", "Tout l'abonnement, plus l'espace VIP : ouvrages complets, vidéos et documents VIP", " formule-vip")}
        ${carte(vm1, "VIP, 1 mois", "Tout l'espace VIP pendant un mois, et une copie corrigée et notée sur 20", " formule-mise")}
      </ul>
    `;
}

// Question du jour (accueil) : les questions publiques des QCM (méthode et matières), dans un ordre mêlé fixe, une par
// fichier assets/qj/<n>.json. app.js (initEssai) charge la question n = jour % total et tient la série de jours du
// visiteur ; sans JavaScript, la question de méthode ci-dessous reste affichée.
function questionsDuJour() {
  const qc = {};
  vm.createContext(qc);
  vm.runInContext(read("assets/js/qcm-matieres.js") + "\n;globalThis.Q=QCM_MATIERES;", qc);
  const liste = [...ctx.D.QCM.map(q => ({ ...q, theme: "Méthode des épreuves", lien: "methodes/#qcm" })),
    ...qc.Q.flatMap(t => t.questions.map(q => ({ ...q, theme: t.nom, lien: `qcm/${t.slug}/` })))];
  // Mélange à graine fixe (mulberry32) : l'ordre ne change qu'avec la liste des questions
  let g = 20261029;
  const alea = () => { g = (g + 0x6D2B79F5) | 0; let t = Math.imul(g ^ (g >>> 15), 1 | g); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let k = liste.length - 1; k > 0; k--) { const j = Math.floor(alea() * (k + 1)); [liste[k], liste[j]] = [liste[j], liste[k]]; }
  return liste.map(q => ({ q: q.q, options: q.options, bonne: q.bonne, explication: q.explication, theme: q.theme, lien: q.lien }));
}
const QJ = questionsDuJour();
const QJ_VERSION = require("crypto").createHash("sha1").update(JSON.stringify(QJ)).digest("hex").slice(0, 10);
fs.rmSync(path.join(DIR, "assets/qj"), { recursive: true, force: true });
QJ.forEach((q, n) => write(`assets/qj/${n}.json`, JSON.stringify(q)));

// Accueil : la question du jour, jouable dans le haut de page (app.js, initEssai) ; sans JavaScript, une question du QCM de méthode
const ESSAI_QUESTION = "Quel plan est attendu pour une dissertation juridique ?";
function essaiHTML() {
  const q = ctx.D.QCM.find(x => x.q === ESSAI_QUESTION);
  if (!q) throw new Error("accueil : question du QCM introuvable : " + ESSAI_QUESTION);
  return `<figure class="essai" data-bonne="${q.bonne}" data-qj-total="${QJ.length}" data-qj-v="${QJ_VERSION}" aria-labelledby="essaiQ">
      <figcaption class="essai-tete"><span class="essai-titre">Essayez : une question de notre QCM de méthode</span><span class="essai-serie" hidden></span></figcaption>
      <p class="essai-q" id="essaiQ">${q.q}</p>
      <ol class="essai-opts" type="A">
        ${q.options.map((o, i) => `<li><button class="essai-opt" type="button" data-i="${i}">${o}</button></li>`).join("\n        ")}
      </ol>
      <div class="essai-verdict" aria-live="polite" hidden>
        <p><b class="essai-resultat"></b> ${q.explication}</p>
        <p class="essai-demain" hidden></p>
        <div class="essai-actions"><a class="btn btn-gold" href="espace-abonnes/#inscription">Créer mon compte</a><a class="btn btn-ghost essai-suite" href="methodes/#qcm">Les 10 questions du QCM</a></div>
        <p class="essai-test">Pour aller plus loin : <a href="test-de-niveau/">le test de niveau gratuit, 20 questions et une note sur 20</a>.</p>
      </div>
      <noscript><p class="essai-noscript">Réponse : ${q.options[q.bonne]}. ${q.explication}</p></noscript>
    </figure>
    `;
}

// Accueil : le prix d'une journée, en chiffre-titre, en tête de l'offre d'abonnement
function prixJourHTML() {
  const j1 = (ctx.D.TARIFS_ABONNEMENT || []).find(x => x.cle === "j1");
  if (!j1) throw new Error("accueil : formule j1 attendue dans data.js");
  return `<p class="prix-geant"><b>${j1.prix}</b><span>FCFA<br>la journée</span></p>
        `;
}

function faqHTML() {
  return FAQ.map((f, i) => `<details class="faq-item"${i === 0 ? " open" : ""}><summary>${f.q}<i></i></summary><p>${f.a}</p></details>`).join("");
}

function sujetHTML(s) {
  return `<article class="paper paper-static">
        <div class="paper-side"><span class="tag">${s.concours}</span><h3>${s.titre}</h3><div class="meta">${s.meta.replace(/ · /g, ", ")}</div>
          <div class="enonce"><b>Sujet</b><p>${s.enonce}</p></div></div>
        <div class="paper-main">
          <div class="corrige">${s.corrige}</div>
          <div class="corrige-more"><button class="btn btn-ghost btn-sm more-btn">Lire tout le corrigé</button></div>
          <div class="corrige-cta"><p>Ce corrigé est un extrait de nos ouvrages. Obtenez la version complète avec tous les sujets.</p><button class="btn btn-wa btn-sm" data-wa-order>${waIcon}Commander l'ouvrage complet</button></div>
        </div></article>`;
}

function breadcrumb(items) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: url }))
  };
}

/* ---------- Ouvrages ---------- */
// Un même ouvrage peut être proposé à plusieurs concours (une ligne par concours dans data.js) :
// LIVRES regroupe ces lignes, pour n'avoir qu'une page par titre.
const LIVRES = [];
for (const o of OUVRAGES) {
  let l = LIVRES.find(x => x.titre === o.titre);
  if (!l) LIVRES.push(l = { titre: o.titre, slug: R.ouvrageSlug(o), items: [] });
  l.items.push(o);
}
LIVRES.forEach((l, i) => { if (LIVRES.findIndex(x => x.slug === l.slug) !== i) throw new Error("deux ouvrages ont la même adresse : " + l.slug); });
const livreDe = o => LIVRES.find(l => l.titre === o.titre);
const concoursDe = o => CONCOURS.find(c => c.id === o.categorie);
const ouvrageAbs = o => `${SITE}ouvrages/${R.ouvrageSlug(o)}/`;
// Ouvrage tel qu'il est présenté hors d'un concours précis : la couverture d'un ouvrage proposé
// à plusieurs concours ne cite pas l'un d'eux en particulier.
function horsConcours(l) {
  const o = l.items[0];
  if (l.items.length < 2) return o;
  return Object.assign({}, o, { concours: "Concours de Côte d'Ivoire", concoursListe: l.items.map(x => concoursDe(x).court).join(" · ") });
}
const exists = f => fs.existsSync(path.join(DIR, f));
// Image de partage (1200 × 630) propre à l'ouvrage, si elle a été générée
const imageOuvrage = o => { const f = `assets/img/ouvrages/${R.ouvrageSlug(o)}.jpg`; return exists(f) ? SITE + f : OG_IMAGE; };
// Dimensions d'une image JPEG (lues dans son en-tête), pour réserver sa place dans la page
function jpegSize(f) {
  const b = fs.readFileSync(path.join(DIR, f));
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("dimensions introuvables : " + f);
}
// Pages de l'extrait gratuit en image : assets/img/apercus/<extrait>-p<numéro de page>.jpg
function apercus(o) {
  if (!o.extrait) return [];
  const base = o.extrait.replace(/\.pdf$/, "");
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-p(\\d+)\\.jpg$`);
  return fs.readdirSync(path.join(DIR, "assets/img/apercus"))
    .map(n => { const m = n.match(re); return m && Object.assign({ f: "assets/img/apercus/" + n, page: +m[1] }, jpegSize("assets/img/apercus/" + n)); })
    .filter(Boolean).sort((a, b) => a.page - b.page);
}

function productLD(o, url) {
  return {
    "@type": "Product", name: o.titre, description: o.desc, image: imageOuvrage(o), category: "Livres", sku: R.ouvrageSlug(o),
    brand: { "@type": "Brand", name: "Les Cours Sésame et SAJ" },
    offers: { "@type": "Offer", price: String(parsePrice(o.prix)), priceCurrency: "XOF", availability: "https://schema.org/InStock", url,
      seller: { "@type": "Organization", name: "Les Cours Sésame et SAJ" } }
  };
}

function productList(items) {
  return {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.map((o, i) => ({ "@type": "ListItem", position: i + 1, item: productLD(o, ouvrageAbs(o)) }))
  };
}

/* ---------- Gabarit des pages intérieures ---------- */
function cleanHTML(h) {
  return h
    .replace(/class="section-head reveal"/g, 'class="section-head"')
    .replace(/ reveal reveal-d\d/g, "").replace(/ class="reveal"/g, "").replace(/ reveal(?=")/g, "");
}
/* Titres et descriptions à la longueur que Google affiche en entier.
   title : un texte, ou une liste de formulations de la plus complète à la plus courte.
   On garde la première qui tient, avec le nom du site si la place le permet. */
const TITRE_MAX = 65, DESC_MAX = 160;
const SUFFIXES = [" | Les Cours Sésame et SAJ", " | Cours Sésame et SAJ", ""];
function titreSEO(title) {
  const choix = [].concat(title);
  for (const t of choix) for (const s of SUFFIXES) if ((t + s).length <= TITRE_MAX) return t + s;
  return couper(choix[choix.length - 1], TITRE_MAX);
}
// Coupe un texte trop long : à la fin d'une phrase si possible, sinon entre deux mots, avec « … »
function couper(s, max = DESC_MAX) {
  s = String(s).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  let fin = -1;
  for (const m of s.matchAll(/[.!?](?=\s)/g)) if (m.index + 1 <= max) fin = m.index + 1;
  if (fin >= max * 0.55) return s.slice(0, fin);
  // Sinon après une virgule (fin d'un élément d'énumération), à défaut entre deux mots
  const virgule = s.lastIndexOf(", ", max - 2);
  let t = s.slice(0, virgule >= max * 0.8 ? virgule : s.lastIndexOf(" ", max - 1));
  for (let k = 0; k < 3; k++) t = t.replace(/[\s,;:(«]+$/, "").replace(/\s+(de|du|des|la|le|les|l'|d'|et|ou|à|au|aux|en|pour|par|sur|un|une|avec|dans|son|sa|ses|leur|leurs|chacun|chacune)$/i, "");
  return t + "…";
}
// Garde les phrases entières qui tiennent dans la place disponible (au moins la première, coupée au besoin)
function phrases(s, max) {
  const morceaux = String(s).replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [];
  let t = "";
  for (const m of morceaux) { if ((t + m).trim().length > max) break; t += m; }
  return t.trim() || couper(s, max);
}
// Titres d'ouvrages trop longs pour un titre de page, même sans le nom du site
const TITRES_COURTS = {
  "Les Annales des Anciens Sujets Corrigés de SOG aux Concours Administratifs": "Annales corrigées de SOG aux concours administratifs"
};
// Titres de sujets trop longs, même sans le nom du site (repérés par l'adresse de la page)
const TITRES_SUJETS = {
  "cas-pratique-accident-voirie-communale": "L'accident sur voirie communale : cas pratique corrigé",
  "cas-pratique-magistrature-2023-dorpa": "Trois cas pratiques de droit pénal, magistrature 2023",
  "commentaire-article-1376-repetition-indu": "Commentaire de l'article 1376 du Code civil (corrigé)",
  "commentaire-article-28-code-penal-tentative": "Commentaire de l'article 28 du Code pénal (corrigé)",
  "commentaire-article-45-loi-divorce-autorite-parentale": "Commentaire de l'article 45 de la loi sur le divorce",
  "commentaire-de-l-article-52-de-la-loi-n-2019-570-relative-au-mariage": "Commentaire de l'article 52 de la loi sur le mariage",
  "greffe-opeaj-2026": "OPEAJ : dix questions de cours corrigées",
  "greffe-organisation-judiciaire-2026": "Organisation judiciaire : cinq questions de cours corrigées",
  "le-tribunal-pour-enfants-et-le-principe-de-l-opportunite-des-poursuites": "Tribunal pour enfants et opportunité des poursuites (corrigé)",
  "les-juridictions-de-la-justice-pour-mineurs-et-les-attributions-du-juge-des-enfants": "Les juridictions pour mineurs et le juge des enfants (corrigé)",
  "sog-migration-clandestine": "La migration clandestine : SOG corrigé"
};
// Lien d'évitement (clavier) et repères communs à toutes les pages, accueil compris
const SKIP_LINK = `<a class="skip-link" href="#top">Aller au contenu</a>`;
const headApp = prefix => `<link rel="manifest" href="${prefix}manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="Sésame et SAJ">`;

function page({ prefix, title, description, url, body, ld, bodyAttrs = "", image = OG_IMAGE, ogType = "website", scripts = [], robots = "", stats = true }) {
  body = cleanHTML(body);
  title = titreSEO(title);
  description = couper(description);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta name="theme-color" content="#0f2a5c">${url ? `\n<link rel="canonical" href="${url}">` : ""}${robots ? `\n<meta name="robots" content="${robots}">` : ""}
<link rel="icon" href="${prefix}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${prefix}assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${prefix}assets/img/apple-touch-icon.png">
${headApp(prefix)}
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="Les Cours Sésame et SAJ">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">${url ? `\n<meta property="og:url" content="${url}">` : ""}
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="${prefix}assets/fonts/source-sans-3-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${prefix}assets/fonts/source-serif-4-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${prefix}assets/css/style.css">${stats ? "\n" + STATS + `\n<script defer src="${prefix}assets/js/visite.js"></script>` : ""}
${ld.map(jsonld).join("\n")}
</head>
<body data-root="${prefix}"${bodyAttrs}>
<!-- Page générée par tools/build.js à partir de assets/js/data.js : ne pas modifier à la main. -->
${SKIP_LINK}
${partial("sprite")}
${rebase(partial("header"), prefix)}
<main id="top" tabindex="-1">
${body}
</main>
${rebase(partial("footer"), prefix)}
<script src="${prefix}assets/js/data.js"></script>
<script src="${prefix}assets/js/render.js"></script>
${scripts.map(f => `<script src="${prefix}${f}"></script>\n`).join("")}<script src="${prefix}assets/js/app.js"></script>
</body>
</html>
`;
}

// facts : courtes indications en clair (« <b>20</b> ouvrages »), affichées sous les boutons
function subHero({ crumbs, h1, lead, ctas, facts }) {
  return `<section class="hero hero-sub">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane">${crumbs.map(([n, h], i) => i === crumbs.length - 1 ? `<span aria-current="page">${n}</span>` : `<a href="${h}">${n}</a><span aria-hidden="true">›</span>`).join("")}</nav>
    <h1 class="sub-h1">${h1}</h1>
    <p class="lead">${lead}</p>
    <div class="hero-ctas">${ctas}</div>
    ${facts && facts.length ? `<ul class="hero-facts">${facts.map(f => `<li>${f}</li>`).join("")}</ul>` : ""}
  </div>
</section>`;
}

const telAff = n => `+${n.slice(0, 3)} ${n.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
function contactCTA(prefix) {
  const { WA2 } = ctx.D;
  return `<section class="section contact">
  <div class="wrap contact-inner">
    <div>
      <h2>Un conseil avant de commander ?</h2>
      <p>Dites-nous quel concours vous préparez et où vous en êtes : nous vous aidons à choisir les ouvrages adaptés, puis nous livrons partout en Côte d'Ivoire.</p>
      <div class="hero-ctas"><a class="btn btn-wa" href="${WA_URL}" target="_blank" rel="noopener">${waIcon}Écrire sur WhatsApp</a>
      <a class="btn btn-ghost" href="${prefix}#conseiller">Faire le test « Quel ouvrage pour moi ? »</a></div>
    </div>
    <ul class="contact-list">
      <li><b>WhatsApp et téléphone</b><a class="nowrap" href="tel:+${WA}">${telAff(WA)}</a>, <a class="nowrap" href="tel:+${WA2}">${telAff(WA2)}</a></li>
      <li><b>Livraison</b>À Abidjan sous 24 à 48 heures, dans les autres villes sous 3 à 5 jours ouvrables.</li>
      <li><b>Paiement</b>Orange Money, MTN MoMo, Wave et Moov Money, ou en espèces à la livraison à Abidjan.</li>
    </ul>
  </div>
</section>`;
}

/* ---------- Sujets corrigés ---------- */
// Les sujets de contenu/sujets.js (avec leur texte dans contenu/sujets/), puis ceux de data.js
const SUJETS_PAGES = [];
{
  const fiches = require(path.join(DIR, "contenu/sujets.js"));
  for (const f of fiches) {
    const m = read(`contenu/sujets/${f.adresse}.html`).match(/<!-- énoncé -->([\s\S]*?)<!-- corrigé -->([\s\S]*)$/);
    if (!m) throw new Error(`repères <!-- énoncé --> et <!-- corrigé --> introuvables dans contenu/sujets/${f.adresse}.html`);
    const ouvrage = f.ouvrage ? OUVRAGES.find(o => o.titre === f.ouvrage) : null;
    if (f.ouvrage && !ouvrage) throw new Error(`sujet ${f.adresse} : ouvrage introuvable dans data.js : ${f.ouvrage}`);
    f.concours.forEach(id => { if (!CONCOURS.some(c => c.id === id)) throw new Error(`sujet ${f.adresse} : concours inconnu ${id}`); });
    SUJETS_PAGES.push(Object.assign({}, f, { enonce: m[1].trim(), corrige: m[2].trim(), ouvrage }));
  }
  for (const s of SUJETS) {
    const parts = s.meta.split(" · ");
    const c = CONCOURS.find(x => x.court === s.concours);
    const texte = stripTags(s.corrige.replace(/<h5>[\s\S]*?<\/h5>/g, " "));
    const annee = (s.meta.match(/Session (\d{4})/) || [])[1];
    SUJETS_PAGES.push({
      adresse: slugify(s.titre), titre: s.titre, epreuve: parts.filter(x => !/Session|Édition|Concours/.test(x)).pop(), matiere: /^[A-Z]+$/.test(parts[1]) ? parts[1] : parts[1][0] + parts[1].slice(1).toLowerCase(), concours: [c.id],
      enonce: `<p>${s.enonce}</p>`, corrige: s.corrige, ouvrage: null, session: annee ? `Concours ${c.long}, session ${annee}` : "", reserve: !!s.reserve,
      resume: texte.length > 170 ? texte.slice(0, texte.lastIndexOf(" ", 165)) + "…" : texte
    });
  }
  SUJETS_PAGES.forEach((x, i) => { if (SUJETS_PAGES.findIndex(y => y.adresse === x.adresse) !== i) throw new Error("deux sujets ont la même adresse : " + x.adresse); });
}
const sujetsDe = o => SUJETS_PAGES.filter(x => x.ouvrage && x.ouvrage.titre === o.titre);
const sujetsDuConcours = id => SUJETS_PAGES.filter(x => x.concours.includes(id));
const courts = ids => ids.map(id => CONCOURS.find(c => c.id === id).court).join(", ");
// « dissertation corrigée », « cas pratique corrigé »…
function corrigeLabel(epreuve) {
  const L = { "Dissertation juridique": "dissertation corrigée", "Cas pratique": "cas pratique corrigé", "Commentaire d'article": "commentaire d'article corrigé",
    "Questions-réponses": "questions de cours corrigées", "Plan détaillé": "plan détaillé de dissertation", "SOG": "SOG corrigé" };
  return L[epreuve] || "sujet corrigé";
}
function sujetCard(x, prefix, i) {
  return `<a class="ep-card sujet-card reveal reveal-d${i % 4}" href="${prefix}sujets/${x.adresse}/" data-concours="${x.concours.join(" ")}">
        <span class="ep-card-tag">${x.epreuve}, ${x.matiere.toLowerCase().replace("ohada", "OHADA").replace("opeaj", "OPEAJ").replace("sog", "SOG")}</span>
        <b>${x.titre}</b>
        <span>${x.resume}</span>
        <small class="sujet-card-foot">${courts(x.concours)}${x.session ? `<em>sujet tombé au concours</em>` : ""}</small>
        <span class="ep-card-go">${x.reserve ? `${svg("i-lock")}Corrigé réservé aux abonnés` : "Lire le corrigé"}</span>
      </a>`;
}

/* ---------- Vidéos ---------- */
// Chaque vidéo : assets/video/<fichier>.mp4 et son affiche assets/img/videos/<fichier>.jpg
const VIDS = VIDEOS.map(v => {
  const src = `assets/video/${v.fichier}.mp4`, poster = `assets/img/videos/${v.fichier}.jpg`;
  [src, poster].forEach(f => { if (!exists(f)) throw new Error(`vidéo ${v.fichier} : fichier introuvable : ${f}`); });
  if (!["vertical", "carre"].includes(v.format)) throw new Error(`vidéo ${v.fichier} : format inconnu ${v.format}`);
  if (!/^\d+:\d{2}$/.test(v.duree)) throw new Error(`vidéo ${v.fichier} : durée à écrire en minutes:secondes`);
  const ouvrage = v.ouvrage ? OUVRAGES.find(o => o.titre === v.ouvrage) : null;
  if (v.ouvrage && !ouvrage) throw new Error(`vidéo ${v.fichier} : ouvrage introuvable dans data.js : ${v.ouvrage}`);
  const sujet = v.sujet ? SUJETS_PAGES.find(x => x.adresse === v.sujet) : null;
  if (v.sujet && !sujet) throw new Error(`vidéo ${v.fichier} : sujet introuvable : ${v.sujet}`);
  if (v.methode && !EPREUVES.some(e => e.nom === v.methode)) throw new Error(`vidéo ${v.fichier} : fiche méthode introuvable : ${v.methode}`);
  (v.concours || []).forEach(id => { if (!CONCOURS.some(c => c.id === id)) throw new Error(`vidéo ${v.fichier} : concours inconnu ${id}`); });
  const [m, sec] = v.duree.split(":").map(Number);
  return Object.assign({}, v, { src, poster, ouvrageObj: ouvrage, sujetObj: sujet, concours: v.concours || [], iso: `PT${m ? m + "M" : ""}${sec}S` });
});
// Vidéos de l'espace abonnés : seule l'affiche est publique, la carte mène à l'inscription
const VIDS_ABO = VIDEOS_ABONNES.map(v => {
  const poster = `assets/img/videos/${v.fichier}.jpg`;
  if (!exists(poster)) throw new Error(`vidéo abonnés ${v.fichier} : affiche introuvable : ${poster}`);
  if (!/^\d+:\d{2}$/.test(v.duree)) throw new Error(`vidéo abonnés ${v.fichier} : durée à écrire en minutes:secondes`);
  (v.concours || []).forEach(id => { if (!CONCOURS.some(c => c.id === id)) throw new Error(`vidéo abonnés ${v.fichier} : concours inconnu ${id}`); });
  return Object.assign({}, v, { poster, concours: v.concours || [] });
});
const videoLD = v => ({
  "@context": "https://schema.org", "@type": "VideoObject", name: v.titre, description: v.desc, inLanguage: "fr",
  thumbnailUrl: SITE + v.poster, contentUrl: SITE + v.src, uploadDate: v.date, duration: v.iso,
  publisher: { "@type": "Organization", name: "Les Cours Sésame et SAJ" }
});
// Lien utile sous une vidéo, sauf vers la page où elle se trouve déjà
function videoLien(v, prefix, ici) {
  if (v.sujetObj && ici !== "sujet") return [v.sujetObj.session ? "Lire le corrigé du sujet" : "Lire le corrigé", `${prefix}sujets/${v.sujet}/`];
  if (v.ouvrageObj && ici !== "ouvrage") return ["Voir l'ouvrage", R.ouvrageURL(v.ouvrageObj)];
  if (v.methode && ici !== "methode") return ["Lire la fiche méthode", `${prefix}methodes/#${slugify(v.methode)}`];
  if (v.lien && ici !== "concours") return [v.lien.texte, prefix + v.lien.href];
  return null;
}
function videoFrame(v, prefix) {
  const [w, h] = v.format === "carre" ? [720, 720] : [720, 1280];
  return `<div class="v-frame v-${v.format}">
          <video class="v-media" controls playsinline preload="none" poster="${prefix}${v.poster}" width="${w}" height="${h}" aria-label="${attr(v.titre)}"><source src="${prefix}${v.src}" type="video/mp4"><a href="${prefix}${v.src}">Télécharger la vidéo</a></video>
          <span class="v-dur" aria-hidden="true">${v.duree}</span>
        </div>`;
}
function videoCard(v, prefix, i, ici) {
  const l = videoLien(v, prefix, ici);
  return `<figure class="v-card reveal reveal-d${i % 4}">
        ${videoFrame(v, prefix)}
        <figcaption><span class="v-tag">${v.tag}</span><b>${v.titre}</b><span class="v-desc">${v.desc}</span>${l ? `<a class="v-link" href="${l[1]}">${l[0]}</a>` : ""}</figcaption>
      </figure>`;
}
function videoAboCard(v, prefix, i) {
  return `<a class="v-card v-abo reveal reveal-d${i % 4}" href="${prefix}espace-abonnes/#inscription">
        <span class="v-frame v-vertical"><img class="v-media" src="${prefix}${v.poster}" alt="" width="540" height="960" loading="lazy" decoding="async"><span class="v-dur" aria-hidden="true">${v.duree}</span><span class="v-abo-pill">${svg("i-lock")}Réservée aux abonnés</span></span>
        <span class="v-cap"><span class="v-tag">${v.tag}</span><b>${v.titre}</b><span class="v-desc">${v.desc}</span><span class="v-link">S'abonner pour la regarder</span></span>
      </a>`;
}
// Vidéo mise en avant : la vidéo d'un côté, sa présentation de l'autre
function videoFeature(v, prefix, ici, titre, actions = "") {
  const l = videoLien(v, prefix, ici);
  return `<div class="v-feature v-feature-${v.format} reveal">
      ${videoFrame(v, prefix)}
      <div class="v-feature-text">
        <span class="v-tag">${v.tag}, ${v.duree}</span>
        <h3>${titre || v.titre}</h3>
        <p>${v.desc}</p>
        ${l || actions ? `<div class="v-actions">${l ? `<a class="btn btn-gold" href="${l[1]}">${l[0]}${arrow}</a>` : ""}${actions}</div>` : ""}
      </div>
    </div>`;
}
// Section « En vidéo » : la vidéo carrée en avant, les vidéos verticales en rangée
function videosSection(list, prefix, { id = "videos", h2, eyebrow = "", lead, ici, cls = "", band = "", abo = [] }) {
  if (!list.length) return "";
  const feat = list.find(v => v.format === "carre") || (list.length === 1 ? list[0] : null);
  const rest = list.filter(v => v !== feat);
  return `<section class="section ${cls} videos" id="${id}">
  <div class="wrap">
    <div class="section-head">
      ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>
      ` : ""}<h2 class="h-section">${h2}</h2>
      ${lead ? `<p class="lead">${lead}</p>` : ""}
    </div>
    ${feat ? videoFeature(feat, prefix, ici) : ""}
    ${rest.length ? `<div class="v-rail${feat ? " v-rail-after" : ""}"${ici === "accueil" ? ` tabindex="0" role="region" aria-label="Vidéos, à faire défiler"` : ""}>${rest.map((v, i) => videoCard(v, prefix, i, ici)).join("")}</div>` : ""}
    ${abo.length ? `<div class="v-abo-head reveal"><h3>${svg("i-lock")}Réservées aux abonnés VIP</h3><p>D'autres notions expliquées en une minute, à regarder dans l'espace VIP de l'espace abonnés.</p></div>
    <div class="v-rail">${abo.map((v, i) => videoAboCard(v, prefix, i)).join("")}</div>` : ""}
    ${band}
  </div>
</section>`;
}
// Invitation à l'espace abonnés
function espaceBand(prefix) {
  return `<div class="espace-band reveal">
      <div><b>Allez plus loin avec l'espace abonnés</b><p>Sujets corrigés, fiches de révision et QCM chronométrés, et dans l'espace VIP, nos ouvrages complets à lire en ligne. Créez votre compte en une minute, réglez votre formule, et votre accès s'ouvre.</p></div>
      <div class="espace-band-actions"><a class="btn btn-navy" href="${prefix}espace-abonnes/#inscription">Créer mon compte${arrow}</a><a class="btn btn-ghost" href="${prefix}espace-abonnes/#connexion">Se connecter</a></div>
    </div>`;
}

/* ---------- Pages concours ---------- */
const urls = [SITE];
for (const c of CONCOURS) {
  const prefix = "../../";
  R.setRoot(prefix);
  const url = `${SITE}concours/${c.slug}/`;
  const items = byCat(c.id);
  const m = METHODO.find(x => x.concours === c.long) || METHODO.find(x => x.concours.includes(c.court));
  const epreuves = m ? m.epreuves.split(",").map(e => e.trim()) : [];
  const fiches = (EPREUVES_PAR_CONCOURS[c.id] || []).map(n => EPREUVES.find(e => e.nom === n)).filter(Boolean);
  const sujet = SUJETS.find(s => s.concours === c.court);
  const autresSujets = sujetsDuConcours(c.id).filter(x => !sujet || x.adresse !== slugify(sujet.titre));
  const minPrix = Math.min(...items.map(o => parsePrice(o.prix)));
  // Vidéos du concours : la présentation d'abord, puis les vidéos propres au concours
  const vids = VIDS.filter(v => v.concours.includes(c.id));
  const nomCourt = c.id === "ena" ? "de l'ENA" : c.id === "infj" ? "de la Magistrature" : `${c.court}`;
  const title = [`Concours ${nomCourt} 2027 : ouvrages, méthode et sujet corrigé`, `Concours ${nomCourt} 2027 : ouvrages et méthode`];
  const series = [...new Set(items.map(o => R.coverParts(o.titre).serie).filter(Boolean))].map(s => s.toLowerCase());
  const description = `${plural(items.length, "ouvrage")} pour le ${c.nom} : résumés, annales corrigées et méthode. Fiches méthode, sujets corrigés, commande sur WhatsApp.`;

  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Concours", prefix + "#concours"], [c.court, ""]],
    h1: `Concours ${nomCourt}&nbsp;: ouvrages et méthode`,
    lead: m ? m.conseil : "",
    ctas: `<a href="#ouvrages" class="btn btn-gold">Voir les ${items.length} ouvrages${arrow}</a><a href="${WA_URL}" target="_blank" rel="noopener" class="btn btn-ghost">${waIcon}Conseil personnalisé</a>`,
    facts: [`<b>${items.length}</b> ouvrages`, `<b>${epreuves.length}</b> épreuves principales`, `à partir de <b>${fmt(minPrix)} FCFA</b>`, `<b>-10 %</b> dès 3 ouvrages`]
  })}

<section class="section" id="epreuves">
  <div class="wrap">
    <div class="section-head reveal">
      <div><h2 class="h-section">Les épreuves</h2></div>
      <p class="lead">Les épreuves principales du ${c.nom}${fiches.length ? ", et nos fiches méthode pour les aborder" : ""}.</p>
    </div>
    <div class="pills pills-light reveal">${epreuves.map(e => `<span class="pill">${e}</span>`).join("")}</div>
    ${fiches.length ? `<div class="ep-cards">${fiches.map((f, i) => `<a class="ep-card reveal reveal-d${i % 4}" href="${prefix}methodes/#${slugify(f.nom)}"><span class="ep-card-tag">Fiche méthode</span><b>${f.nom}</b><span>${stripTags(f.contenu).split(". ")[0]}.</span><span class="ep-card-go">Lire la fiche</span></a>`).join("")}</div>` : ""}
  </div>
</section>

<section class="section concours-books" id="ouvrages">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Les ouvrages, ${c.long}</span><h2 class="h-section">Les ouvrages pour ce concours</h2></div>
      <p class="lead">Ajoutez un ouvrage ou un pack complet au panier, puis commandez en un message WhatsApp. La remise de 10 % s'applique dès 3 ouvrages.</p>
    </div>
    <div id="books">${R.groupHTML(items, OUVRAGES, [], true)}</div>
  </div>
</section>

${videosSection(vids, prefix, {
    h2: `Nos <em>vidéos</em>`, ici: "concours",
    lead: vids.length > 1 ? "Notre présentation, nos ouvrages et des sujets décryptés, en quelques minutes chacun." : "Découvrez notre accompagnement et nos ouvrages en un peu plus d'une minute.",
    abo: VIDS_ABO.filter(v => v.concours.includes(c.id))
  })}

${sujet ? `<section class="section sujets" id="corrige">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Extrait de nos ouvrages</span><h2 class="h-section">Un sujet corrigé en entier</h2></div>
      <p class="lead">Jugez par vous-même de la qualité de nos corrections.</p>
    </div>
    ${sujetHTML(sujet)}
  </div>
</section>` : ""}

${autresSujets.length ? `<section class="section${sujet ? " section-top-0" : ""}">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">En accès libre</span><h2 class="h-section">D'autres sujets <em>corrigés</em></h2></div>
      <p class="lead">${plural(sujetsDuConcours(c.id).length, "sujet corrigé")} pour le concours ${c.court}, à lire gratuitement en entier.</p>
    </div>
    <div class="ep-cards">${autresSujets.slice(0, 6).map((x, i) => sujetCard(x, prefix, i)).join("")}</div>
    <div class="apercu-cta reveal"><a class="btn btn-ghost" href="${prefix}sujets/#${c.id}">Tous les sujets corrigés ${c.court}${arrow}</a></div>
  </div>
</section>` : ""}

<section class="section concours-section">
  <div class="wrap">
    <div class="section-head reveal"><div><span class="eyebrow">Vous hésitez ?</span><h2 class="h-section">Les autres <em>concours</em></h2></div></div>
    <div class="concours-grid">${CONCOURS.filter(x => x !== c).map((x, i) => concoursCard(x, i, prefix)).join("")}</div>
  </div>
</section>

${contactCTA(prefix)}`;

  write(`concours/${c.slug}/index.html`, page({
    prefix, title, description, url, body, bodyAttrs: ` data-cat="${c.id}"`,
    ld: [breadcrumb([["Accueil", SITE], ["Concours " + c.court, url]]), productList(items), ...vids.map(videoLD)]
  }));
  urls.push(url);
}

/* ---------- Page Méthodes ---------- */
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "methodes/";
  const concoursDe = nom => CONCOURS.filter(c => (EPREUVES_PAR_CONCOURS[c.id] || []).includes(nom));
  // Ouvrages utiles pour chaque épreuve (repérés par leur titre)
  const OUVRAGES_UTILES = {
    "Dissertation juridique": /Guide Méthodologique Magistrature|1200 Dissertations/,
    "Cas pratique": /Guide Méthodologique Magistrature/,
    "Commentaire d'arrêt / d'article": /Guide Méthodologique Magistrature|2000 Articles Commentés/,
    "SOG (Sujet d'Ordre Général)": /SOG/,
    "PECOS": /PECOS/,
    "Note de synthèse": /Note de Synthèse/,
    "Étude de texte": /Guide Méthodologique INFJ/
  };
  const utiles = nom => {
    const re = OUVRAGES_UTILES[nom];
    if (!re) return [];
    const seen = new Set();
    return OUVRAGES.filter(o => re.test(o.titre) && !seen.has(o.titre) && seen.add(o.titre));
  };
  const vidsDe = nom => VIDS.filter(v => v.methode === nom);
  const fiches = EPREUVES.map((e, i) => {
    const cs = concoursDe(e.nom);
    const books = utiles(e.nom);
    return `<article class="fiche reveal" id="${slugify(e.nom)}">
      <div class="fiche-head"><div><h2>${e.nom}</h2>
      ${cs.length ? `<div class="fiche-meta">Concours : ${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join(", ")}</div>` : ""}</div></div>
      <div class="ep-panel">${e.contenu}</div>
      ${vidsDe(e.nom).length ? `<div class="fiche-videos"><span class="m-label">En vidéo : ${vidsDe(e.nom).length > 1 ? "des sujets décryptés" : "un sujet décrypté"}</span><div class="v-rail v-rail-sm">${vidsDe(e.nom).map((v, k) => videoCard(v, prefix, k, "methode")).join("")}</div></div>` : ""}
      ${books.length ? `<div class="fiche-books"><span class="m-label">Pour aller plus loin</span>${books.map(o => `<button class="fiche-book" data-open="${OUVRAGES.indexOf(o)}"><span class="c-mini"></span><span><b>${o.titre}</b><small>${o.concours}, ${o.prix} FCFA</small></span></button>`).join("")}</div>` : ""}
    </article>`;
  }).join("");

  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Méthodes des épreuves", ""]],
    h1: `Les méthodes des épreuves`,
    lead: "Dissertation juridique, cas pratique, commentaire d'arrêt, SOG, PECOS, note de synthèse et étude de texte : la démarche attendue par les jurys, étape par étape. Testez-vous ensuite avec notre QCM.",
    ctas: `<a href="#qcm" class="btn btn-gold">Faire le QCM${arrow}</a><a href="#${slugify(EPREUVES[0].nom)}" class="btn btn-ghost">Lire les fiches</a>`,
    facts: [`<b>${EPREUVES.length}</b> fiches méthode`, `<b>${ctx.D.QCM.length}</b> questions de QCM`]
  })}

<section class="section sujets" id="qcm">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">QCM, ${ctx.D.QCM.length} questions</span><h2 class="h-section">Testez votre <em>méthode</em></h2></div>
      <p class="lead">Répondez, découvrez l'explication, puis défiez vos amis sur WhatsApp. Toutes les réponses se trouvent dans les fiches ci-dessous. Pour tester vos connaissances, voyez aussi nos <a href="${prefix}qcm/">QCM de droit par matière</a>.</p>
    </div>
    <div class="qcm-wrap reveal"><div id="qcmBox"><p class="lead">Activez JavaScript pour lancer le QCM.</p></div></div>
  </div>
</section>

<section class="section fiches">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Fiches méthode</span><h2 class="h-section">La démarche, <em>épreuve par épreuve</em></h2></div>
    </div>
    <nav class="fiche-toc reveal" aria-label="Sommaire">${EPREUVES.map(e => `<a href="#${slugify(e.nom)}">${e.nom}</a>`).join("")}</nav>
    ${fiches}
  </div>
</section>

${contactCTA(prefix)}`;

  write("methodes/index.html", page({
    prefix, url, body,
    title: "Méthodes des épreuves : cas pratique, SOG, note de synthèse",
    description: "Fiches méthode des concours INFJ et ENA : dissertation, cas pratique, commentaire, SOG, PECOS, note de synthèse et étude de texte. QCM gratuit de méthode.",
    ld: [breadcrumb([["Accueil", SITE], ["Méthodes des épreuves", url]]), ...VIDS.filter(v => v.methode).map(videoLD)]
  }));
  urls.push(url);
}

/* ---------- Pages ouvrages ---------- */
const bookIcon = svg("i-book", 'fill="none" stroke="currentColor" stroke-width="2"');
const shareIcon = svg("i-share", 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"');

function ouvragePage(l) {
  const prefix = "../../";
  R.setRoot(prefix);
  const o = l.items[0];
  const idx = OUVRAGES.indexOf(o);
  const url = ouvrageAbs(o);
  const cs = l.items.map(concoursDe);
  const pages = apercus(o);
  const pdf = o.extrait ? `${prefix}assets/extraits/${o.extrait}` : "";
  const waMsg = `Bonjour Les Cours Sésame & SAJ,\n\nJe souhaite commander :\n📚 ${o.titre}${o.numerique ? " (version numérique)" : ""}\n💰 ${o.prix} FCFA\n\nMerci !`;
  const autres = byCat(o.categorie).filter(x => x.titre !== o.titre);
  const memePhase = x => o.phase && x.phase === o.phase;
  const suggestions = [...autres.filter(memePhase), ...autres.filter(x => !memePhase(x))].slice(0, 4);
  const sujets = sujetsDe(o);
  const titreCourt = o.titre.replace(R.EDITION, "");
  const vids = VIDS.filter(v => v.ouvrageObj && v.ouvrageObj.titre === o.titre);

  const body = `<section class="hero hero-sub hero-product">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${prefix}">Accueil</a><span aria-hidden="true">›</span><a href="${prefix}ouvrages/">Ouvrages</a><span aria-hidden="true">›</span><span aria-current="page">${titreCourt}</span></nav>
    <div class="product">
      <figure class="product-cover">${R.coverHTML(horsConcours(l), true)}${o.extrait ? `<figcaption>Première page de l'extrait gratuit.</figcaption>` : ""}</figure>
      <div class="product-info">
        <div class="product-concours">${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join("")}</div>
        <h1 class="product-title">${o.titre}</h1>
        <p class="lead">${o.desc}</p>
        <div class="specs">${o.phase ? `<span class="spec">${o.phase}</span>` : ""}<span class="spec">Niveaux ${o.niveau}</span>${o.numerique ? `<span class="spec spec-num">Version numérique uniquement</span>` : `<span class="spec">Livraison partout en CI</span>`}<span class="spec">Paiement Mobile Money</span>${o.abonnement ? `<span class="spec spec-abo">${R.ABO_MENTION}</span>` : ""}</div>
        <div class="product-buy">
          <span class="price">${o.prix}<small>FCFA</small></span>
          <button class="btn btn-gold p-add" data-add="${idx}">${svg("i-plus", 'fill="none" stroke="currentColor" stroke-width="2.6"')}Ajouter au panier</button>
        </div>
        <div class="product-actions">
          <a class="btn btn-wa" href="${WA_URL}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener">${waIcon}Commander sur WhatsApp</a>
          ${pdf ? `<a class="btn btn-ghost" href="${pdf}" target="_blank" rel="noopener">${bookIcon}Lire un extrait gratuit</a>` : ""}
        </div>
        ${o.abonnement ? `<p class="product-abo">${svg("i-book", 'fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"')}<span><b>${R.ABO_MENTION}.</b> La version intégrale de cet ouvrage se lit aussi en ligne dans l'espace VIP de l'espace abonnés, ${vipDes}. <a href="${prefix}espace-abonnes/#inclus">Voir ce que comprend l'espace VIP</a></span></p>` : ""}
        <div class="product-foot">
          <button class="share-btn" data-share="${url}" data-title="${attr(o.titre)}">${shareIcon}Partager cet ouvrage</button>
          <span>-10 % dès 3 ouvrages, appliqué au panier</span>
        </div>
      </div>
    </div>
  </div>
</section>

${vids.length ? `<section class="section section-cream videos" id="video">
  <div class="wrap">
    ${vids.map(v => videoFeature(v, prefix, "ouvrage", null, `<a class="btn btn-wa" href="${WA_URL}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener">${waIcon}Commander sur WhatsApp</a>${pdf ? `<a class="btn btn-ghost" href="${pdf}" target="_blank" rel="noopener">${bookIcon}Lire un extrait gratuit</a>` : ""}`)).join("")}
  </div>
</section>` : ""}

${pages.length ? `<section class="section apercu" id="apercu">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Extrait gratuit</span><h2 class="h-section">Quelques pages de l'extrait</h2></div>
      <p class="lead">Quelques pages de l'extrait gratuit, telles qu'elles figurent dans l'ouvrage : la page de garde, la présentation et des pages de contenu. Touchez une page pour ouvrir l'extrait en PDF.</p>
    </div>
    <div class="apercu-grid${pages[0].h > pages[0].w ? " apercu-portrait" : ""}">${pages.map((x, i) => `<a class="apercu-page reveal reveal-d${i % 4}" href="${pdf}#page=${x.page}" target="_blank" rel="noopener"><img src="${prefix}${x.f}" alt="${attr(titreCourt)} : page ${x.page} de l'extrait gratuit" width="${x.w}" height="${x.h}" loading="lazy" decoding="async"><span>Page ${x.page}</span></a>`).join("")}</div>
    <div class="apercu-cta reveal"><a class="btn btn-navy" href="${pdf}" target="_blank" rel="noopener">${bookIcon}Lire tout l'extrait gratuit (PDF)</a></div>
  </div>
</section>` : ""}

${l.items.length > 1 ? `<section class="section section-cream">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Selon votre concours</span><h2 class="h-section">Un ouvrage pour ${cs.length} concours</h2></div>
      <p class="lead">Cet ouvrage figure dans notre sélection pour plusieurs concours. Voici ce qu'il vous apporte pour chacun d'eux.</p>
    </div>
    <div class="ep-cards">${l.items.map((x, i) => { const c = concoursDe(x); return `<a class="ep-card reveal reveal-d${i % 4}" href="${prefix}concours/${c.slug}/"><span class="ep-card-tag">${c.long}</span><b>${c.court}</b><span>${x.desc}</span><span class="ep-card-go">Voir le concours ${c.court}</span></a>`; }).join("")}</div>
  </div>
</section>` : ""}

${sujets.length ? `<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Tiré de cet ouvrage</span><h2 class="h-section">${sujets.length > 1 ? "Des sujets" : "Un sujet"} <em>corrigé${sujets.length > 1 ? "s" : ""}</em> en accès libre</h2></div>
      <p class="lead">Lisez gratuitement ${sujets.length > 1 ? "ces corrigés extraits" : "ce corrigé extrait"} de l'ouvrage pour juger de la qualité du contenu.</p>
    </div>
    <div class="ep-cards">${sujets.map((x, i) => sujetCard(x, prefix, i)).join("")}</div>
  </div>
</section>` : ""}

${suggestions.length ? `<section class="section${l.items.length > 1 ? "" : " section-cream"}">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">${concoursDe(o).long}</span><h2 class="h-section">Les autres ouvrages du concours</h2></div>
      <p class="lead">D'autres ouvrages pour le ${concoursDe(o).nom}. La remise de 10 % s'applique dès 3 ouvrages dans le panier.</p>
    </div>
    <div class="books">${suggestions.map(x => R.bookHTML(x, OUVRAGES.indexOf(x), false)).join("")}</div>
    <div class="apercu-cta reveal"><a class="btn btn-ghost" href="${prefix}concours/${concoursDe(o).slug}/">Tous les ouvrages ${concoursDe(o).court}${arrow}</a></div>
  </div>
</section>` : ""}

${contactCTA(prefix)}`;

  const fin = ` ${o.prix} FCFA${o.numerique ? ", version numérique" : ", livraison en Côte d'Ivoire"}${o.extrait ? ", extrait gratuit" : ""}.`;
  // Si la présentation ne tient pas en entier, on garde le prix et on retire la mention de livraison
  const finCourte = ` ${o.prix} FCFA${o.numerique ? ", version numérique" : ""}${o.extrait ? ", extrait gratuit" : ""}.`;
  const entier = d => !d.endsWith("…");
  const description = entier(phrases(o.desc, DESC_MAX - fin.length)) ? phrases(o.desc, DESC_MAX - fin.length) + fin : phrases(o.desc, DESC_MAX - finCourte.length) + finCourte;
  write(`ouvrages/${l.slug}/index.html`, page({
    prefix, url, body, description, ogType: "product", image: imageOuvrage(o),
    title: [o.titre, titreCourt, titreCourt.replace(/^(Les?|La) |^L'/, ""), TITRES_COURTS[o.titre] || titreCourt],
    ld: [breadcrumb([["Accueil", SITE], ["Ouvrages", SITE + "ouvrages/"], [titreCourt, url]]), Object.assign({ "@context": "https://schema.org" }, productLD(o, url)), ...vids.map(videoLD)]
  }));
  urls.push(url);
}

// Liste de tous les ouvrages (chaque titre une seule fois)
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "ouvrages/";
  const series = [
    ["Écrit de la magistrature", l => l.items.some(o => o.categorie === "infj" && o.phase === "Écrit")],
    ["Présélection de la magistrature", l => l.items.some(o => o.categorie === "infj" && o.phase === "Présélection")],
    ["Concours administratifs : Greffe, Pénitentiaire, EPPJEJ et ENA", () => true]
  ];
  const placed = new Set();
  const groups = series.map(([nom, test]) => {
    const ls = LIVRES.filter(l => !placed.has(l) && test(l));
    ls.forEach(l => placed.add(l));
    return [nom, ls];
  }).filter(([, ls]) => ls.length);
  const card = l => R.bookHTML(horsConcours(l), OUVRAGES.indexOf(l.items[0]), false);
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Ouvrages", ""]],
    h1: `Tous nos ouvrages`,
    lead: `${plural(LIVRES.length, "ouvrage")} pour préparer les concours de la Magistrature, du Greffe, de l'Administration pénitentiaire, de l'EPPJEJ et de l'ENA en Côte d'Ivoire. Ouvrez un ouvrage pour lire sa présentation, feuilleter l'extrait gratuit et le commander.`,
    ctas: `<a href="#liste" class="btn btn-gold">Voir les ouvrages${arrow}</a><a href="${WA_URL}" target="_blank" rel="noopener" class="btn btn-ghost">${waIcon}Conseil personnalisé</a>`,
    facts: [`<b>${LIVRES.length}</b> ouvrages`, `<b>${OUVRAGES.filter((o, i) => o.extrait && OUVRAGES.findIndex(x => x.titre === o.titre) === i).length}</b> avec un extrait gratuit`, `<b>-10 %</b> dès 3 ouvrages`]
  })}

<section class="section" id="liste">
  <div class="wrap">
    ${groups.map(([nom, ls]) => `<h2 class="group-title">${nom}<small>${plural(ls.length, "ouvrage")}</small></h2><div class="books">${ls.map(card).join("")}</div>`).join("\n    ")}
  </div>
</section>

${contactCTA(prefix)}`;
  write("ouvrages/index.html", page({
    prefix, url, body,
    title: "Ouvrages de préparation aux concours de Côte d'Ivoire",
    description: `${plural(LIVRES.length, "ouvrage")} pour les concours de la Magistrature, du Greffe, de la Pénitentiaire, de l'EPPJEJ et de l'ENA : annales corrigées, résumés, méthode. Extraits gratuits.`,
    ld: [breadcrumb([["Accueil", SITE], ["Ouvrages", url]]), productList(LIVRES.map(l => l.items[0]))]
  }));
  urls.push(url);
}
LIVRES.forEach(ouvragePage);

/* ---------- Pages sujets corrigés ---------- */
function sujetPage(x) {
  const prefix = "../../";
  R.setRoot(prefix);
  const url = `${SITE}sujets/${x.adresse}/`;
  const cs = x.concours.map(id => CONCOURS.find(c => c.id === id));
  const o = x.ouvrage;
  const livre = o && livreDe(o);
  const vids = VIDS.filter(v => v.sujet === x.adresse);
  // Suggestions : même matière d'abord, puis même concours et même épreuve
  const score = y => 2 * (y.matiere === x.matiere) + (y.concours.some(id => x.concours.includes(id))) + (y.epreuve === x.epreuve);
  const suite = SUJETS_PAGES.filter(y => y !== x).map((y, i) => [score(y), i, y]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 3).map(z => z[2]);
  const aside = o ? `<div class="aside-card">
        <span class="eyebrow">Tiré de l'ouvrage</span>
        <a class="aside-cover" href="${R.ouvrageURL(o)}" aria-label="${attr(o.titre)}">${R.coverHTML(horsConcours(livre))}</a>
        <a class="aside-title" href="${R.ouvrageURL(o)}">${o.titre}</a>
        <div class="aside-buy"><span class="price">${o.prix}<small>FCFA</small></span><button class="add-btn" data-add="${OUVRAGES.indexOf(o)}">${svg("i-plus")}Panier</button></div>
        ${o.extrait ? `<a class="extrait-link" href="${prefix}assets/extraits/${o.extrait}" target="_blank" rel="noopener">${bookIcon}Lire un extrait gratuit</a>` : ""}
        <a class="extrait-link" href="${R.ouvrageURL(o)}">Voir l'ouvrage</a>
      </div>` : `<div class="aside-card">
        <span class="eyebrow">Préparer le concours</span>
        <b class="aside-title">${cs.map(c => c.long).join(", ")}</b>
        <p>Retrouvez nos ouvrages, la méthode des épreuves et d'autres sujets corrigés.</p>
        ${cs.map(c => `<a class="btn btn-navy btn-sm" href="${prefix}concours/${c.slug}/">Concours ${c.court}${arrow}</a>`).join("")}
      </div>`;

  const body = `<section class="hero hero-sub hero-sujet">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${prefix}">Accueil</a><span aria-hidden="true">›</span><a href="${prefix}sujets/">Sujets corrigés</a><span aria-hidden="true">›</span><span aria-current="page">${x.epreuve}</span></nav>
    <span class="eyebrow">${x.epreuve}, ${x.matiere.toLowerCase().replace("ohada", "OHADA").replace("opeaj", "OPEAJ").replace("sog", "SOG")}</span>
    <h1 class="sub-h1 sujet-h1">${x.titre}</h1>
    <p class="lead">${x.session ? `<strong>Sujet tombé au concours.</strong> ${x.session}.` : x.resume}</p>
    <div class="product-concours">${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join("")}</div>
  </div>
</section>

<section class="section sujet-page">
  <div class="wrap sujet-layout">
    <article class="sujet-main">
      ${vids.map(v => `<div class="v-inline">${videoFrame(v, prefix)}<div class="v-inline-text"><span class="v-tag">${v.tag}, ${v.duree}</span><b>${v.titre} en vidéo</b><p>${v.desc}</p></div></div>`).join("")}
      <div class="enonce-box"><span class="enonce-label">Énoncé</span>${x.enonce}</div>
      ${x.reserve ? `<div class="copie copie-apercu" id="corrige">
${x.corrige}
      </div>
      <div class="verrou">
        <span class="eyebrow">Espace abonnés</span>
        <h2>La suite du corrigé est réservée aux abonnés</h2>
        <p>Le corrigé intégral de ce sujet, avec tous nos autres corrigés, se lit dans l'espace abonnés. Abonnement dès 500 FCFA la journée, par Mobile Money. Nos ouvrages complets se lisent dans l'espace VIP.</p>
        <div class="verrou-actions"><a class="btn btn-gold" href="${prefix}espace-abonnes/#corrige-${x.adresse}">Lire le corrigé complet${arrow}</a><a class="btn btn-ghost" href="${prefix}espace-abonnes/#inscription">Créer mon compte</a></div>
      </div>` : `<div class="copie" id="corrige">
${x.corrige}
      </div>`}
      <p class="sujet-note">Corrigé proposé par Les Cours Sésame et SAJ${o ? `, extrait de l'ouvrage « ${o.titre} »` : ""}. Ce n'est pas un corrigé officiel du concours.</p>
      <div class="sujet-actions">
        <button class="share-btn share-btn-dark" data-share="${url}" data-title="${attr(x.titre + " : sujet corrigé")}">${shareIcon}Partager ce corrigé</button>
        <a class="extrait-link" href="${prefix}sujets/">Tous les sujets corrigés</a>
      </div>
    </article>
    <aside class="sujet-aside">${aside}</aside>
  </div>
</section>

${suite.length ? `<section class="section section-cream">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Continuer l'entraînement</span><h2 class="h-section">D'autres sujets <em>corrigés</em></h2></div>
    </div>
    <div class="ep-cards">${suite.map((y, i) => sujetCard(y, prefix, i)).join("")}</div>
  </div>
</section>` : ""}

${contactCTA(prefix)}`;

  const description = `${corrigeLabel(x.epreuve)[0].toUpperCase() + corrigeLabel(x.epreuve).slice(1)} en ${x.matiere.toLowerCase().replace("ohada", "OHADA").replace("opeaj", "OPEAJ").replace("pecos", "PECOS")}, concours ${courts(x.concours).replace(/ · /g, ", ")}${x.reserve ? " (corrigé intégral réservé aux abonnés)" : ""}. ${x.resume}`;
  write(`sujets/${x.adresse}/index.html`, page({
    prefix, url, body, description, ogType: "article", image: o ? imageOuvrage(o) : OG_IMAGE,
    title: [/^(Commentaire|Trois cas)|questions/i.test(x.titre) ? `${x.titre} (corrigé)` : `${x.titre} : ${corrigeLabel(x.epreuve)}`, `${x.titre} (corrigé)`, x.titre, TITRES_SUJETS[x.adresse] || x.titre],
    ld: [breadcrumb([["Accueil", SITE], ["Sujets corrigés", SITE + "sujets/"], [x.titre, url]]), {
      "@context": "https://schema.org", "@type": "Article", headline: x.titre, description: x.resume, inLanguage: "fr", url,
      isAccessibleForFree: !x.reserve, about: x.matiere, educationalLevel: "Concours de la fonction publique",
      author: { "@type": "Organization", name: "Les Cours Sésame et SAJ" }, publisher: { "@type": "Organization", name: "Les Cours Sésame et SAJ" },
      image: o ? imageOuvrage(o) : OG_IMAGE
    }, ...vids.map(videoLD)]
  }));
  urls.push(url);
}
SUJETS_PAGES.forEach(sujetPage);

// Liste des sujets corrigés, filtrable par concours
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "sujets/";
  const officiels = SUJETS_PAGES.filter(x => x.session).length;
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Sujets corrigés", ""]],
    h1: `Sujets corrigés`,
    lead: `${plural(SUJETS_PAGES.length, "sujet")} corrigé${SUJETS_PAGES.length > 1 ? "s" : ""} en entier, tirés de nos ouvrages : dissertations, cas pratiques, commentaires d'articles, questions de cours et SOG, dont ${officiels} sujets réellement tombés aux concours.`,
    ctas: `<a href="#liste" class="btn btn-gold">Voir les sujets${arrow}</a><a href="${prefix}methodes/" class="btn btn-ghost">Méthodes des épreuves</a>`,
    facts: [`<b>${SUJETS_PAGES.length}</b> sujets corrigés`, `dont <b>${officiels}</b> sujets tombés aux concours`]
  })}

<section class="section" id="liste">
  <div class="wrap">
    <div class="chips sujets-chips" id="sujetsFiltre" role="group" aria-label="Filtrer par concours">
      <button class="chip" data-f="tous" aria-pressed="true">Tous<span class="n">${SUJETS_PAGES.length}</span></button>
      ${CONCOURS.map(c => `<button class="chip" data-f="${c.id}" aria-pressed="false">${c.court}<span class="n">${sujetsDuConcours(c.id).length}</span></button>`).join("")}
    </div>
    <div class="ep-cards sujets-grid">${SUJETS_PAGES.map((x, i) => sujetCard(x, prefix, i)).join("")}</div>
  </div>
</section>

${contactCTA(prefix)}`;
  write("sujets/index.html", page({
    prefix, url, body,
    title: ["Sujets corrigés des concours de la Magistrature, du Greffe et de l'ENA", "Sujets corrigés des concours Magistrature, Greffe et ENA"],
    description: `${SUJETS_PAGES.length} sujets corrigés pour les concours de Côte d'Ivoire (Magistrature, Greffe, Pénitentiaire, EPPJEJ, ENA) : dissertations, cas pratiques, commentaires et SOG.`,
    ld: [breadcrumb([["Accueil", SITE], ["Sujets corrigés", url]]), {
      "@context": "https://schema.org", "@type": "ItemList",
      itemListElement: SUJETS_PAGES.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}sujets/${x.adresse}/`, name: x.titre }))
    }]
  }));
  urls.push(url);
}

/* ---------- QCM par matière ---------- */
{
  const qctx = {};
  vm.createContext(qctx);
  vm.runInContext(read("assets/js/qcm-matieres.js") + "\n;globalThis.Q=QCM_MATIERES;", qctx);
  const THEMES = qctx.Q;
  // Matières des sujets corrigés rattachées à chaque QCM
  const MATIERES_SUJETS = {
    "droit-civil": ["Droit civil", "Droit de la famille"], "droit-penal": ["Droit pénal", "Procédure pénale"],
    "droit-administratif": ["Droit administratif"], "droits-de-l-enfant": ["Droits de l'enfant"], "organisation-judiciaire": ["Organisation judiciaire"],
    "procedure-penale": ["Procédure pénale"], "droit-ohada": ["Droit commercial OHADA"], "culture-generale": ["Culture générale"]
  };
  for (const t of THEMES) {
    t.questions.forEach((q, i) => { if (!(q.bonne >= 0 && q.bonne < q.options.length)) throw new Error(`QCM ${t.slug}, question ${i + 1} : réponse "bonne" invalide`); });
    t.livres = t.ouvrages.map(titre => { const o = OUVRAGES.find(x => x.titre === titre); if (!o) throw new Error(`QCM ${t.slug} : ouvrage introuvable : ${titre}`); return o; });
  }
  const qcmCard = (t, prefix, i, href) => `<a class="ep-card reveal reveal-d${i % 4}" href="${href || `${prefix}qcm/${t.slug}/`}">
        <span class="ep-card-tag">QCM de ${plural(t.questions.length, "question")}</span>
        <b>${t.nom}</b>
        <span>${t.intro}</span>
        <small class="sujet-card-foot">${courts(t.concours)}</small>
        <span class="ep-card-go">Faire le QCM</span>
      </a>`;
  const methode = { nom: "Méthode des épreuves", questions: ctx.D.QCM, concours: CONCOURS.map(c => c.id), intro: "Dissertation, cas pratique, commentaire, SOG, PECOS, note de synthèse et étude de texte : connaissez-vous les règles de méthode attendues par les jurys ?" };

  for (const t of THEMES) {
    const prefix = "../../";
    R.setRoot(prefix);
    const url = `${SITE}qcm/${t.slug}/`;
    const sujets = SUJETS_PAGES.filter(x => (MATIERES_SUJETS[t.slug] || []).includes(x.matiere));
    const body = `${subHero({
      crumbs: [["Accueil", prefix], ["QCM", prefix + "qcm/"], [t.nom, ""]],
      h1: t.titre,
      lead: t.intro,
      ctas: `<a href="#qcm" class="btn btn-gold">Commencer le QCM${arrow}</a><a href="#approfondir" class="btn btn-ghost">Approfondir</a>`,
      facts: [`<b>${t.questions.length}</b> questions`, `chaque réponse expliquée`, `pour les concours ${courts(t.concours)}`]
    })}

<section class="section sujets" id="qcm">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">QCM, ${plural(t.questions.length, "question")}</span><h2 class="h-section">Testez vos <em>connaissances</em></h2></div>
      <p class="lead">Choisissez une réponse, lisez l'explication, puis passez à la question suivante. ${t.sources ? "Chaque réponse a été vérifiée sur les sources citées sous le QCM." : "Les réponses s'appuient sur le contenu de nos ouvrages, textes à l'appui."}</p>
    </div>
    <div class="qcm-wrap reveal"><div id="qcmBox" data-theme="${t.slug}"><p class="lead">Activez JavaScript pour lancer le QCM.</p></div></div>
    ${t.sources ? `<div class="qcm-sources reveal"><h3>Sources</h3><ul>${t.sources.map(x => `<li><a href="${attr(x.url)}" target="_blank" rel="noopener">${esc(x.nom)}</a></li>`).join("")}</ul></div>` : ""}
  </div>
</section>

<section class="section section-cream" id="approfondir">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">${t.nom}</span><h2 class="h-section">Pour <em>approfondir</em></h2></div>
      <p class="lead">${t.approfondir || "Les ouvrages d'où sont tirées ces questions, avec leur extrait gratuit quand il existe."}</p>
    </div>
    <div class="books">${t.livres.map(o => R.bookHTML(horsConcours(livreDe(o)), OUVRAGES.indexOf(o), false)).join("")}</div>
  </div>
</section>

${sujets.length ? `<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">En accès libre, ${t.nom}</span><h2 class="h-section">Des sujets <em>corrigés</em></h2></div>
    </div>
    <div class="ep-cards">${sujets.slice(0, 6).map((x, i) => sujetCard(x, prefix, i)).join("")}</div>
  </div>
</section>` : ""}

<section class="section${sujets.length ? " section-cream" : ""}">
  <div class="wrap">
    <div class="section-head reveal"><div><span class="eyebrow">Continuer</span><h2 class="h-section">Les autres <em>QCM</em></h2></div></div>
    <div class="ep-cards">${THEMES.filter(x => x !== t).map((x, i) => qcmCard(x, prefix, i)).join("")}${qcmCard(methode, prefix, THEMES.length, `${prefix}methodes/#qcm`)}</div>
  </div>
</section>

${contactCTA(prefix)}`;
    write(`qcm/${t.slug}/index.html`, page({
      prefix, url, body, scripts: ["assets/js/qcm-matieres.js"],
      title: [`${t.titre} gratuit, concours de Côte d'Ivoire`, `${t.titre} gratuit`, t.titre],
      description: `${plural(t.questions.length, "question")} corrigées ${/^[aeiouhéè]/i.test(t.nom) ? "d'" : "de "}${t.nom.toLowerCase()}, concours ${courts(t.concours).replace(/ · /g, ", ")}. ${t.intro}`,
      ld: [breadcrumb([["Accueil", SITE], ["QCM", SITE + "qcm/"], [t.nom, url]]), {
        "@context": "https://schema.org", "@type": "Quiz", name: t.titre, description: t.intro, url, inLanguage: "fr",
        about: t.nom, isAccessibleForFree: true, educationalLevel: "Concours de la fonction publique", provider: { "@type": "Organization", name: "Les Cours Sésame et SAJ" }
      }]
    }));
    urls.push(url);
  }

  // Page qui réunit tous les QCM
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "qcm/";
  const nb = THEMES.reduce((n, t) => n + t.questions.length, 0) + ctx.D.QCM.length;
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["QCM", ""]],
    h1: `Les QCM gratuits`,
    lead: `${nb} questions corrigées pour tester vos connaissances et votre méthode : droit civil, droit pénal, procédure pénale, droit administratif, droit OHADA, droits de l'enfant, organisation judiciaire, culture générale et méthode des épreuves. Chaque réponse est expliquée.`,
    ctas: `<a href="#liste" class="btn btn-gold">Choisir un QCM${arrow}</a><a href="${prefix}test-de-niveau/" class="btn btn-ghost">Test de niveau sur 20</a>`,
    facts: [`<b>${THEMES.length + 1}</b> QCM`, `<b>${nb}</b> questions corrigées`]
  })}

<section class="section" id="liste">
  <div class="wrap">
    <div class="ep-cards">${THEMES.map((t, i) => qcmCard(t, prefix, i)).join("")}${qcmCard(methode, prefix, THEMES.length, `${prefix}methodes/#qcm`)}</div>
  </div>
</section>

${contactCTA(prefix)}`;
  write("qcm/index.html", page({
    prefix, url, body,
    title: ["QCM gratuits de droit et de méthode pour les concours ivoiriens", "QCM gratuits de droit et de méthode"],
    description: `${nb} questions corrigées gratuites : droit civil, pénal, administratif et OHADA, procédure pénale, droits de l'enfant, organisation judiciaire, culture générale.`,
    ld: [breadcrumb([["Accueil", SITE], ["QCM", url]])]
  }));
  urls.push(url);
}

/* ---------- Fiches de révision : vitrine publique ---------- */
// contenu/fiches.js (tools/fiches/vitrine.py) ne contient que ce qui s'affiche ici : l'essentiel, les sources et le
// plan de chaque fiche. La fiche entière se lit dans l'espace abonnés, dès la formule d'un jour.
{
  const FICHES = require(path.join(DIR, "contenu/fiches.js"));
  const TARIF_JOUR = (ctx.D.TARIFS_ABONNEMENT || []).find(t => t.cle === "j1");
  const MATIERES = [...new Set(FICHES.map(f => f.matiere))];
  FICHES.forEach(f => f.concours.forEach(id => { if (!CONCOURS.some(c => c.id === id)) throw new Error(`fiche ${f.numero} : concours inconnu ${id}`); }));
  const ficheURL = (f, prefix) => `${prefix}fiches/${f.slug}/`;
  const resume = f => { const t = stripTags(f.essentiel[0]); return t.length > 170 ? t.slice(0, t.lastIndexOf(" ", 165)) + "…" : t; };
  const ficheCard = (f, prefix, i) => `<a class="ep-card" href="${ficheURL(f, prefix)}">
        <span class="ep-card-tag">Fiche n° ${f.numero}</span>
        <b>${esc(f.titre)}</b>
        <span>${esc(resume(f))}</span>
        <small class="sujet-card-foot">${courts(f.concours)}</small>
        <span class="ep-card-go">Lire l'essentiel</span>
      </a>`;
  const prix = TARIF_JOUR ? `${TARIF_JOUR.prix} FCFA la journée` : "quelques centaines de francs";
  // Fiches remises en entier contre un prénom et un contact (fonction fiche-offerte, qui tient la même liste)
  const OFFERTES = [1, 23].map(n => FICHES.find(f => f.numero === n));
  const SCRIPTS_OFFERTE = ["assets/js/espace-config.js", "assets/js/fiche-offerte.js"];
  const offerteForm = (f, prefix) => `<div class="offerte" id="offerte">
      <p class="eyebrow">Fiche offerte</p>
      <h2 class="h-section">Recevez cette fiche <em>en entier</em></h2>
      <p>Laissez votre prénom et un e-mail ou un numéro WhatsApp : vous téléchargez aussitôt la fiche complète en PDF, et nous vous l'envoyons aussi par e-mail si vous en indiquez un.</p>
      <form class="form offerte-form" id="offerteForm" data-fiche="${f.numero}" novalidate>
        <div class="field"><label for="offPrenom">Prénom</label><input id="offPrenom" name="prenom" autocomplete="given-name" maxlength="60" required></div>
        <div class="field"><label for="offConcours">Concours préparé</label><select id="offConcours" name="concours"><option value="">Choisir</option>${CONCOURS.map(c => `<option value="${c.id}">${c.court}</option>`).join("")}<option value="autre">Autre</option></select></div>
        <div class="field"><label for="offEmail">E-mail</label><input id="offEmail" name="email" type="email" autocomplete="email" maxlength="254"></div>
        <div class="field"><label for="offWa">ou WhatsApp</label><input id="offWa" name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="07 00 00 00 00"></div>
        <label class="offerte-accord"><input type="checkbox" name="accepte_offres" value="1"> J'accepte de recevoir des conseils de révision et des offres des Cours Sésame et SAJ, par e-mail ou sur WhatsApp. Désinscription possible à tout moment.</label>
        <button class="btn btn-gold" type="submit">Recevoir la fiche</button>
        <p class="offerte-etat" id="offerteEtat" role="status"></p>
      </form>
      <div class="offerte-ok" id="offerteOk" hidden>
        <p><b>Votre fiche est prête.</b> <span data-email>Nous vous l'avons aussi envoyée par e-mail.</span> Le lien reste valable 7 jours.</p>
        <a class="btn btn-gold" href="#" target="_blank" rel="noopener">Télécharger la fiche</a>
      </div>
      <p class="offerte-mention">Vos coordonnées servent à vous remettre la fiche et, si vous l'acceptez, à vous envoyer nos conseils et offres. Elles ne sont ni vendues ni cédées : voir nos <a href="${prefix}mentions-legales/#fiche-offerte">données personnelles</a>.</p>
    </div>`;
  const offerteBand = (prefix, sauf) => {
    const o = OFFERTES.filter(x => x !== sauf);
    return `<div class="espace-band offerte-band"><div><b>Essayez avant de vous abonner</b><p>${o.length > 1 ? "Deux fiches sont offertes en entier" : "Une fiche est offerte en entier"} : ${o.map(x => `<a href="${ficheURL(x, prefix)}#offerte">n° ${x.numero}, ${esc(x.titre)}</a>`).join(" et ")}.</p></div></div>`;
  };

  for (const f of FICHES) {
    const prefix = "../../";
    R.setRoot(prefix);
    const url = SITE + `fiches/${f.slug}/`;
    const voisines = FICHES.filter(x => x.matiere === f.matiere && x !== f)
      .sort((a, b) => Math.abs(a.numero - f.numero) - Math.abs(b.numero - f.numero)).slice(0, 6).sort((a, b) => a.numero - b.numero);
    const body = `${subHero({
      crumbs: [["Accueil", prefix], ["Fiches de révision", prefix + "fiches/"], [`Fiche n° ${f.numero}`, ""]],
      h1: esc(f.titre),
      lead: `Fiche de révision n° ${f.numero}, ${f.matiere.charAt(0).toLowerCase() + f.matiere.slice(1)}. L'essentiel est en accès libre ci-dessous ; la fiche entière, avec les textes cités mot pour mot, les exemples, les pièges des correcteurs et ${f.questions} questions corrigées, se lit dans l'espace abonnés.`,
      ctas: `<a href="${prefix}espace-abonnes/" class="btn btn-gold">Lire la fiche entière</a><a href="${prefix}fiches/" class="btn btn-ghost">Toutes les fiches</a>`,
      facts: [f.matiere, `pour les concours ${courts(f.concours)}`, `<b>${f.questions}</b> questions corrigées`]
    })}

<section class="section">
  <div class="wrap fiche-vitrine">
    <article class="fiche-libre">
      <p class="eyebrow">En accès libre</p>
      <h2 class="h-section">L'essentiel <em>en une phrase</em></h2>
      <div class="fiche-essentiel">${f.essentiel.map(p => `<p>${p}</p>`).join("")}</div>
      <h3>Les textes de référence</h3>
      <p class="fiche-sources">${esc(f.sources)}</p>
      ${OFFERTES.includes(f) ? offerteForm(f, prefix) : offerteBand(prefix, f)}
    </article>
    <aside class="fiche-plan" aria-label="Au programme de la fiche">
      <h3>Au programme de la fiche</h3>
      <ol>${f.plan.map((t, i) => `<li${i ? ` class="ferme"` : ""}>${i ? svg("i-lock") : svg("i-check")}<span>${esc(t)}</span></li>`).join("")}</ol>
      <p>La fiche entière se lit en ligne dans l'espace abonnés, dès ${prix}, avec les ${FICHES.length} fiches, les sujets corrigés et les QCM.</p>
      <a class="btn btn-navy btn-block" href="${prefix}espace-abonnes/">Accéder à l'espace abonnés</a>
    </aside>
  </div>
</section>

${voisines.length ? `<section class="section section-cream">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">${esc(f.matiere)}</p><h2 class="h-section">Dans la même <em>matière</em></h2></div>
    <div class="ep-cards">${voisines.map((x, i) => ficheCard(x, prefix, i)).join("")}</div>
  </div>
</section>` : ""}`;
    write(`fiches/${f.slug}/index.html`, page({
      prefix, url, body, scripts: OFFERTES.includes(f) ? SCRIPTS_OFFERTE : [],
      title: [`${f.titre} : fiche de révision, droit ivoirien`, `${f.titre} : fiche de révision`, f.titre],
      description: `${stripTags(f.essentiel[0])} Fiche de révision pour les concours ${courts(f.concours)}.`,
      ld: [breadcrumb([["Accueil", SITE], ["Fiches de révision", SITE + "fiches/"], [`Fiche n° ${f.numero}`, url]]), {
        "@context": "https://schema.org", "@type": "LearningResource", name: f.titre, url, inLanguage: "fr", about: f.matiere,
        learningResourceType: "Fiche de révision", educationalLevel: "Concours de la fonction publique",
        isAccessibleForFree: false, hasPart: { "@type": "WebPageElement", isAccessibleForFree: true, cssSelector: ".fiche-libre" },
        provider: { "@type": "Organization", name: "Les Cours Sésame et SAJ" }
      }]
    }));
    urls.push(url);
  }

  // Page qui réunit toutes les fiches, par matière
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "fiches/";
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Fiches de révision", ""]],
    h1: `${FICHES.length} fiches de révision de <em>droit ivoirien</em>`,
    lead: `Une notion par fiche : l'essentiel en une phrase, les textes cités mot pour mot, les exemples, les pièges des correcteurs et des questions corrigées. L'essentiel de chaque fiche est en accès libre ; la fiche entière se lit dans l'espace abonnés, dès ${prix}.`,
    ctas: `<a href="#matieres" class="btn btn-gold">Parcourir les fiches</a><a href="${prefix}espace-abonnes/" class="btn btn-ghost">Espace abonnés</a>`,
    facts: [`<b>${FICHES.length}</b> fiches`, `<b>${MATIERES.length}</b> matières`, "citations vérifiées dans les textes officiels"]
  })}

<section class="section" id="matieres">
  <div class="wrap">
    <p class="desinscription" id="desinscription" role="status" hidden>Désinscription en cours…</p>
    ${offerteBand(prefix)}
    <nav class="pills fiches-matieres" aria-label="Matières">${MATIERES.map(m => `<a class="pill" href="#${slugify(m)}">${esc(m)} <small>${FICHES.filter(f => f.matiere === m).length}</small></a>`).join("")}</nav>
    ${MATIERES.map(m => `<h2 class="group-title" id="${slugify(m)}">${esc(m)}<small>${plural(FICHES.filter(f => f.matiere === m).length, "fiche")}</small></h2>
    <div class="ep-cards">${FICHES.filter(f => f.matiere === m).map((f, i) => ficheCard(f, prefix, i)).join("")}</div>`).join("\n    ")}
  </div>
</section>`;
  write("fiches/index.html", page({
    prefix, url, body, scripts: SCRIPTS_OFFERTE,
    title: [`${FICHES.length} fiches de révision de droit ivoirien pour les concours`, `${FICHES.length} fiches de révision de droit ivoirien`],
    description: `${FICHES.length} fiches de révision de droit ivoirien pour les concours ${courts(CONCOURS.map(c => c.id))} : ${MATIERES.join(", ").toLowerCase()}. L'essentiel de chaque fiche en accès libre.`,
    ld: [breadcrumb([["Accueil", SITE], ["Fiches de révision", url]]), {
      "@context": "https://schema.org", "@type": "ItemList", name: "Fiches de révision",
      itemListElement: FICHES.map((f, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + `fiches/${f.slug}/`, name: f.titre }))
    }]
  }));
  urls.push(url);
}

/* ---------- Test de niveau gratuit ---------- */
// 20 questions tirées des QCM publics, selon le concours choisi (test-niveau.js) ; pour voir son résultat, le visiteur
// laisse son prénom et un e-mail ou un numéro WhatsApp (fonction fiche-offerte, action « test », table prospects).
{
  const qc = {};
  vm.createContext(qc);
  vm.runInContext(read("assets/js/qcm-matieres.js") + "\n;globalThis.Q=QCM_MATIERES;", qc);
  const tous = CONCOURS.map(c => c.id);
  const banque = [{ nom: "Méthode des épreuves", lien: "methodes/#qcm", concours: tous, questions: ctx.D.QCM },
    ...qc.Q.map(t => ({ nom: t.nom, lien: `qcm/${t.slug}/`, concours: t.concours, questions: t.questions }))]
    .map(t => ({ ...t, questions: t.questions.map(q => ({ q: q.q, options: q.options, bonne: q.bonne, explication: q.explication })) }));
  write("assets/qj/test.json", JSON.stringify(banque));
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "test-de-niveau/";
  const total = banque.reduce((n, t) => n + t.questions.length, 0);
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Test de niveau", ""]],
    h1: "Test de niveau <em>gratuit</em>",
    lead: "Vingt questions tirées de nos QCM, choisies selon votre concours. À la fin : votre note sur 20, vos points forts et vos points faibles matière par matière, la correction de chaque question et nos conseils pour la suite.",
    ctas: `<a href="#test" class="btn btn-gold">Commencer le test</a>`,
    facts: ["<b>20</b> questions", "environ <b>10</b> minutes", "résultat immédiat"]
  })}

<section class="section" id="test">
  <div class="wrap">
    <div class="test-niveau" id="testNiveau" data-banque="${prefix}assets/qj/test.json?v=${require("crypto").createHash("sha1").update(JSON.stringify(banque)).digest("hex").slice(0, 10)}" data-prefix="${prefix}">
      <div class="test-etape" data-etape="debut">
        <h2 class="h-section">Quel concours <em>préparez-vous ?</em></h2>
        <p>Les questions sont tirées au hasard parmi les ${total} questions de nos QCM, dans les matières de votre concours. Prenez une feuille si besoin : pas de chronomètre, mais répondez sans chercher la réponse.</p>
        <div class="test-concours">${CONCOURS.map(c => `<button class="btn btn-ghost" type="button" data-concours="${c.id}">${c.court}</button>`).join("")}</div>
      </div>
      <div class="test-etape" data-etape="question" hidden></div>
      <div class="test-etape" data-etape="contact" hidden>
        <h2 class="h-section">Votre résultat <em>est prêt</em></h2>
        <p>Indiquez votre prénom et un e-mail ou un numéro WhatsApp pour l'afficher. Avec un e-mail, nous vous l'envoyons aussi, pour le garder.</p>
        <form class="form offerte-form" id="testForm" novalidate>
          <div class="field"><label for="tPrenom">Prénom</label><input id="tPrenom" name="prenom" autocomplete="given-name" maxlength="60" required></div>
          <div class="field"><label for="tEmail">E-mail</label><input id="tEmail" name="email" type="email" autocomplete="email" maxlength="254"></div>
          <div class="field"><label for="tWa">ou WhatsApp</label><input id="tWa" name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="07 00 00 00 00"></div>
          <label class="offerte-accord"><input type="checkbox" name="accepte_offres" value="1"> J'accepte de recevoir des conseils de révision et des offres des Cours Sésame et SAJ, par e-mail ou sur WhatsApp. Désinscription possible à tout moment.</label>
          <button class="btn btn-gold" type="submit">Voir mon résultat</button>
          <p class="offerte-etat" id="testEtat" role="status"></p>
        </form>
        <p class="offerte-mention">Vos coordonnées et votre résultat servent à vous le remettre et, si vous l'acceptez, à vous envoyer nos conseils et offres. Ils ne sont ni vendus ni cédés : voir nos <a href="${prefix}mentions-legales/#test-de-niveau">données personnelles</a>.</p>
      </div>
      <div class="test-etape" data-etape="resultat" hidden></div>
      <noscript><p>Le test de niveau a besoin de JavaScript. Vous pouvez aussi vous entraîner sur <a href="${prefix}qcm/">nos QCM par matière</a>.</p></noscript>
    </div>
  </div>
</section>`;
  write("test-de-niveau/index.html", page({
    prefix, url, body, scripts: ["assets/js/espace-config.js", "assets/js/test-niveau.js"],
    title: ["Test de niveau gratuit pour les concours : magistrature, greffe, ENA", "Test de niveau gratuit pour les concours", "Test de niveau gratuit"],
    description: "Testez gratuitement votre niveau avant les concours de la magistrature, du greffe, de l'administration pénitentiaire, de l'EPPJEJ ou de l'ENA : 20 questions, une note sur 20 et le détail par matière.",
    ld: [breadcrumb([["Accueil", SITE], ["Test de niveau", url]])]
  }));
  urls.push(url);
}

/* ---------- Espace abonnés ---------- */
// Pages fixes ; tout le reste (connexion, contenus, administration) est affiché par espace.js et espace-admin.js
const SCRIPTS_ESPACE = ["assets/vendor/supabase-2.117.0.js", "assets/js/espace-config.js", "assets/js/espace.js"];
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "espace-abonnes/";
  const tarifs = ctx.D.TARIFS_ABONNEMENT || [];
  const nomCourt = id => (CONCOURS.find(c => c.id === id) || {}).court || id;
  const valeur = LIVRES_ABONNEMENT.reduce((s, l) => s + l.prix, 0);
  // Vitrine : les ouvrages du catalogue compris dans l'abonnement, avec un lien vers la page de chacun
  const vitrine = LIVRES_ABONNEMENT.length ? `<section class="section section-cream" id="inclus">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">${R.ABO_MENTION}</span><h2 class="h-section">${LIVRES_ABONNEMENT.length} ouvrages du catalogue à lire en ligne</h2></div>
      <p class="lead">Avec l'abonnement VIP, ${vipDes}${VIP_MOIS ? ` ou ${VIP_MOIS.prix} FCFA le mois` : ""}, vous lisez la version intégrale de ces ouvrages dans l'espace VIP, avec nos vidéos réservées. Au catalogue, ils représentent ensemble ${fmt(valeur)} FCFA. S'y ajoutent des ouvrages réservés aux abonnés VIP et tout l'abonnement normal : sujets corrigés, fiches de révision, QCM chronométrés. <a href="#espace-app">Voir la liste complète</a>.</p>
    </div>
    <ul class="abo-livres">${LIVRES_ABONNEMENT.map(({ o, cats }, i) => `
      <li class="abo-livre reveal reveal-d${i % 4}"><a href="${R.ouvrageURL(o)}">${R.coverHTML(o)}<span class="abo-livre-txt"><b>${o.titre}</b><small>${cats.map(nomCourt).join(", ")}</small></span></a></li>`).join("")}
    </ul>
    <p class="abo-note">L'abonnement normal donne accès à tous les autres contenus, mais pas à l'espace VIP. Les ouvrages se lisent en ligne, sur un appareil à la fois, pendant la durée de l'abonnement. Pour garder un ouvrage, commandez-le dans <a href="${prefix}ouvrages/">notre catalogue</a>.</p>
  </div>
</section>` : "";
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Espace abonnés", ""]],
    h1: `L'espace abonnés`,
    lead: `Sujets corrigés, fiches de révision, QCM chronométrés, révision du jour et simulateur de grand oral et, dans l'espace VIP, nos ouvrages complets et nos vidéos réservées. Créez votre compte, réglez par Mobile Money, et votre accès s'ouvre pour la durée de votre abonnement.`,
    ctas: `<a href="#inscription" class="btn btn-gold">Créer mon compte${arrow}</a><a href="#connexion" class="btn btn-ghost">Se connecter</a>${LIVRES_ABONNEMENT.length ? `<a href="#inclus" class="btn btn-ghost">L'espace VIP</a>` : ""}`,
    facts: [...tarifs.filter(t => ["j1", "j7", "m1", "m12"].includes(t.cle)).map(t => `${t.duree} : <b>${t.prix} FCFA</b>`), ...(VIP_JOUR && VIP_MOIS ? [`VIP : <b>${VIP_JOUR.prix} FCFA</b> le jour, <b>${VIP_MOIS.prix} FCFA</b> le mois`] : [])]
  })}

<section class="section espace-section" id="espace-app">
  <div class="wrap">
    <div class="ea-app" id="espace" aria-live="polite" aria-busy="true">
      <p class="ea-attente">Chargement de l'espace abonnés…</p>
      <noscript><p class="ea-erreur">L'espace abonnés a besoin de JavaScript : activez-le dans votre navigateur.</p></noscript>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Outils de révision</span><h2 class="h-section">Réviser chaque jour, pas seulement lire</h2></div>
      <p class="lead">Avec votre abonnement, l'espace ne se contente pas de mettre des documents à disposition : il vous fait travailler, au rythme qui fait retenir.</p>
    </div>
    <ol class="espace-etapes">
      <li class="espace-etape"><b>Révision du jour</b><span>Les questions des QCM reviennent au bon moment : une question réussie s'espace, une question manquée revient dès le lendemain. Votre maîtrise s'affiche matière par matière.</span></li>
      <li class="espace-etape"><b>Simulateur de grand oral</b><span>Une question du jury, une minute de préparation, trois minutes pour répondre à voix haute, avec enregistrement facultatif, grille d'auto-évaluation et réponse attendue.</span></li>
      <li class="espace-etape"><b>Sujet de la semaine</b><span>Chaque lundi, un sujet corrigé à traiter en conditions réelles, puis à comparer avec notre corrigé.</span></li>
      <li class="espace-etape"><b>Tableau de bord</b><span>Compte à rebours jusqu'au concours, semaine du planning de révision, jours de travail d'affilée, progression et badges.</span></li>
    </ol>
  </div>
</section>

${vitrine}

<section class="section${LIVRES_ABONNEMENT.length ? "" : " section-cream"}">
  <div class="wrap">
    <div class="section-head reveal">
      <div><h2 class="h-section">Comment s'abonner</h2></div>
      <p class="lead">Le paiement se fait comme pour nos ouvrages : par Mobile Money, avec une confirmation sur WhatsApp.</p>
    </div>
    <ol class="espace-etapes">
      <li class="espace-etape"><b>Créez votre compte</b><span>En une minute, avec votre adresse e-mail et votre numéro WhatsApp.</span></li>
      <li class="espace-etape"><b>Réglez par Mobile Money</b><span>Orange Money, MTN MoMo, Wave ou Moov Money, puis saisissez la référence du paiement dans votre espace ou envoyez-la-nous sur WhatsApp.${tarifs.length ? "" : " Nous vous indiquons le tarif."}</span></li>
      <li class="espace-etape"><b>Accédez aux contenus</b><span>Votre accès s'ouvre dès réception du paiement, pour toute la durée de votre abonnement. Les ouvrages complets et les vidéos réservées se lisent avec l'abonnement VIP. Un compte s'utilise sur un appareil à la fois : une connexion sur un autre appareil déconnecte le précédent.</span></li>
    </ol>
  </div>
</section>

${contactCTA(prefix)}`;
  write("espace-abonnes/index.html", page({
    prefix, url, body, scripts: SCRIPTS_ESPACE,
    title: "Espace abonnés : corrigés, fiches, QCM et espace VIP",
    description: "Des sujets corrigés, des fiches de révision et des QCM chronométrés dès 500 FCFA la journée, et nos ouvrages complets à lire en ligne dans l'espace VIP.",
    ld: [breadcrumb([["Accueil", SITE], ["Espace abonnés", url]])]
  }));
  urls.push(url);
}
/* ---------- Concours blancs ---------- */
// Sujets en accès libre, chronométrés dans le navigateur ; corrigés réservés aux abonnés (assets/js/concours-blancs.js)
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "concours-blancs/";
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Concours blancs", ""]],
    h1: `Concours blancs de la <em>magistrature</em>, du <em>Greffe</em>, du <em>pénitentiaire</em>, de l'<em>EPPJEJ</em> et de l'<em>ENA</em>`,
    lead: "Des séries complètes et inédites, aux conditions des concours directs de l'INFJ et de l'ENA. Magistrature : dix séries, la présélection en 2 heures puis les cinq épreuves écrites en 4 heures. Greffe : cinq séries par cycle (administrateurs, attachés, secrétaires des greffes et parquets), avec le sujet d'ordre général, les épreuves juridiques et l'informatique. Administration pénitentiaire : cinq séries par cycle (administrateurs, attachés, agents d'encadrement), avec le droit pénal, le droit pénitentiaire et l'étude de texte. EPPJEJ : cinq séries par cycle, avec le sujet d'ordre général, les droits de l'enfant, l'organisation judiciaire ou administrative, le statut de la fonction publique et l'informatique. ENA : cinq séries par cycle, avec la présélection en vrai ou faux, puis, au cycle supérieur, la note de synthèse (5 heures, sur un dossier d'articles illustrés), le sujet d'ordre général, les problèmes économiques et sociaux (3 heures) et le droit administratif ; au cycle moyen supérieur, le sujet d'ordre général, les problèmes économiques et sociaux (3 heures), le droit constitutionnel et le résumé de texte suivi d'une discussion ; au cycle moyen, le sujet d'ordre général et la connaissance du monde contemporain, en QCM de culture générale. Chacun compose gratuitement ; le corrigé de chaque épreuve est réservé aux abonnés.",
    ctas: `<a href="#blancs-app" class="btn btn-gold">Choisir une épreuve${arrow}</a><a href="${prefix}espace-abonnes/#inscription" class="btn btn-ghost">S'abonner pour les corrigés</a>`,
    facts: ["<b>70</b> séries", "<b>315</b> épreuves", "Magistrature, Greffe, pénitentiaire, EPPJEJ, ENA", "Corrigés et grilles sur 20"]
  })}

<section class="section section-cream cb-charte-section">
  <div class="wrap">
    <div class="cb-charte reveal">
      <h2 class="h-section">Avant de commencer</h2>
      <p class="lead">Ces concours blancs servent à mesurer votre vrai niveau. Traitez-les comme le jour du concours : seul, sans document, sans téléphone et sans recherche, d'une traite. Un résultat obtenu en trichant ne vous apprend rien ; un résultat honnête vous dit exactement ce qu'il reste à travailler.</p>
      <ol class="espace-etapes">
        <li class="espace-etape"><b>Le chronomètre démarre à l'entrée</b><span>Dès que vous entrez dans le sujet, le temps tourne, à la durée officielle de l'épreuve, de 2 à 5 heures. Il n'y a pas de retour en arrière, l'épreuve ne se recommence pas.</span></li>
        <li class="espace-etape"><b>Quitter fige le compteur</b><span>Si vous quittez la page, le compteur reste figé et repart dès que vous revenez dans le sujet. Le temps déjà passé reste acquis.</span></li>
        <li class="espace-etape"><b>Le corrigé après la copie</b><span>Une fois la copie rendue ou le temps écoulé, les abonnés des formules d'une semaine et plus lisent le corrigé : note immédiate et justifications pour les épreuves en vrai ou faux, corrigé-type et grille de notation pour les écrits.</span></li>
      </ol>
    </div>
  </div>
</section>

<section class="section" id="blancs-app">
  <div class="wrap">
    <div class="ea-app cb-app" id="blancs" aria-live="polite" aria-busy="true">
      <p class="ea-attente">Chargement des concours blancs…</p>
      <noscript><p class="ea-erreur">Les concours blancs ont besoin de JavaScript : activez-le dans votre navigateur.</p></noscript>
    </div>
    <p class="abo-note">Votre progression et votre copie restent dans ce navigateur, sur cet appareil.</p>
  </div>
</section>

${contactCTA(prefix)}`;
  write("concours-blancs/index.html", page({
    prefix, url, body, scripts: [...SCRIPTS_ESPACE, "assets/js/concours-blancs.js"],
    title: "Concours blancs magistrature, Greffe, pénitentiaire, EPPJEJ et ENA",
    description: "Concours blancs inédits de l'INFJ et de l'ENA : 10 séries de magistrature, 15 du Greffe, 15 du pénitentiaire, 15 de l'EPPJEJ et 15 de l'ENA, chronométrées et gratuites. Corrigés pour les abonnés.",
    ld: [breadcrumb([["Accueil", SITE], ["Concours blancs", url]])]
  }));
  urls.push(url);
}
{
  // Administration : hors du plan du site et non indexée
  const prefix = "../../";
  R.setRoot(prefix);
  const body = `<section class="hero hero-sub">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${prefix}">Accueil</a><span aria-hidden="true">›</span><a href="${prefix}espace-abonnes/">Espace abonnés</a><span aria-hidden="true">›</span><span aria-current="page">Administration</span></nav>
    <h1 class="sub-h1">Administration de <em>l'espace abonnés</em></h1>
    <p class="lead">Suivez les abonnements en direct, activez-les après paiement, suspendez-les ou supprimez-les, relancez les abonnés sur WhatsApp et publiez les contenus exclusifs.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="ea-app" id="admin" aria-live="polite" aria-busy="true"><p class="ea-attente">Chargement…</p></div>
  </div>
</section>`;
  write("espace-abonnes/admin/index.html", page({
    prefix, url: SITE + "espace-abonnes/admin/", body, robots: "noindex, nofollow", stats: false,
    scripts: [...SCRIPTS_ESPACE, "assets/js/espace-admin.js"],
    title: "Administration de l'espace abonnés",
    description: "Administration de l'espace abonnés des Cours Sésame et SAJ.",
    ld: []
  }));
}

/* ---------- Mentions légales et données personnelles ---------- */
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "mentions-legales/";
  const { WA2 } = ctx.D;
  const tel = n => `+${n.slice(0, 3)} ${n.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
  const waLink = n => `<a class="nowrap" href="https://wa.me/${n}" target="_blank" rel="noopener">${tel(n)}</a>`;
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Mentions légales", ""]],
    h1: `Mentions légales et données personnelles`,
    lead: "Qui édite ce site, qui l'héberge, et ce que deviennent les informations que vous nous confiez.",
    ctas: `<a href="${WA_URL}" target="_blank" rel="noopener" class="btn btn-gold">${waIcon}Nous écrire</a><a href="${prefix}#faq" class="btn btn-ghost">Questions fréquentes</a>`
  })}

<section class="section legal">
  <div class="wrap legal-wrap">
    <h2>Éditeur du site</h2>
    <p>Le site ${SITE.replace(/^https:\/\//, "").replace(/\/$/, "")} est édité par Les Cours Sésame et SAJ (Savoirs &amp; Atouts Judiciaires), éditeur indépendant d'ouvrages de préparation aux concours administratifs et juridiques, établi à Abidjan, en Côte d'Ivoire.</p>
    <p>Pour nous joindre, sur WhatsApp ou par téléphone, au ${waLink(WA)} ou au ${waLink(WA2)}.</p>

    <h2>Hébergement</h2>
    <p>Le site est hébergé par GitHub Pages, service de la société GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>

    <h2>Indépendance</h2>
    <p>Les Cours Sésame et SAJ sont un éditeur indépendant. Nos ouvrages, corrigés, QCM et vidéos ne sont pas des publications de l'INFJ, de l'ENA ni d'aucun organisateur de concours, et n'engagent que leurs auteurs. Les corrigés proposés sont les nôtres et non des corrigés officiels.</p>

    <h2>Propriété intellectuelle</h2>
    <p>Les textes, corrigés, fiches, QCM, vidéos, extraits, logos et visuels de ce site appartiennent aux Cours Sésame et SAJ. Leur reproduction, leur diffusion ou leur revente, en tout ou en partie, sans notre autorisation écrite préalable est interdite. Partager le lien d'une page reste bien sûr libre.</p>

    <h2>Commandes</h2>
    <p>Les commandes se passent sur WhatsApp, depuis le panier ou depuis la page d'un ouvrage. Les prix sont affichés en francs CFA. Le prix, le paiement, la livraison, les incidents de livraison et les abonnements sont régis par nos <a href="${prefix}conditions-de-vente/">conditions de vente et d'abonnement</a>.</p>

    <h2>Données personnelles</h2>
    <p>En dehors de l'espace abonnés et du formulaire de la fiche offerte, présentés plus bas, ce site ne comporte ni compte client ni formulaire enregistré sur un serveur.</p>
    <p>Votre panier est conservé uniquement dans votre navigateur, sur votre appareil, pour que vous le retrouviez à votre prochaine visite. Nous n'y avons pas accès. Pour le supprimer, videz-le ou effacez les données du site dans votre navigateur.</p>
    <p>Quand vous commandez, les informations que vous saisissez (prénom, nom, téléphone, ville, message) sont placées dans un message WhatsApp que vous envoyez vous-même. Nous ne les utilisons que pour traiter votre commande et vous livrer.</p>
    <p>Le site n'utilise aucun cookie. Les polices de caractères sont hébergées sur le site lui-même. Quelques photographies sont affichées depuis les serveurs d'Unsplash, qui reçoivent à cette occasion l'adresse IP du visiteur, et l'hébergeur GitHub enregistre l'adresse IP des visiteurs pour la sécurité de son service.</p>
    <p>Conformément à la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel, vous disposez d'un droit d'accès, de rectification, d'opposition et de suppression des données qui vous concernent. Pour l'exercer, écrivez-nous sur WhatsApp.</p>

    <h2 id="mesure-audience">Mesure d'audience</h2>
    <p>Pour connaître la fréquentation du site, nous utilisons GoatCounter, un outil de mesure d'audience qui ne dépose aucun cookie et n'enregistre rien dans votre navigateur.</p>
    <p>Il ne produit que des statistiques globales : pages consultées, site d'où vient le visiteur, navigateur, système, taille d'écran, langue et pays. Le pays est déduit de l'adresse IP, qui n'est pas conservée. Aucun visiteur ne peut être identifié ni suivi d'un site à l'autre.</p>
    <p>Ces statistiques sont hébergées en Europe, en Finlande et en Allemagne, et ne sont communiquées à personne.</p>
    <p>Nous tenons aussi notre propre relevé des pages vues, pour suivre la fréquentation en temps réel. À votre première visite, le site tire au hasard un identifiant anonyme et le garde dans votre navigateur, sans cookie. À chaque page, il enregistre dans notre base cet identifiant, l'adresse de la page, le site d'où vous venez et le type d'appareil (téléphone, tablette ou ordinateur). Votre adresse IP n'est pas conservée et rien ne permet de connaître votre identité. Si vous êtes connecté à votre compte abonné, la page vue est rattachée à votre compte.</p>
    <p>Ces relevés sont conservés 180 jours dans la base de l'espace abonnés, présentée plus bas, et ne sont consultables que par l'administrateur. Ils ne sont communiqués à personne. Pour effacer l'identifiant anonyme, effacez les données du site dans votre navigateur. La page d'administration de l'espace abonnés n'est pas mesurée.</p>

    <h2 id="espace-abonnes">Espace abonnés</h2>
    <p>Pour utiliser l'espace abonnés, vous créez un compte avec votre prénom, votre nom, votre numéro de téléphone (WhatsApp), votre adresse e-mail et, si vous le souhaitez, le concours que vous préparez. Nous enregistrons aussi les dates et les paiements de votre abonnement.</p>
    <p>Ces informations servent uniquement à gérer votre compte et votre abonnement, et à vous contacter à son sujet sur WhatsApp. Elles ne sont ni vendues ni cédées à quiconque.</p>
    <p>Elles sont conservées par notre prestataire Supabase, sur des serveurs situés en Europe. Votre mot de passe est enregistré sous une forme chiffrée que personne, pas même nous, ne peut lire. Quand vous le choisissez, nous vérifions qu'il ne figure pas dans une fuite de données connue, auprès du service Pwned Passwords : seuls les cinq premiers caractères d'une empreinte du mot de passe lui sont transmis, jamais le mot de passe lui-même.</p>
    <p>Les vidéos, documents, fiches et QCM de l'espace affichent votre nom, votre numéro de téléphone et, sur les documents, les fiches et les QCM, votre adresse e-mail avec la date et l'heure de lecture, pour décourager leur diffusion. Ils sont réservés à votre usage personnel.</p>
    <p>Un compte ne s'utilise que sur un appareil à la fois. Pour l'assurer, nous enregistrons la date de chaque connexion, l'heure de votre dernier passage sur l'espace abonnés et un identifiant technique de la session ouverte, sans aucune information sur l'appareil lui-même. Ces données servent aussi à repérer les comptes partagés.</p>
    <p>Les documents s'affichent page par page. Chaque page vous est envoyée sous forme d'image portant votre nom, votre numéro de téléphone, votre adresse e-mail, ainsi que la date et l'heure. Nous enregistrons, jour par jour, les pages que vous lisez, pour appliquer la limite quotidienne de lecture. Lorsque vous téléchargez des pages, nous enregistrons la date, le document, les numéros des pages et une référence, qui figure aussi sur les pages téléchargées. Ces informations servent à appliquer les limites prévues par les conditions de vente et à retrouver l'origine d'une diffusion. Elles sont conservées chez Supabase, en Europe, et effacées avec votre compte.</p>

    <h2 id="fiche-offerte">Fiche offerte</h2>
    <p>Certaines fiches de révision sont offertes en entier. Pour les recevoir, vous indiquez votre prénom et une adresse e-mail ou un numéro WhatsApp, et, si vous le souhaitez, le concours que vous préparez. Nous enregistrons aussi la date, la fiche demandée et l'adresse de la page. Votre adresse IP est notée pour limiter les abus, puis effacée au bout d'un jour.</p>
    <p>Ces informations servent à vous remettre la fiche, par un lien de téléchargement et, si vous avez indiqué une adresse, par un e-mail envoyé par notre prestataire Brevo. Si vous cochez la case prévue, elles servent aussi à vous envoyer nos conseils de révision et nos offres, par e-mail ou sur WhatsApp ; sans cette case, nous ne vous écrivons pas. Vous pouvez retirer votre accord à tout moment, par le lien figurant dans nos e-mails ou en nous écrivant sur WhatsApp.</p>
    <p>Elles sont conservées chez Supabase, en Europe, consultables par l'administrateur seulement, et ne sont ni vendues ni cédées. Elles sont effacées sur simple demande sur WhatsApp, et au plus tard trois ans après votre dernier échange avec nous.</p>
    <h2 id="test-de-niveau">Test de niveau</h2>
    <p>Pour voir le résultat du test de niveau gratuit, vous indiquez votre prénom et une adresse e-mail ou un numéro WhatsApp. Nous enregistrons aussi le concours choisi, votre résultat (la note et le nombre de bonnes réponses par matière), la date et l'adresse de la page ; votre adresse IP est notée pour limiter les abus, puis effacée au bout d'un jour. Ces informations servent à vous afficher votre résultat et, si vous avez indiqué une adresse, à vous l'envoyer par un e-mail de notre prestataire Brevo. Pour le reste, les règles de la fiche offerte ci-dessus s'appliquent : conseils et offres seulement si vous cochez la case, conservation chez Supabase, effacement sur simple demande et au plus tard trois ans après votre dernier échange avec nous.</p>

    <h2 id="emails">E-mails</h2>
    <p>Nous envoyons aux abonnés, depuis l'adresse infos@coursesesame.com, trois sortes d'e-mails liés à leur abonnement. Le premier souhaite la bienvenue lors du premier abonnement, le deuxième rappelle la fin prochaine d'un abonnement trois jours avant son terme lorsqu'il n'a pas été prolongé, le troisième annonce les contenus mis en ligne dans l'espace abonnés, au plus une fois par jour. L'annonce des nouveautés n'est adressée qu'aux abonnés en cours ; chacun peut la refuser à tout moment, par le lien figurant dans chaque annonce ou dans la rubrique « Mon compte » de l'espace abonnés. Nous n'envoyons d'offres commerciales par e-mail qu'aux personnes qui l'ont accepté en demandant une fiche offerte.</p>
    <p>Ces e-mails sont envoyés par notre prestataire Brevo (société Sendinblue SAS, établie en France), qui reçoit à cette fin votre adresse e-mail, votre prénom et le contenu du message. Nous gardons la date, la nature et le résultat de chaque envoi, effacés avec votre compte.</p>

    <h2 id="agent-revision">Agent de révision</h2>
    <p>L'agent de révision de l'espace abonnés rédige des corrigés et corrige des copies à l'aide d'un service d'intelligence artificielle fourni par la société Anthropic, PBC, établie aux États-Unis. Lorsque vous l'utilisez, le texte de votre sujet et, le cas échéant, de votre copie lui sont transmis, avec des extraits de nos ouvrages, pour rédiger la réponse. Votre nom, votre numéro de téléphone et votre adresse e-mail ne lui sont pas transmis. Selon ses conditions commerciales, Anthropic n'utilise pas les données reçues par ce service pour entraîner ses modèles.</p>
    <p>N'écrivez donc aucune information personnelle, ni la vôtre ni celle d'un tiers, dans le sujet ou dans la copie. Vos demandes et les réponses sont conservées dans votre compte, chez Supabase en Europe, pour que vous puissiez les relire ; elles nous servent aussi à suivre la qualité et le coût du service, et sont effacées avec votre compte.</p>
    <p>Vous pouvez demander à tout moment la correction de vos informations ou la suppression de votre compte en nous écrivant sur WhatsApp. La suppression d'un compte efface les informations qui s'y rattachent.</p>

    <h2 id="credits">Crédits</h2>
    <p>Les photographies suivantes sont publiées sous la <a href="https://unsplash.com/license" target="_blank" rel="noopener">licence Unsplash</a>, qui en permet l'usage libre :</p>
    <ul>
      <li>Le Plateau, à Abidjan, vu de la lagune Ébrié : <a href="https://unsplash.com/photos/e514SZzfpfM" target="_blank" rel="noopener">djebi abraham philippe</a> ;</li>
      <li>Étudiante prenant des notes : <a href="https://unsplash.com/photos/xl-x9IB6wxc" target="_blank" rel="noopener">Kojo Kwarteng</a> ;</li>
      <li>Correction au stylo rouge : <a href="https://unsplash.com/photos/333oj7zFsdg" target="_blank" rel="noopener">lilartsy</a>.</li>
    </ul>
    <p>Les polices Source Serif 4 et Source Sans 3 sont distribuées sous la licence SIL Open Font License 1.1.</p>

    <p class="legal-date">Mise à jour en octobre 2026.</p>
  </div>
</section>

${contactCTA(prefix)}`;
  write("mentions-legales/index.html", page({
    prefix, url, body,
    title: "Mentions légales et données personnelles",
    description: "Éditeur, hébergement, propriété intellectuelle et données personnelles du site des Cours Sésame et SAJ, éditeur indépendant d'ouvrages pour les concours.",
    ld: [breadcrumb([["Accueil", SITE], ["Mentions légales", url]])]
  }));
  urls.push(url);
}

/* ---------- Conditions de vente et d'abonnement ---------- */
{
  const prefix = "../";
  R.setRoot(prefix);
  const url = SITE + "conditions-de-vente/";
  const tarifs = ctx.D.TARIFS_ABONNEMENT || [];
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Conditions de vente", ""]],
    h1: `Conditions de vente et d'abonnement`,
    lead: "Comment se passent une commande d'ouvrages et un abonnement à l'espace abonnés, et ce que nous faisons si quelque chose ne va pas.",
    ctas: `<a href="${WA_URL}" target="_blank" rel="noopener" class="btn btn-gold">${waIcon}Nous écrire</a><a href="${prefix}#faq" class="btn btn-ghost">Questions fréquentes</a>`
  })}

<section class="section legal">
  <div class="wrap legal-wrap">
    <p>Les présentes conditions s'appliquent aux commandes d'ouvrages passées auprès des Cours Sésame et SAJ et aux abonnements à l'espace abonnés du site. Passer commande ou souscrire un abonnement vaut acceptation de ces conditions.</p>

    <h2 id="prix">Prix</h2>
    <p>Les prix sont indiqués en francs CFA sur le site. La remise de 10 % s'applique automatiquement dès 3 ouvrages dans le panier. Le prix retenu est celui affiché au moment de la commande, et le total vous est confirmé avant tout paiement.</p>

    <h2 id="commande">Commande d'ouvrages</h2>
    <p>Vous commandez sur WhatsApp, depuis le panier ou depuis la page d'un ouvrage. Nous vous répondons pour confirmer la disponibilité, le total et les modalités de livraison. La commande est ferme une fois cette confirmation donnée et le paiement convenu effectué.</p>

    <h2 id="paiement">Paiement</h2>
    <p>Le paiement se fait par Orange Money, MTN MoMo, Wave ou Moov Money. À Abidjan, il peut aussi se faire en espèces à la livraison. Pour les autres villes, le paiement se fait avant l'expédition.</p>

    <h2 id="livraison">Livraison</h2>
    <p>Nous livrons dans toute la Côte d'Ivoire : à Abidjan sous 24 à 48 heures, dans les autres villes sous 3 à 5 jours ouvrables par transporteur. Ces délais sont indicatifs et courent à partir de la confirmation de la commande. Les ouvrages proposés en version numérique vous sont remis selon les modalités indiquées lors de la confirmation.</p>

    <h2 id="incident">Colis non reçu, abîmé ou erroné</h2>
    <p>Si votre colis n'arrive pas dans les délais, s'il arrive abîmé ou s'il ne contient pas l'ouvrage commandé, écrivez-nous sur WhatsApp dès que possible, avec une photo si l'ouvrage est abîmé. Nous recherchons le colis auprès du transporteur. S'il est perdu, abîmé ou erroné, nous vous envoyons l'ouvrage commandé sans frais supplémentaires ou, si ce n'est pas possible, nous vous remboursons la somme payée pour cet ouvrage.</p>

    <h2 id="abonnement">Abonnement à l'espace abonnés</h2>
    <p>Vous créez votre compte sur la page <a href="${prefix}espace-abonnes/">Espace abonnés</a>, vous réglez la formule choisie par Mobile Money, puis vous nous transmettez la référence du paiement, depuis votre espace ou sur WhatsApp. Nous activons votre accès après vérification du paiement. Les formules en vigueur sont les suivantes :</p>
    ${tarifs.length ? `<div class="table-wrap"><table class="tarifs"><thead><tr><th scope="col">Durée</th><th scope="col">Abonnement</th><th scope="col">Abonnement VIP</th></tr></thead><tbody>${tarifs.map(t => { const v = TARIFS_VIP.find(x => x.cle === "vip-" + t.cle); return `<tr><td>${t.duree}</td><td>${t.prix} FCFA</td><td>${v ? v.prix + " FCFA" : "non proposé"}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
    <p>La durée de la formule court à partir de l'activation, et non du paiement : un accès activé plus tard ne vous fait perdre aucun jour. Une prolongation s'ajoute à la fin de l'abonnement en cours. L'abonnement donne accès aux sujets corrigés, aux fiches de révision, aux QCM, aux textes officiels, à la jurisprudence et, à partir d'une semaine, aux corrigés des concours blancs. L'abonnement VIP donne accès, en plus, à l'espace VIP : les ouvrages complets, les vidéos réservées et les documents réservés au VIP, quelle que soit sa durée, ainsi qu'à la correction d'une copie par mois civil, notée sur 20 par un correcteur. Certains nouveaux contenus, signalés « Avant-première VIP », s'ouvrent aux abonnés VIP dès leur mise en ligne et aux autres abonnés sept jours plus tard. Les abonnements enregistrés avant l'ouverture de l'espace VIP, le 28 octobre 2026, gardent jusqu'à leur terme l'accès qu'ils donnaient alors (ouvrages complets pour les formules d'un mois et plus, vidéos pour les formules d'une semaine et plus).</p>

    <h2 id="non-active">Abonnement payé mais pas encore activé</h2>
    <p>L'activation se fait à la main, dès que nous avons reçu votre paiement et sa référence. Si votre accès n'est pas encore ouvert, relancez-nous sur WhatsApp avec la référence du paiement. Si l'abonnement ne peut pas être activé, par exemple parce que le paiement n'a pas abouti chez l'opérateur, la somme reçue vous est remboursée.</p>

    <h2 id="usage">Usage de l'espace abonnés</h2>
    <p>Un compte est personnel et s'utilise sur un seul appareil à la fois : une connexion sur un autre appareil déconnecte le précédent. Les contenus se lisent en ligne, portent votre nom, votre numéro de téléphone et votre adresse e-mail, et sont réservés à votre usage personnel. Les documents s'affichent page par page, dans la limite de 300 pages différentes par jour ; une page relue le même jour n'est pas décomptée une seconde fois. Leur copie, leur capture, leur diffusion, leur partage ou leur revente sont interdits, sous la seule réserve du téléchargement de pages prévu ci-dessous. En cas de partage du compte ou de diffusion des contenus, nous pouvons suspendre l'abonnement le temps de vérifier, puis couper l'accès, sans remboursement.</p>
    <p>Un abonnement suspendu garde ses jours restants : ils reprennent le jour de la réactivation.</p>
    <p>Si l'espace abonnés devient indisponible plusieurs jours de suite de notre fait, nous prolongeons votre abonnement d'autant.</p>

    <h2 id="telechargement">Téléchargement de pages</h2>
    <p>Dans les documents PDF que sa formule lui permet de lire, l'abonné peut télécharger des pages. Sur une période de trente jours glissants, il peut en télécharger au plus 20 pages en tout, tous ouvrages et documents confondus, et au plus 5 pages d'un même ouvrage ou document ; avec un abonnement VIP en cours, ces limites sont portées à 60 pages en tout et 15 pages d'un même ouvrage ou document. Ces limites sont strictes : aucune page n'est accordée au-delà. Le nombre de pages encore disponibles est affiché avant chaque téléchargement. Chaque page téléchargée est décomptée pendant trente jours, même si elle l'avait déjà été.</p>
    <p>Chaque page téléchargée est une image qui porte, fondus dans la page, le nom, le numéro de téléphone et l'adresse e-mail de l'abonné, avec la date, l'heure et la référence du téléchargement. Les pages sont préparées à la demande et doivent être récupérées dans les 30 minutes qui suivent la réservation. Ces pages sont réservées à son usage personnel, dans les mêmes conditions que les autres contenus. Leur diffusion, leur partage, leur reproduction pour autrui ou leur revente sont interdits et exposent l'abonné aux mesures prévues à la rubrique « Usage de l'espace abonnés », sans préjudice des poursuites prévues par la loi. Le téléchargement de pages est une facilité offerte avec l'abonnement. Ses limites peuvent évoluer, sans modifier le prix ni la durée des abonnements en cours.</p>

    <h2 id="parrainage">Parrainage</h2>
    <p>Chaque abonné dispose d'un code de parrainage, affiché dans son espace. Lorsqu'une personne indique ce code en créant son compte, puis règle son premier abonnement, le parrain reçoit 7 jours d'accès gratuits, ajoutés à la suite de son abonnement. La récompense est accordée une seule fois par filleul et ne peut être convertie en argent. Un compte créé dans le seul but d'obtenir des jours gratuits, ou un parrainage de soi-même, n'ouvre droit à aucune récompense, et les jours déjà accordés peuvent alors être retirés.</p>
    <h2 id="remboursement">Remboursement d'un abonnement</h2>
    <p>Les contenus sont accessibles dès l'activation : un abonnement activé n'est donc pas remboursable, même s'il n'a pas été utilisé jusqu'à son terme.</p>

    <h2 id="agent-revision">Agent de révision</h2>
    <p>Lorsqu'il est ouvert, l'agent de révision est compris sans supplément dans l'abonnement VIP. Il rédige un corrigé de cas pratique, de dissertation ou de commentaire d'article, ou corrige la copie de l'abonné et lui attribue une note sur 20. Le nombre de demandes est limité par jour et par mois ; la limite en vigueur est affichée dans l'espace abonnés. L'agent peut être interrompu, notamment pour maintenance ou lorsque sa limite mensuelle de fonctionnement est atteinte ; cette interruption ne modifie ni le prix ni la durée de l'abonnement.</p>
    <p>Les réponses de l'agent sont produites automatiquement par un service d'intelligence artificielle, à partir de nos ouvrages et de notre méthode. Elles constituent une aide à la révision et peuvent comporter des erreurs. Elles ne sont ni des corrigés officiels ni une consultation juridique, et la note attribuée est indicative : elle ne préjuge pas de celle d'un jury. Vérifiez les références avant de les apprendre. Les réponses sont réservées à votre usage personnel, dans les mêmes conditions que les autres contenus. Les données transmises à l'agent sont traitées comme indiqué dans les <a href="${prefix}mentions-legales/#agent-revision">mentions légales</a>.</p>

    <h2 id="contenus">Nature des contenus</h2>
    <p>Nos ouvrages, fiches, corrigés, QCM et vidéos sont des outils de préparation aux concours. Ils ne sont pas des publications officielles de l'INFJ, de l'ENA ni d'aucun organisateur de concours, et ne constituent pas une consultation juridique. Les corrigés proposés sont les nôtres et non des corrigés officiels.</p>
    <p>Les textes officiels (lois, décrets, actes uniformes OHADA) et les décisions de justice de l'espace abonnés sont reproduits d'après leurs sources officielles, indiquées pour chacun, avec la date de leur mise en ligne. Ils sont fournis à titre documentaire : seule leur publication officielle, notamment au Journal officiel, fait foi. Malgré notre vigilance, un texte peut avoir été modifié depuis ; vérifiez sa version en vigueur avant tout usage. Les décisions de droit privé sont publiées avec les noms des parties remplacés par leurs initiales. Les grands arrêts de droit public, publiés sous le nom des parties par la juridiction elle-même et cités sous ce nom par la doctrine, conservent leur appellation usuelle.</p>

    <h2 id="litiges">Réclamations et droit applicable</h2>
    <p>Pour toute réclamation, écrivez-nous sur WhatsApp : nous cherchons d'abord une solution à l'amiable. Les présentes conditions sont soumises au droit ivoirien. Les données personnelles sont traitées comme indiqué dans les <a href="${prefix}mentions-legales/">mentions légales</a>.</p>

    <p class="legal-date">Mise à jour en octobre 2026.</p>
  </div>
</section>

${contactCTA(prefix)}`;
  write("conditions-de-vente/index.html", page({
    prefix, url, body,
    title: "Conditions de vente et d'abonnement",
    description: "Prix, commande, paiement, livraison, colis non reçu, abonnement à l'espace abonnés, activation et remboursement : nos conditions de vente.",
    ld: [breadcrumb([["Accueil", SITE], ["Conditions de vente", url]])]
  }));
  urls.push(url);
}

/* ---------- Page d'erreur ---------- */
// GitHub Pages affiche 404.html pour toute adresse inconnue, quelle que soit sa profondeur :
// les liens partent donc de la racine du site (« / »). Page non indexée, hors du plan du site.
{
  const prefix = "/";
  R.setRoot(prefix);
  const liens = [
    ["ouvrages/", "Tous les ouvrages", "Le catalogue complet, avec les extraits gratuits."],
    ["sujets/", "Sujets corrigés", "Dissertations, cas pratiques, commentaires et SOG corrigés."],
    ["concours-blancs/", "Concours blancs", "Concours blancs chronométrés de la magistrature, du Greffe, du pénitentiaire, de l'EPPJEJ et de l'ENA."],
    ["qcm/", "QCM gratuits", "Testez vos connaissances, chaque réponse expliquée."],
    ["espace-abonnes/", "Espace abonnés", "Connexion et création de compte."]
  ];
  const body = `<section class="hero hero-sub">
  <div class="wrap">
    <h1 class="sub-h1">Cette page est introuvable</h1>
    <p class="lead">L'adresse a peut-être été mal tapée, ou la page a changé de place. Repartez de l'accueil ou choisissez une rubrique ci-dessous. Si vous cherchiez un ouvrage précis, écrivez-nous sur WhatsApp.</p>
    <div class="hero-ctas"><a class="btn btn-gold" href="${prefix}">Revenir à l'accueil</a><a class="btn btn-ghost" href="${WA_URL}" target="_blank" rel="noopener">${waIcon}Écrire sur WhatsApp</a></div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2 class="h-section">Les rubriques du site</h2>
    <div class="ep-cards">${liens.map(([h, t, d]) => `<a class="ep-card" href="${prefix}${h}"><b>${t}</b><span>${d}</span><span class="ep-card-go">Ouvrir</span></a>`).join("")}</div>
    <h2 class="h-section erreur-concours">Les concours</h2>
    <div class="concours-grid">${CONCOURS.map((c, i) => concoursCard(c, i, prefix)).join("")}</div>
  </div>
</section>`;
  write("404.html", page({
    prefix, url: null, body, robots: "noindex",
    title: "Page introuvable",
    description: "Cette page n'existe pas ou a changé de place. Retrouvez les ouvrages, les sujets corrigés et les QCM des Cours Sésame et SAJ.",
    ld: []
  }));
}

/* ---------- Accueil ---------- */
R.setRoot("");
index = inject(index, "concours", "\n      " + CONCOURS.map((c, i) => concoursCard(c, i, "")).join("\n      ") + "\n    ");
index = inject(index, "books", selectionHTML());
index = inject(index, "abonnement", abonnementHTML());
index = inject(index, "essai", essaiHTML());
index = inject(index, "prixjour", prixJourHTML());
index = inject(index, "faq", faqHTML());
index = inject(index, "videos", "\n" + videosSection(VIDS, "", {
  h2: `Nos vidéos`, ici: "accueil",
  lead: "Notre présentation, un ouvrage en vidéo, des notions et un article de loi expliqués en une minute, et des sujets de SOG décryptés.",
  band: espaceBand("")
}) + "\n");
// Chiffres clés écrits en dur : ils s'affichent même avant l'animation (ou sans JavaScript)
index = index.replace(/(data-count-from="ouvrages">)[^<]*(<)/g, `$1${LIVRES.length}$2`).replace(/(data-count-from="concours">)[^<]*(<)/g, `$1${CONCOURS.length}$2`);
index = inject(index, "stats", STATS + '<script defer src="assets/js/visite.js"></script>');
index = inject(index, "jsonld", "\n" + [
  { "@context": "https://schema.org", "@type": "WebSite", name: "Les Cours Sésame et SAJ", url: SITE, inLanguage: "fr" },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ...VIDS.map(videoLD)
].map(jsonld).join("\n") + "\n");
write("index.html", cleanHTML(index));

/* ---------- Plan du site ---------- */
/* ---------- Hors connexion : page de secours et service worker (sw.js) ---------- */
// Le service worker garde les pages publiques déjà visitées (réseau d'abord, copie si le réseau manque) et les fichiers
// du site (feuilles de style, scripts, polices, images). Il ne touche ni à Supabase ni aux contenus des abonnés, qui
// restent protégés (filigrane, un seul appareil), ni aux vidéos. Sa version suit l'empreinte des fichiers du site.
{
  const prefix = "../";
  R.setRoot(prefix);
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Hors connexion", ""]],
    h1: "Vous êtes <em>hors connexion</em>",
    lead: "Cette page n'a pas encore été ouverte sur cet appareil. Les pages déjà visitées, elles, restent lisibles sans réseau : fiches de révision, sujets corrigés, QCM et méthodes.",
    ctas: `<a href="${prefix}" class="btn btn-gold">Accueil</a><a href="${prefix}fiches/" class="btn btn-ghost">Fiches de révision</a>`,
    facts: ["Pages déjà visitées disponibles", "L'espace abonnés demande une connexion"]
  })}
<section class="section"><div class="wrap"><div class="hl-pages" id="pagesHorsLigne" hidden><h2 class="h-section">Disponibles <em>sur cet appareil</em></h2><ul></ul></div></div></section>`;
  write("hors-ligne/index.html", page({
    prefix, url: "", body, robots: "noindex", stats: false, scripts: ["assets/js/hors-ligne.js"],
    title: ["Hors connexion"], description: "Vous êtes hors connexion : les pages déjà visitées restent lisibles.", ld: []
  }));
  const fichiers = ["assets/css/style.css", "assets/js/data.js", "assets/js/render.js", "assets/js/app.js", "assets/js/hors-ligne.js",
    "assets/img/favicon.svg", "assets/img/icone-192.png", ...fs.readdirSync(path.join(DIR, "assets/fonts")).filter(f => f.endsWith(".woff2")).map(f => "assets/fonts/" + f)];
  const version = require("crypto").createHash("sha1").update(fichiers.map(f => f + empreinte(f)).join() + QJ_VERSION).digest("hex").slice(0, 10);
  const avance = ["/", "/hors-ligne/", ...fichiers.map(f => "/" + f + (/\.(css|js)$/.test(f) ? "?v=" + empreinte(f) : ""))];
  write("sw.js", `/* Service worker des Cours Sésame et SAJ, écrit par tools/build.js : ne pas modifier à la main.
   Pages publiques : réseau d'abord, copie gardée si le réseau manque, sinon la page /hors-ligne/.
   Fichiers du site : copie d'abord (leurs adresses changent à chaque version). Rien pour Supabase, les vidéos
   ni l'espace abonnés, dont les contenus restent en ligne. */
const VERSION = "${version}";
// Les pages gardent le même cache d'une version à l'autre ; les fichiers changent de cache à chaque version
const PAGES = "pages", FICHIERS = "fichiers-" + VERSION, MAX_PAGES = 80;
const AVANCE = ${JSON.stringify(avance)};
self.addEventListener("install", e => {
  e.waitUntil(caches.open(FICHIERS).then(c => c.addAll(AVANCE.filter(u => u.startsWith("/assets/")))).then(() =>
    caches.open(PAGES)).then(c => c.addAll(["/", "/hors-ligne/"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(k => k !== PAGES && k !== FICHIERS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const horsChamp = u => u.origin !== location.origin || u.pathname.startsWith("/espace-abonnes/") || u.pathname.startsWith("/assets/video/")
  || u.pathname === "/sw.js";
async function rogner() {
  const c = await caches.open(PAGES), cles = await c.keys();
  for (const k of cles.slice(0, Math.max(0, cles.length - MAX_PAGES))) await c.delete(k);
}
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  // Espace abonnés : jamais gardé ; sans réseau, la page hors connexion plutôt qu'une erreur du navigateur
  if (r.mode === "navigate" && u.origin === location.origin && u.pathname.startsWith("/espace-abonnes/")) {
    e.respondWith(fetch(r).catch(() => caches.match("/hors-ligne/")));
    return;
  }
  if (horsChamp(u)) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(rep => {
      if (rep.ok && rep.type === "basic") { const copie = rep.clone(); caches.open(PAGES).then(c => c.put(u.pathname, copie)).then(rogner); }
      return rep;
    }).catch(() => caches.match(u.pathname).then(m => m || caches.match("/hors-ligne/"))));
    return;
  }
  if (u.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(rep => {
      if (rep.ok && rep.type === "basic" && !r.headers.has("range")) { const copie = rep.clone(); caches.open(FICHIERS).then(c => c.put(r, copie)); }
      return rep;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m2 => m2 || Response.error()))));
  }
});
`);
}

write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`);

/* ---------- Consignes aux moteurs de recherche ---------- */
// La page d'administration porte déjà « noindex » ; le plan du site est indiqué à Google
write("robots.txt", `User-agent: *
Allow: /

Sitemap: ${SITE}sitemap.xml
`);
