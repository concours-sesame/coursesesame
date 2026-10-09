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
   L'en-tête, le pied de page et le panier des pages sont copiés depuis index.html
   (entre les repères partial:), pour qu'il n'y ait qu'un seul endroit à modifier. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = path.resolve(__dirname, "..");
const SITE = "https://concours-sesame.github.io/coursesesame/";
const OG_IMAGE = SITE + "assets/img/og-image.png";
const TODAY = new Date().toISOString().slice(0, 10);
const read = f => fs.readFileSync(path.join(DIR, f), "utf8");
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(DIR, f)), { recursive: true }); fs.writeFileSync(path.join(DIR, f), s); console.log("écrit", f); };

/* ---------- Données ---------- */
const ctx = {};
vm.createContext(ctx);
vm.runInContext(read("assets/js/data.js") + "\n;globalThis.D={WA,WA2,OUVRAGES,TEMOIGNAGES,FAQ,METHODO,EPREUVES,SUJETS,QCM,VIDEOS,TARIFS_ABONNEMENT};", ctx);
vm.runInContext(read("assets/js/render.js"), ctx);
const { WA, OUVRAGES, FAQ, METHODO, EPREUVES, SUJETS, VIDEOS } = ctx.D;
const R = ctx.SESAME;
const { CONCOURS, EPREUVES_PAR_CONCOURS, fmt, parsePrice, plural, slugify, attr, svg } = R;
const byCat = id => OUVRAGES.filter(o => o.categorie === id);
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
    if (/^(methodes\/|concours\/|ouvrages\/|sujets\/|qcm\/|assets\/|mentions-legales\/|espace-abonnes\/)/.test(h)) return prefix + h;
    return h;
  };
  return html.replace(/(<a\b[^>]*?\shref=")([^"]*)(")/g, (m, a, h, b) => a + fix(h) + b);
}

/* ---------- Morceaux réutilisés ---------- */
const arrow = svg("i-arrow", 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"');
const waIcon = svg("i-wa", 'fill="currentColor"');

function concoursCard(c, i, prefix) {
  const n = byCat(c.id).length;
  return `<a class="concours-card reveal reveal-d${i % 5}" href="${prefix}concours/${c.slug}/">
        <span class="cc-num">0${CONCOURS.indexOf(c) + 1}</span>
        <span class="cc-name">${c.court}</span>
        <span class="cc-sub">${c.long}</span>
        <span class="cc-go">${plural(n, "ouvrage")}${svg("i-arrow")}</span>
      </a>`;
}

function catalogueHTML() {
  return CONCOURS.map(c => {
    const items = byCat(c.id);
    return `<h3 class="group-title">${c.court}<small>${plural(items.length, "ouvrage")}</small><a class="group-link" href="concours/${c.slug}/">Page du concours</a></h3>${R.groupHTML(items, OUVRAGES, [], false)}`;
  }).join("");
}

function faqHTML() {
  return FAQ.map((f, i) => `<details class="faq-item"${i === 0 ? " open" : ""}><summary>${f.q}<i></i></summary><p>${f.a}</p></details>`).join("");
}

function sujetHTML(s) {
  return `<article class="paper paper-static">
        <div class="paper-side"><span class="tag">${s.concours}</span><h3>${s.titre}</h3><div class="meta">${s.meta}</div>
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
function page({ prefix, title, description, url, body, ld, bodyAttrs = "", image = OG_IMAGE, ogType = "website", scripts = [], robots = "" }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta name="theme-color" content="#0f2a5c">
<link rel="canonical" href="${url}">${robots ? `\n<meta name="robots" content="${robots}">` : ""}
<link rel="icon" href="${prefix}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${prefix}assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${prefix}assets/img/apple-touch-icon.png">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="Les Cours Sésame et SAJ">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Gelasio:ital,wght@0,500;0,700;1,500;1,700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${prefix}assets/css/style.css">
${ld.map(jsonld).join("\n")}
</head>
<body data-root="${prefix}"${bodyAttrs}>
<!-- Page générée par tools/build.js à partir de assets/js/data.js : ne pas modifier à la main. -->
${partial("sprite")}
${rebase(partial("header"), prefix)}
<main id="top">
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

function subHero({ crumbs, eyebrow, h1, lead, ctas, stats }) {
  return `<section class="hero hero-sub on-dark">
  <svg class="sub-door" viewBox="0 0 200 260" aria-hidden="true"><path class="sd-star" d="M100 4C102 22 108 28 126 30 108 32 102 38 100 56 98 38 92 32 74 30 92 28 98 22 100 4Z"/><path class="sd-in" d="M40 256V140a60 60 0 0 1 120 0v116z"/><path class="sd-leaf" d="M40 256V140a60 60 0 0 1 30-52v172z"/><path class="sd-frame" d="M40 256V140a60 60 0 0 1 120 0v116"/></svg>
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane">${crumbs.map(([n, h], i) => i === crumbs.length - 1 ? `<span aria-current="page">${n}</span>` : `<a href="${h}">${n}</a><span aria-hidden="true">›</span>`).join("")}</nav>
    <span class="eyebrow">${eyebrow}</span>
    <h1 class="sub-h1">${h1}</h1>
    <p class="lead">${lead}</p>
    <div class="hero-ctas">${ctas}</div>
    ${stats ? `<div class="hero-stats">${stats.map(([n, l]) => `<div><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`).join("")}</div>` : ""}
  </div>
</section>`;
}

function contactCTA(prefix) {
  return `<section class="section contact">
  <div class="wrap contact-inner">
    <div class="reveal">
      <span class="eyebrow">Besoin d'un conseil ?</span>
      <h2>Parlons de <em>votre</em> concours.</h2>
      <p>Dites-nous où vous en êtes : nous vous aidons à choisir les ouvrages adaptés, puis nous livrons partout en Côte d'Ivoire.</p>
      <a class="btn btn-navy" href="${WA_URL}" target="_blank" rel="noopener">${waIcon}Écrire sur WhatsApp</a>
      <a class="btn btn-ghost contact-alt" href="${prefix}#conseiller">Faire le test « Quel ouvrage pour moi ? »</a>
    </div>
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
      enonce: `<p>${s.enonce}</p>`, corrige: s.corrige, ouvrage: null, session: annee ? `Concours ${c.long}, session ${annee}` : "",
      resume: texte.length > 170 ? texte.slice(0, texte.lastIndexOf(" ", 165)) + "…" : texte
    });
  }
  SUJETS_PAGES.forEach((x, i) => { if (SUJETS_PAGES.findIndex(y => y.adresse === x.adresse) !== i) throw new Error("deux sujets ont la même adresse : " + x.adresse); });
}
const sujetsDe = o => SUJETS_PAGES.filter(x => x.ouvrage && x.ouvrage.titre === o.titre);
const sujetsDuConcours = id => SUJETS_PAGES.filter(x => x.concours.includes(id));
const courts = ids => ids.map(id => CONCOURS.find(c => c.id === id).court).join(" · ");
// « dissertation corrigée », « cas pratique corrigé »…
function corrigeLabel(epreuve) {
  const L = { "Dissertation juridique": "dissertation corrigée", "Cas pratique": "cas pratique corrigé", "Commentaire d'article": "commentaire d'article corrigé",
    "Questions-réponses": "questions de cours corrigées", "Plan détaillé": "plan détaillé de dissertation", "SOG": "SOG corrigé" };
  return L[epreuve] || "sujet corrigé";
}
function sujetCard(x, prefix, i) {
  return `<a class="ep-card sujet-card reveal reveal-d${i % 4}" href="${prefix}sujets/${x.adresse}/" data-concours="${x.concours.join(" ")}">
        <span class="ep-card-tag">${x.epreuve} · ${x.matiere}</span>
        <b>${x.titre}</b>
        <span>${x.resume}</span>
        <small class="sujet-card-foot">${courts(x.concours)}${x.session ? `<em>Sujet tombé au concours</em>` : ""}</small>
        <span class="ep-card-go">Lire le corrigé${svg("i-arrow")}</span>
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
        <figcaption><span class="v-tag">${v.tag}</span><b>${v.titre}</b><span class="v-desc">${v.desc}</span>${l ? `<a class="v-link" href="${l[1]}">${l[0]}${svg("i-arrow")}</a>` : ""}</figcaption>
      </figure>`;
}
// Vidéo mise en avant : la vidéo d'un côté, sa présentation de l'autre
function videoFeature(v, prefix, ici, titre, actions = "") {
  const l = videoLien(v, prefix, ici);
  return `<div class="v-feature v-feature-${v.format} reveal">
      ${videoFrame(v, prefix)}
      <div class="v-feature-text">
        <span class="v-tag">${v.tag} · ${v.duree}</span>
        <h3>${titre || v.titre}</h3>
        <p>${v.desc}</p>
        ${l || actions ? `<div class="v-actions">${l ? `<a class="btn btn-gold" href="${l[1]}">${l[0]}${arrow}</a>` : ""}${actions}</div>` : ""}
      </div>
    </div>`;
}
// Section « En vidéo » : la vidéo carrée en avant, les vidéos verticales en rangée
function videosSection(list, prefix, { id = "videos", eyebrow = "En vidéo", h2, lead, ici, cls = "on-dark", band = "" }) {
  if (!list.length) return "";
  const feat = list.find(v => v.format === "carre") || (list.length === 1 ? list[0] : null);
  const rest = list.filter(v => v !== feat);
  return `<section class="section ${cls} videos" id="${id}">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">${eyebrow}</span><h2 class="h-section">${h2}</h2></div>
      ${lead ? `<p class="lead">${lead}</p>` : ""}
    </div>
    ${feat ? videoFeature(feat, prefix, ici) : ""}
    ${rest.length ? `<div class="v-rail${feat ? " v-rail-after" : ""}">${rest.map((v, i) => videoCard(v, prefix, i, ici)).join("")}</div>` : ""}
    ${band}
  </div>
</section>`;
}
// Invitation à l'espace abonnés
function espaceBand(prefix) {
  return `<div class="espace-band reveal">
      <div><b>Allez plus loin avec l'espace abonnés</b><p>Vidéos, documents et fiches exclusifs, réservés aux abonnés. Créez votre compte en une minute, réglez par Mobile Money, et votre accès s'ouvre.</p></div>
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
  const title = `Concours ${nomCourt} 2027 : ouvrages, méthode et sujet corrigé | Les Cours Sésame et SAJ`;
  const series = [...new Set(items.map(o => R.coverParts(o.titre).serie).filter(Boolean))].map(s => s.toLowerCase());
  const description = `${plural(items.length, "ouvrage")} pour préparer le ${c.nom} en Côte d'Ivoire : ${series.slice(0, 4).join(", ")}. Méthode des épreuves, sujet corrigé, commande sur WhatsApp et livraison partout en Côte d'Ivoire.`;

  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Concours", prefix + "#concours"], [c.court, ""]],
    eyebrow: `Session 2027 · ${c.long}`,
    h1: `Concours ${nomCourt} : <em>ouvrages et méthode</em>`,
    lead: m ? m.conseil : "",
    ctas: `<a href="#ouvrages" class="btn btn-gold">Voir les ${items.length} ouvrages${arrow}</a><a href="${WA_URL}" target="_blank" rel="noopener" class="btn btn-ghost">${waIcon}Conseil personnalisé</a>`,
    stats: [[items.length, "Ouvrages"], [epreuves.length, "Épreuves"], [fmt(minPrix) + " F", "À partir de"], ["-10 %", "Dès 3 ouvrages"]]
  })}

<section class="section" id="epreuves">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Les épreuves</span><h2 class="h-section">Ce qui vous <em>attend</em></h2></div>
      <p class="lead">Les épreuves principales du ${c.nom}${fiches.length ? ", et nos fiches méthode pour les aborder" : ""}.</p>
    </div>
    <div class="pills pills-light reveal">${epreuves.map(e => `<span class="pill">${e}</span>`).join("")}</div>
    ${fiches.length ? `<div class="ep-cards">${fiches.map((f, i) => `<a class="ep-card reveal reveal-d${i % 4}" href="${prefix}methodes/#${slugify(f.nom)}"><span class="ep-card-tag">Fiche méthode</span><b>${f.nom}</b><span>${stripTags(f.contenu).split(". ")[0]}.</span><span class="ep-card-go">Lire la fiche${svg("i-arrow")}</span></a>`).join("")}</div>` : ""}
  </div>
</section>

<section class="section concours-books" id="ouvrages">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Les ouvrages · ${c.long}</span><h2 class="h-section">${plural(items.length, "ouvrage")} pour <em>réussir</em></h2></div>
      <p class="lead">Ajoutez un ouvrage ou un pack complet au panier, puis commandez en un message WhatsApp. La remise de 10 % s'applique dès 3 ouvrages.</p>
    </div>
    <div id="books">${R.groupHTML(items, OUVRAGES, [], true)}</div>
  </div>
</section>

${videosSection(vids, prefix, {
    h2: `Nos <em>vidéos</em>`, ici: "concours",
    lead: vids.length > 1 ? "Notre présentation, nos ouvrages et des sujets décryptés, en quelques minutes chacun." : "Découvrez notre accompagnement et nos ouvrages en un peu plus d'une minute."
  })}

${sujet ? `<section class="section sujets" id="corrige">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Extrait de nos ouvrages</span><h2 class="h-section">Un sujet <em>corrigé</em></h2></div>
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
    <div class="concours-grid concours-grid-4">${CONCOURS.filter(x => x !== c).map((x, i) => concoursCard(x, i, prefix)).join("")}</div>
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
      <div class="fiche-head"><span class="fiche-num">${String(i + 1).padStart(2, "0")}</span><div><h2>${e.nom}</h2>
      ${cs.length ? `<div class="fiche-meta">Concours : ${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join(" · ")}</div>` : ""}</div></div>
      <div class="ep-panel">${e.contenu}</div>
      ${vidsDe(e.nom).length ? `<div class="fiche-videos"><span class="m-label">En vidéo · ${vidsDe(e.nom).length > 1 ? "des sujets décryptés" : "un sujet décrypté"}</span><div class="v-rail v-rail-sm">${vidsDe(e.nom).map((v, k) => videoCard(v, prefix, k, "methode")).join("")}</div></div>` : ""}
      ${books.length ? `<div class="fiche-books"><span class="m-label">Pour aller plus loin</span>${books.map(o => `<button class="fiche-book" data-open="${OUVRAGES.indexOf(o)}"><span class="c-mini"></span><span><b>${o.titre}</b><small>${o.concours} · ${o.prix} FCFA</small></span></button>`).join("")}</div>` : ""}
    </article>`;
  }).join("");

  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Méthodes des épreuves", ""]],
    eyebrow: "Méthodologie · Concours de Côte d'Ivoire",
    h1: `Les méthodes des épreuves : <em>SOG, cas pratique, note de synthèse…</em>`,
    lead: "Dissertation juridique, cas pratique, commentaire d'arrêt, SOG, PECOS, note de synthèse et étude de texte : la démarche attendue par les jurys, étape par étape. Testez-vous ensuite avec notre QCM.",
    ctas: `<a href="#qcm" class="btn btn-gold">Faire le QCM${arrow}</a><a href="#${slugify(EPREUVES[0].nom)}" class="btn btn-ghost">Lire les fiches</a>`,
    stats: [[EPREUVES.length, "Fiches méthode"], [ctx.D.QCM.length, "Questions de QCM"], [CONCOURS.length, "Concours"]]
  })}

<section class="section sujets" id="qcm">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">QCM · ${ctx.D.QCM.length} questions</span><h2 class="h-section">Testez votre <em>méthode</em></h2></div>
      <p class="lead">Répondez, découvrez l'explication, puis défiez vos amis sur WhatsApp. Toutes les réponses se trouvent dans les fiches ci-dessous. Pour tester vos connaissances, voyez aussi nos <a href="${prefix}qcm/">QCM de droit par matière</a>.</p>
    </div>
    <div class="qcm-wrap reveal"><div id="qcmBox"><p class="lead">Activez JavaScript pour lancer le QCM.</p></div></div>
  </div>
</section>

<section class="section on-dark fiches">
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
    title: "Méthodes des épreuves des concours (SOG, cas pratique, note de synthèse) et QCM | Les Cours Sésame et SAJ",
    description: "Fiches méthode des épreuves des concours INFJ et ENA en Côte d'Ivoire : dissertation juridique, cas pratique, commentaire d'arrêt, SOG, PECOS, note de synthèse, étude de texte. QCM gratuit pour tester votre méthode.",
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

  const body = `<section class="hero hero-sub hero-product on-dark">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${prefix}">Accueil</a><span aria-hidden="true">›</span><a href="${prefix}ouvrages/">Ouvrages</a><span aria-hidden="true">›</span><span aria-current="page">${titreCourt}</span></nav>
    <div class="product">
      <div class="product-cover">${R.coverHTML(horsConcours(l))}</div>
      <div class="product-info">
        <div class="product-concours">${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join("")}</div>
        <h1 class="product-title">${o.titre}</h1>
        <p class="lead">${o.desc}</p>
        <div class="specs">${o.phase ? `<span class="spec">${o.phase}</span>` : ""}<span class="spec">Niveaux ${o.niveau}</span>${o.numerique ? `<span class="spec spec-num">Version numérique uniquement</span>` : `<span class="spec">Livraison partout en CI</span>`}<span class="spec">Paiement Mobile Money</span></div>
        <div class="product-buy">
          <span class="price">${o.prix}<small>FCFA</small></span>
          <button class="btn btn-gold p-add" data-add="${idx}">${svg("i-plus", 'fill="none" stroke="currentColor" stroke-width="2.6"')}Ajouter au panier</button>
        </div>
        <div class="product-actions">
          <a class="btn btn-wa" href="${WA_URL}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener">${waIcon}Commander sur WhatsApp</a>
          ${pdf ? `<a class="btn btn-ghost" href="${pdf}" target="_blank" rel="noopener">${bookIcon}Lire un extrait gratuit</a>` : ""}
        </div>
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
      <div><span class="eyebrow">Extrait gratuit</span><h2 class="h-section">Feuilletez <em>l'ouvrage</em></h2></div>
      <p class="lead">Quelques pages de l'extrait gratuit, telles qu'elles figurent dans l'ouvrage : la page de garde, la présentation et des pages de contenu. Touchez une page pour ouvrir l'extrait en PDF.</p>
    </div>
    <div class="apercu-grid${pages[0].h > pages[0].w ? " apercu-portrait" : ""}">${pages.map((x, i) => `<a class="apercu-page reveal reveal-d${i % 4}" href="${pdf}#page=${x.page}" target="_blank" rel="noopener"><img src="${prefix}${x.f}" alt="${attr(titreCourt)} : page ${x.page} de l'extrait gratuit" width="${x.w}" height="${x.h}" loading="lazy" decoding="async"><span>Page ${x.page}</span></a>`).join("")}</div>
    <div class="apercu-cta reveal"><a class="btn btn-navy" href="${pdf}" target="_blank" rel="noopener">${bookIcon}Lire tout l'extrait gratuit (PDF)</a></div>
  </div>
</section>` : ""}

${l.items.length > 1 ? `<section class="section section-cream">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Selon votre concours</span><h2 class="h-section">Un ouvrage, <em>${cs.length} concours</em></h2></div>
      <p class="lead">Cet ouvrage figure dans notre sélection pour plusieurs concours. Voici ce qu'il vous apporte pour chacun d'eux.</p>
    </div>
    <div class="ep-cards">${l.items.map((x, i) => { const c = concoursDe(x); return `<a class="ep-card reveal reveal-d${i % 4}" href="${prefix}concours/${c.slug}/"><span class="ep-card-tag">${c.long}</span><b>${c.court}</b><span>${x.desc}</span><span class="ep-card-go">Voir le concours ${c.court}${svg("i-arrow")}</span></a>`; }).join("")}</div>
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
      <div><span class="eyebrow">${concoursDe(o).long}</span><h2 class="h-section">Complétez votre <em>préparation</em></h2></div>
      <p class="lead">D'autres ouvrages pour le ${concoursDe(o).nom}. La remise de 10 % s'applique dès 3 ouvrages dans le panier.</p>
    </div>
    <div class="books">${suggestions.map(x => R.bookHTML(x, OUVRAGES.indexOf(x), false)).join("")}</div>
    <div class="apercu-cta reveal"><a class="btn btn-ghost" href="${prefix}concours/${concoursDe(o).slug}/">Tous les ouvrages ${concoursDe(o).court}${arrow}</a></div>
  </div>
</section>` : ""}

${contactCTA(prefix)}`;

  const description = `${o.desc} ${o.prix} FCFA${o.numerique ? ", version numérique" : ", livraison partout en Côte d'Ivoire"}${o.extrait ? ", extrait gratuit en PDF" : ""}.`;
  write(`ouvrages/${l.slug}/index.html`, page({
    prefix, url, body, description, ogType: "product", image: imageOuvrage(o),
    title: `${o.titre} | Les Cours Sésame et SAJ`,
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
    eyebrow: "Catalogue · Session 2027",
    h1: `Tous nos <em>ouvrages</em>`,
    lead: `${plural(LIVRES.length, "ouvrage")} pour préparer les concours de la Magistrature, du Greffe, de l'Administration pénitentiaire, de l'EPPJEJ et de l'ENA en Côte d'Ivoire. Ouvrez un ouvrage pour lire sa présentation, feuilleter l'extrait gratuit et le commander.`,
    ctas: `<a href="#liste" class="btn btn-gold">Voir les ouvrages${arrow}</a><a href="${WA_URL}" target="_blank" rel="noopener" class="btn btn-ghost">${waIcon}Conseil personnalisé</a>`,
    stats: [[LIVRES.length, "Ouvrages"], [OUVRAGES.filter((o, i) => o.extrait && OUVRAGES.findIndex(x => x.titre === o.titre) === i).length, "Avec extrait gratuit"], [CONCOURS.length, "Concours"], ["-10 %", "Dès 3 ouvrages"]]
  })}

<section class="section" id="liste">
  <div class="wrap">
    ${groups.map(([nom, ls]) => `<h2 class="group-title">${nom}<small>${plural(ls.length, "ouvrage")}</small></h2><div class="books">${ls.map(card).join("")}</div>`).join("\n    ")}
  </div>
</section>

${contactCTA(prefix)}`;
  write("ouvrages/index.html", page({
    prefix, url, body,
    title: "Tous les ouvrages de préparation aux concours de Côte d'Ivoire | Les Cours Sésame et SAJ",
    description: `${plural(LIVRES.length, "ouvrage")} pour réussir les concours de la Magistrature, du Greffe, de l'Administration pénitentiaire, de l'EPPJEJ et de l'ENA : annales corrigées, résumés de cours, méthode. Extraits gratuits et commande sur WhatsApp.`,
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
        <a class="extrait-link" href="${R.ouvrageURL(o)}">${svg("i-arrow")}Voir l'ouvrage</a>
      </div>` : `<div class="aside-card">
        <span class="eyebrow">Préparer le concours</span>
        <b class="aside-title">${cs.map(c => c.long).join(", ")}</b>
        <p>Retrouvez nos ouvrages, la méthode des épreuves et d'autres sujets corrigés.</p>
        ${cs.map(c => `<a class="btn btn-navy btn-sm" href="${prefix}concours/${c.slug}/">Concours ${c.court}${arrow}</a>`).join("")}
      </div>`;

  const body = `<section class="hero hero-sub hero-sujet on-dark">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${prefix}">Accueil</a><span aria-hidden="true">›</span><a href="${prefix}sujets/">Sujets corrigés</a><span aria-hidden="true">›</span><span aria-current="page">${x.epreuve}</span></nav>
    <span class="eyebrow">${x.epreuve} · ${x.matiere}</span>
    <h1 class="sub-h1 sujet-h1">${x.titre}</h1>
    <p class="lead">${x.session ? `<strong>Sujet tombé au concours.</strong> ${x.session}.` : x.resume}</p>
    <div class="product-concours">${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join("")}</div>
  </div>
</section>

<section class="section sujet-page">
  <div class="wrap sujet-layout">
    <article class="sujet-main">
      ${vids.map(v => `<div class="v-inline">${videoFrame(v, prefix)}<div class="v-inline-text"><span class="v-tag">${v.tag} · ${v.duree}</span><b>${v.titre} en vidéo</b><p>${v.desc}</p></div></div>`).join("")}
      <div class="enonce-box"><span class="enonce-label">Énoncé</span>${x.enonce}</div>
      <div class="copie" id="corrige">
${x.corrige}
      </div>
      <p class="sujet-note">Corrigé proposé par Les Cours Sésame et SAJ${o ? `, extrait de l'ouvrage « ${o.titre} »` : ""}. Ce n'est pas un corrigé officiel du concours.</p>
      <div class="sujet-actions">
        <button class="share-btn share-btn-dark" data-share="${url}" data-title="${attr(x.titre + " : sujet corrigé")}">${shareIcon}Partager ce corrigé</button>
        <a class="extrait-link" href="${prefix}sujets/">${svg("i-arrow")}Tous les sujets corrigés</a>
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

  const description = `${corrigeLabel(x.epreuve)[0].toUpperCase() + corrigeLabel(x.epreuve).slice(1)} en ${x.matiere.toLowerCase().replace("ohada", "OHADA").replace("opeaj", "OPEAJ")} pour le concours ${courts(x.concours).replace(/ · /g, ", ")} : ${x.resume}`;
  write(`sujets/${x.adresse}/index.html`, page({
    prefix, url, body, description, ogType: "article", image: o ? imageOuvrage(o) : OG_IMAGE,
    title: `${/^(Commentaire|Trois cas)|questions/i.test(x.titre) ? `${x.titre} (corrigé)` : `${x.titre} : ${corrigeLabel(x.epreuve)}`} | Les Cours Sésame et SAJ`,
    ld: [breadcrumb([["Accueil", SITE], ["Sujets corrigés", SITE + "sujets/"], [x.titre, url]]), {
      "@context": "https://schema.org", "@type": "Article", headline: x.titre, description: x.resume, inLanguage: "fr", url,
      isAccessibleForFree: true, about: x.matiere, educationalLevel: "Concours de la fonction publique",
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
    eyebrow: "En accès libre · Concours de Côte d'Ivoire",
    h1: `Sujets <em>corrigés</em>`,
    lead: `${plural(SUJETS_PAGES.length, "sujet")} corrigé${SUJETS_PAGES.length > 1 ? "s" : ""} en entier, tirés de nos ouvrages : dissertations, cas pratiques, commentaires d'articles, questions de cours et SOG, dont ${officiels} sujets réellement tombés aux concours.`,
    ctas: `<a href="#liste" class="btn btn-gold">Voir les sujets${arrow}</a><a href="${prefix}methodes/" class="btn btn-ghost">Méthodes des épreuves</a>`,
    stats: [[SUJETS_PAGES.length, "Sujets corrigés"], [officiels, "Sujets de concours"], [CONCOURS.length, "Concours"]]
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
    title: "Sujets corrigés des concours de la Magistrature, du Greffe et de l'ENA | Les Cours Sésame et SAJ",
    description: `${SUJETS_PAGES.length} sujets corrigés gratuits pour les concours de Côte d'Ivoire (Magistrature, Greffe, Pénitentiaire, EPPJEJ, ENA) : dissertations, cas pratiques, commentaires d'articles, questions de cours et SOG.`,
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
    "droit-administratif": ["Droit administratif"], "droits-de-l-enfant": ["Droits de l'enfant"], "organisation-judiciaire": ["Organisation judiciaire"]
  };
  for (const t of THEMES) {
    t.questions.forEach((q, i) => { if (!(q.bonne >= 0 && q.bonne < q.options.length)) throw new Error(`QCM ${t.slug}, question ${i + 1} : réponse "bonne" invalide`); });
    t.livres = t.ouvrages.map(titre => { const o = OUVRAGES.find(x => x.titre === titre); if (!o) throw new Error(`QCM ${t.slug} : ouvrage introuvable : ${titre}`); return o; });
  }
  const qcmCard = (t, prefix, i, href) => `<a class="ep-card reveal reveal-d${i % 4}" href="${href || `${prefix}qcm/${t.slug}/`}">
        <span class="ep-card-tag">QCM · ${plural(t.questions.length, "question")}</span>
        <b>${t.nom}</b>
        <span>${t.intro}</span>
        <small class="sujet-card-foot">${courts(t.concours)}</small>
        <span class="ep-card-go">Faire le QCM${svg("i-arrow")}</span>
      </a>`;
  const methode = { nom: "Méthode des épreuves", questions: ctx.D.QCM, concours: CONCOURS.map(c => c.id), intro: "Dissertation, cas pratique, commentaire, SOG, PECOS, note de synthèse et étude de texte : connaissez-vous les règles de méthode attendues par les jurys ?" };

  for (const t of THEMES) {
    const prefix = "../../";
    R.setRoot(prefix);
    const url = `${SITE}qcm/${t.slug}/`;
    const sujets = SUJETS_PAGES.filter(x => (MATIERES_SUJETS[t.slug] || []).includes(x.matiere));
    const body = `${subHero({
      crumbs: [["Accueil", prefix], ["QCM", prefix + "qcm/"], [t.nom, ""]],
      eyebrow: `QCM gratuit · ${courts(t.concours)}`,
      h1: t.titre.replace(/^(QCM (?:de |d'|sur les ))(.+)$/, "$1<em>$2</em>"),
      lead: t.intro,
      ctas: `<a href="#qcm" class="btn btn-gold">Commencer le QCM${arrow}</a><a href="#approfondir" class="btn btn-ghost">Approfondir</a>`,
      stats: [[t.questions.length, "Questions"], ["2 min", "Environ"], ["100 %", "Corrigé"]]
    })}

<section class="section sujets" id="qcm">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">QCM · ${plural(t.questions.length, "question")}</span><h2 class="h-section">Testez vos <em>connaissances</em></h2></div>
      <p class="lead">Choisissez une réponse, lisez l'explication, puis passez à la question suivante. Les réponses s'appuient sur le contenu de nos ouvrages, textes à l'appui.</p>
    </div>
    <div class="qcm-wrap reveal"><div id="qcmBox" data-theme="${t.slug}"><p class="lead">Activez JavaScript pour lancer le QCM.</p></div></div>
  </div>
</section>

<section class="section section-cream" id="approfondir">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">${t.nom}</span><h2 class="h-section">Pour <em>approfondir</em></h2></div>
      <p class="lead">Les ouvrages d'où sont tirées ces questions, avec leur extrait gratuit quand il existe.</p>
    </div>
    <div class="books">${t.livres.map(o => R.bookHTML(horsConcours(livreDe(o)), OUVRAGES.indexOf(o), false)).join("")}</div>
  </div>
</section>

${sujets.length ? `<section class="section">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">En accès libre · ${t.nom}</span><h2 class="h-section">Des sujets <em>corrigés</em></h2></div>
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
      title: `${t.titre} gratuit, concours de Côte d'Ivoire | Les Cours Sésame et SAJ`,
      description: `${plural(t.questions.length, "question")} corrigées de ${t.nom.toLowerCase()} pour préparer les concours ${courts(t.concours).replace(/ · /g, ", ")} : ${t.intro}`,
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
    eyebrow: "Entraînement gratuit · Concours de Côte d'Ivoire",
    h1: `Les <em>QCM</em>`,
    lead: `${nb} questions corrigées pour tester vos connaissances et votre méthode : droit civil, droit pénal, droit administratif, droits de l'enfant, organisation judiciaire et méthode des épreuves. Chaque réponse est expliquée.`,
    ctas: `<a href="#liste" class="btn btn-gold">Choisir un QCM${arrow}</a><a href="${prefix}sujets/" class="btn btn-ghost">Sujets corrigés</a>`,
    stats: [[THEMES.length + 1, "QCM"], [nb, "Questions"], [CONCOURS.length, "Concours"]]
  })}

<section class="section" id="liste">
  <div class="wrap">
    <div class="ep-cards">${THEMES.map((t, i) => qcmCard(t, prefix, i)).join("")}${qcmCard(methode, prefix, THEMES.length, `${prefix}methodes/#qcm`)}</div>
  </div>
</section>

${contactCTA(prefix)}`;
  write("qcm/index.html", page({
    prefix, url, body,
    title: "QCM gratuits de droit et de méthode pour les concours de Côte d'Ivoire | Les Cours Sésame et SAJ",
    description: `${nb} questions corrigées gratuites : droit civil, droit pénal, droit administratif, droits de l'enfant, organisation judiciaire et méthode des épreuves, pour les concours INFJ et ENA.`,
    ld: [breadcrumb([["Accueil", SITE], ["QCM", url]])]
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
  const body = `${subHero({
    crumbs: [["Accueil", prefix], ["Espace abonnés", ""]],
    eyebrow: "Espace abonnés",
    h1: `Les contenus <em>réservés</em> aux abonnés`,
    lead: "Vidéos, documents et fiches exclusifs, en plus de nos ouvrages. Créez votre compte, réglez par Mobile Money, et votre accès s'ouvre pour la durée de votre abonnement.",
    ctas: `<a href="#inscription" class="btn btn-gold">Créer mon compte${arrow}</a><a href="#connexion" class="btn btn-ghost">Se connecter</a>`,
    stats: tarifs.length ? tarifs.map(t => [t.prix + " F", t.duree]) : null
  })}

<section class="section espace-section" id="espace-app">
  <div class="wrap">
    <div class="ea-app" id="espace" aria-live="polite" aria-busy="true">
      <p class="ea-attente">Chargement de l'espace abonnés…</p>
      <noscript><p class="ea-erreur">L'espace abonnés a besoin de JavaScript : activez-le dans votre navigateur.</p></noscript>
    </div>
  </div>
</section>

<section class="section section-cream">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Comment s'abonner</span><h2 class="h-section">Trois étapes, <em>c'est tout</em></h2></div>
      <p class="lead">Le paiement se fait comme pour nos ouvrages : par Mobile Money, avec une confirmation sur WhatsApp.</p>
    </div>
    <div class="espace-etapes">
      <div class="espace-etape reveal"><b>Créez votre compte</b><span>En une minute, avec votre adresse e-mail et votre numéro WhatsApp.</span></div>
      <div class="espace-etape reveal reveal-d1"><b>Réglez par Mobile Money</b><span>Orange Money, MTN MoMo, Wave ou Moov Money, puis envoyez-nous la référence du paiement sur WhatsApp.${tarifs.length ? "" : " Nous vous indiquons le tarif."}</span></div>
      <div class="espace-etape reveal reveal-d2"><b>Accédez aux contenus</b><span>Votre accès s'ouvre dès réception du paiement, pour toute la durée de votre abonnement.</span></div>
    </div>
  </div>
</section>

${contactCTA(prefix)}`;
  write("espace-abonnes/index.html", page({
    prefix, url, body, scripts: SCRIPTS_ESPACE,
    title: "Espace abonnés : vidéos, documents et fiches exclusifs | Les Cours Sésame et SAJ",
    description: "L'espace abonnés des Cours Sésame et SAJ : vidéos, documents et fiches exclusifs pour préparer les concours de Côte d'Ivoire. Compte en une minute, paiement par Mobile Money.",
    ld: [breadcrumb([["Accueil", SITE], ["Espace abonnés", url]])]
  }));
  urls.push(url);
}
{
  // Administration : hors du plan du site et non indexée
  const prefix = "../../";
  R.setRoot(prefix);
  const body = `<section class="hero hero-sub on-dark">
  <div class="wrap">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="${prefix}">Accueil</a><span aria-hidden="true">›</span><a href="${prefix}espace-abonnes/">Espace abonnés</a><span aria-hidden="true">›</span><span aria-current="page">Administration</span></nav>
    <span class="eyebrow">Réservé à l'administrateur</span>
    <h1 class="sub-h1">Administration de <em>l'espace abonnés</em></h1>
    <p class="lead">Activez les abonnements après paiement, relancez les abonnés sur WhatsApp et publiez les contenus exclusifs.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="ea-app" id="admin" aria-live="polite" aria-busy="true"><p class="ea-attente">Chargement…</p></div>
  </div>
</section>`;
  write("espace-abonnes/admin/index.html", page({
    prefix, url: SITE + "espace-abonnes/admin/", body, robots: "noindex, nofollow",
    scripts: [...SCRIPTS_ESPACE, "assets/js/espace-admin.js"],
    title: "Administration de l'espace abonnés | Les Cours Sésame et SAJ",
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
    eyebrow: "Informations légales",
    h1: `Mentions légales et <em>données personnelles</em>`,
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
    <p>Les commandes se passent sur WhatsApp, depuis le panier ou depuis la page d'un ouvrage. Les prix sont affichés en francs CFA. Les modalités de paiement et de livraison sont précisées dans les <a href="${prefix}#faq">questions fréquentes</a>.</p>

    <h2>Données personnelles</h2>
    <p>En dehors de l'espace abonnés, présenté plus bas, ce site ne comporte ni compte client ni formulaire enregistré sur un serveur.</p>
    <p>Votre panier est conservé uniquement dans votre navigateur, sur votre appareil, pour que vous le retrouviez à votre prochaine visite. Nous n'y avons pas accès. Pour le supprimer, videz-le ou effacez les données du site dans votre navigateur.</p>
    <p>Quand vous commandez, les informations que vous saisissez (prénom, nom, téléphone, ville, message) sont placées dans un message WhatsApp que vous envoyez vous-même. Nous ne les utilisons que pour traiter votre commande et vous livrer.</p>
    <p>Le site n'utilise ni cookies publicitaires ni outil de mesure d'audience. Les polices de caractères sont chargées depuis les serveurs de Google Fonts, et l'hébergeur GitHub enregistre l'adresse IP des visiteurs pour la sécurité de son service.</p>
    <p>Conformément à la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel, vous disposez d'un droit d'accès, de rectification, d'opposition et de suppression des données qui vous concernent. Pour l'exercer, écrivez-nous sur WhatsApp.</p>

    <h2 id="espace-abonnes">Espace abonnés</h2>
    <p>Pour utiliser l'espace abonnés, vous créez un compte avec votre prénom, votre nom, votre numéro de téléphone (WhatsApp), votre adresse e-mail et, si vous le souhaitez, le concours que vous préparez. Nous enregistrons aussi les dates et les paiements de votre abonnement.</p>
    <p>Ces informations servent uniquement à gérer votre compte et votre abonnement, et à vous contacter à son sujet sur WhatsApp. Elles ne sont ni vendues ni cédées à quiconque.</p>
    <p>Elles sont conservées par notre prestataire Supabase, sur des serveurs situés en Europe. Votre mot de passe est enregistré sous une forme chiffrée que personne, pas même nous, ne peut lire.</p>
    <p>Les vidéos et documents de l'espace affichent votre nom et votre numéro de téléphone, pour décourager leur diffusion. Ils sont réservés à votre usage personnel.</p>
    <p>Vous pouvez demander à tout moment la correction de vos informations ou la suppression de votre compte en nous écrivant sur WhatsApp. La suppression d'un compte efface les informations qui s'y rattachent.</p>

    <p class="legal-date">Mise à jour en octobre 2026.</p>
  </div>
</section>

${contactCTA(prefix)}`;
  write("mentions-legales/index.html", page({
    prefix, url, body,
    title: "Mentions légales et données personnelles | Les Cours Sésame et SAJ",
    description: "Éditeur, hébergement, propriété intellectuelle et protection des données personnelles du site des Cours Sésame et SAJ, éditeur indépendant d'ouvrages de préparation aux concours de Côte d'Ivoire.",
    ld: [breadcrumb([["Accueil", SITE], ["Mentions légales", url]])]
  }));
  urls.push(url);
}

/* ---------- Accueil ---------- */
R.setRoot("");
index = inject(index, "concours", "\n      " + CONCOURS.map((c, i) => concoursCard(c, i, "")).join("\n      ") + "\n    ");
index = inject(index, "books", catalogueHTML());
index = inject(index, "faq", faqHTML());
index = inject(index, "videos", "\n" + videosSection(VIDS, "", {
  h2: `Comprendre en <em>quelques minutes</em>`, ici: "accueil",
  lead: "Notre présentation, un ouvrage en vidéo, un article de loi expliqué en une minute et des sujets de SOG décryptés. À regarder et à partager.",
  band: espaceBand("")
}) + "\n");
// Chiffres clés écrits en dur : ils s'affichent même avant l'animation (ou sans JavaScript)
index = index.replace(/(data-count-from="ouvrages">)[^<]*(<)/g, `$1${LIVRES.length}$2`).replace(/(data-count-from="concours">)[^<]*(<)/g, `$1${CONCOURS.length}$2`);
index = inject(index, "jsonld", "\n" + [
  { "@context": "https://schema.org", "@type": "WebSite", name: "Les Cours Sésame et SAJ", url: SITE, inLanguage: "fr" },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ...VIDS.map(videoLD)
].map(jsonld).join("\n") + "\n");
write("index.html", index);

/* ---------- Plan du site ---------- */
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`);
