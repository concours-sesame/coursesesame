#!/usr/bin/env node
/* Générateur des pages du site Les Cours Sésame & SAJ.

   À lancer après chaque modification de assets/js/data.js :
       node tools/build.js

   Il met à jour :
   - index.html : cartes des concours, catalogue, FAQ et données Google (entre les repères build:)
   - concours/<concours>/index.html : une page par concours
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
vm.runInContext(read("assets/js/data.js") + "\n;globalThis.D={WA,OUVRAGES,TEMOIGNAGES,FAQ,METHODO,EPREUVES,SUJETS,QCM};", ctx);
vm.runInContext(read("assets/js/render.js"), ctx);
const { WA, OUVRAGES, FAQ, METHODO, EPREUVES, SUJETS } = ctx.D;
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
    if (/^(methodes\/|concours\/|assets\/)/.test(h)) return prefix + h;
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

function productList(items, url) {
  return {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.map((o, i) => ({
      "@type": "ListItem", position: i + 1,
      item: {
        "@type": "Product", name: o.titre, description: o.desc, image: OG_IMAGE, category: "Livres",
        brand: { "@type": "Brand", name: "Les Cours Sésame et SAJ" },
        offers: { "@type": "Offer", price: String(parsePrice(o.prix)), priceCurrency: "XOF", availability: "https://schema.org/InStock", url }
      }
    }))
  };
}

/* ---------- Gabarit des pages intérieures ---------- */
function page({ prefix, title, description, url, body, ld, bodyAttrs = "" }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta name="theme-color" content="#0f2a5c">
<link rel="canonical" href="${url}">
<link rel="icon" href="${prefix}assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${prefix}assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${prefix}assets/img/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="Les Cours Sésame et SAJ">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
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
<script src="${prefix}assets/js/app.js"></script>
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

/* ---------- Pages concours ---------- */
const urls = [SITE];
for (const c of CONCOURS) {
  const prefix = "../../";
  const url = `${SITE}concours/${c.slug}/`;
  const items = byCat(c.id);
  const m = METHODO.find(x => x.concours === c.long) || METHODO.find(x => x.concours.includes(c.court));
  const epreuves = m ? m.epreuves.split(",").map(e => e.trim()) : [];
  const fiches = (EPREUVES_PAR_CONCOURS[c.id] || []).map(n => EPREUVES.find(e => e.nom === n)).filter(Boolean);
  const sujet = SUJETS.find(s => s.concours === c.court);
  const minPrix = Math.min(...items.map(o => parsePrice(o.prix)));
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

${sujet ? `<section class="section sujets" id="corrige">
  <div class="wrap">
    <div class="section-head reveal">
      <div><span class="eyebrow">Extrait de nos ouvrages</span><h2 class="h-section">Un sujet <em>corrigé</em></h2></div>
      <p class="lead">Jugez par vous-même de la qualité de nos corrections.</p>
    </div>
    ${sujetHTML(sujet)}
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
    ld: [breadcrumb([["Accueil", SITE], ["Concours " + c.court, url]]), productList(items, url + "#ouvrages")]
  }));
  urls.push(url);
}

/* ---------- Page Méthodes ---------- */
{
  const prefix = "../";
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
  const fiches = EPREUVES.map((e, i) => {
    const cs = concoursDe(e.nom);
    const books = utiles(e.nom);
    return `<article class="fiche reveal" id="${slugify(e.nom)}">
      <div class="fiche-head"><span class="fiche-num">${String(i + 1).padStart(2, "0")}</span><div><h2>${e.nom}</h2>
      ${cs.length ? `<div class="fiche-meta">Concours : ${cs.map(c => `<a href="${prefix}concours/${c.slug}/">${c.court}</a>`).join(" · ")}</div>` : ""}</div></div>
      <div class="ep-panel">${e.contenu}</div>
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
      <p class="lead">Répondez, découvrez l'explication, puis défiez vos amis sur WhatsApp. Toutes les réponses se trouvent dans les fiches ci-dessous.</p>
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
    ld: [breadcrumb([["Accueil", SITE], ["Méthodes des épreuves", url]])]
  }));
  urls.push(url);
}

/* ---------- Accueil ---------- */
index = inject(index, "concours", "\n      " + CONCOURS.map((c, i) => concoursCard(c, i, "")).join("\n      ") + "\n    ");
index = inject(index, "books", catalogueHTML());
index = inject(index, "faq", faqHTML());
index = inject(index, "jsonld", "\n" + [
  { "@context": "https://schema.org", "@type": "WebSite", name: "Les Cours Sésame et SAJ", url: SITE, inLanguage: "fr" },
  { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
].map(jsonld).join("\n") + "\n");
write("index.html", index);

/* ---------- Plan du site ---------- */
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}
</urlset>
`);
