/* Fonctions d'affichage partagées entre le navigateur (app.js)
   et le générateur de pages (tools/build.js). Aucune dépendance au DOM. */
(function (scope) {
  "use strict";

  // Concours, dans l'ordre d'affichage. "slug" donne l'adresse de la page du concours.
  const CONCOURS = [
    { id: "infj", slug: "magistrature", court: "Magistrature", long: "INFJ Magistrature", nom: "concours de la Magistrature (INFJ)" },
    { id: "greffe", slug: "greffe", court: "Greffe", long: "INFJ Greffe", nom: "concours du Greffe (INFJ)" },
    { id: "penitentiaire", slug: "penitentiaire", court: "Pénitentiaire", long: "INFJ Pénitentiaire", nom: "concours de l'Administration pénitentiaire (INFJ)" },
    { id: "eppjej", slug: "eppjej", court: "EPPJEJ", long: "INFJ EPPJEJ", nom: "concours EPPJEJ, protection judiciaire de l'enfance et de la jeunesse (INFJ)" },
    { id: "ena", slug: "ena", court: "ENA", long: "École Nationale d'Administration", nom: "concours de l'École Nationale d'Administration (ENA)" }
  ];

  // Épreuves de chaque concours qui ont une fiche méthode (noms de EPREUVES)
  const EPREUVES_PAR_CONCOURS = {
    infj: ["Dissertation juridique", "Cas pratique", "Commentaire d'arrêt / d'article", "SOG (Sujet d'Ordre Général)"],
    greffe: ["SOG (Sujet d'Ordre Général)"],
    penitentiaire: ["SOG (Sujet d'Ordre Général)", "Étude de texte"],
    eppjej: ["SOG (Sujet d'Ordre Général)"],
    ena: ["SOG (Sujet d'Ordre Général)", "PECOS", "Note de synthèse"]
  };

  const parsePrice = p => parseInt(String(p).replace(/\s/g, ""), 10) || 0;
  const fmt = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const svg = (id, attrs = "") => `<svg ${attrs}><use href="#${id}"/></svg>`;
  const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const slugify = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const plural = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  // Chemin vers la racine du site depuis la page affichée ("", "../" ou "../../")
  let root = "";
  const setRoot = r => { root = r; };
  // Mention d'édition en fin de titre (« …, Édition 2027 »)
  const EDITION = /,\s+Édition \d{4}$/;
  // Adresse de la page d'un ouvrage. L'édition n'y figure pas : l'adresse reste la même d'une année à l'autre.
  const ouvrageSlug = o => slugify(o.titre.replace(EDITION, ""));
  const ouvrageURL = o => `${root}ouvrages/${ouvrageSlug(o)}/`;

  function coverParts(titre) {
    const t = titre.replace(EDITION, "").replace(/ aux? Concours (?:Administratifs|de la Magistrature)$/i, "");
    const rules = [
      [/^Le Petit Manuel (?:de |d'|des )(.+)$/i, "Le Petit Manuel"],
      [/^Le Résumé (?:de |d'|des )(.+)$/i, "Le Résumé"],
      [/^Le Concours de la Magistrature en (.+)$/i, "Magistrature"],
      [/^(\d+ Fiches de Cours) pour Réussir l'Écrit de la Magistrature$/i, "Écrit de la magistrature"],
      [/^Les Annales des Anciens Sujets Corrigés(?: de)? (.+)$/i, "Annales corrigées"],
      [/^Le Guide Méthodologique (.+)$/i, "Guide méthodologique"],
      [/^Le Sésame de (.+)$/i, "Le Sésame"],
      [/^Les Fiches d'Arrêts de (.+)$/i, "Fiches d'arrêts"],
      [/^Les (\d+ Cas Pratiques Corrigés) de la Magistrature$/i, "Magistrature"],
      [/^Le Droit Administratif en 125 Dissertations Corrigées, (Tome [IV]+)$/i, "125 dissertations · Droit administratif"],
      [/^La (Logique)$/i, "Entraînement"]
    ];
    for (const [re, serie] of rules) {
      const m = t.match(re);
      if (m) return { serie, sujet: m[1] };
    }
    return { serie: "", sujet: t };
  }

  function coverHTML(o) {
    const c = coverParts(o.titre);
    return `<div class="cover">${o.numerique ? `<span class="cover-num">Numérique</span>` : ""}
      <div class="cover-top">${svg("logo", 'class="mark" aria-hidden="true"')}<span class="cb">Les Cours<br>Sésame et SAJ<i></i></span></div>
      <div class="cover-band">${c.serie ? `<span class="cover-series">${c.serie}</span>` : ""}<span class="cover-title">${c.sujet}</span><span class="orn">${svg("i-star")}</span></div>
      <div class="cover-foot">${o.concours.replace(/^INFJ\s+/, "")}</div>
    </div>`;
  }

  function bookHTML(o, idx, inCart) {
    return `<article class="book">
      <button class="book-cover-btn" data-open="${idx}" aria-label="Voir le détail : ${attr(o.titre)}">${coverHTML(o)}</button>
      <div class="book-meta">
        <span class="book-concours">${o.concoursListe || o.concours}</span>
        <h3 class="book-title"><a href="${ouvrageURL(o)}">${o.titre}</a></h3>
        <span class="book-niveau">${o.phase ? o.phase + " · " : ""}Niveaux ${o.niveau}</span>${o.extrait ? `<span class="book-extrait">Extrait gratuit disponible</span>` : ""}${o.numerique ? `<span class="book-num">Version numérique uniquement</span>` : ""}
        <div class="book-buy">
          <span class="price">${o.prix}<small>FCFA</small></span>
          <button class="add-btn${inCart ? " in" : ""}" data-add="${idx}">${inCart ? svg("i-check") + "Ajouté" : svg("i-plus") + "Panier"}</button>
        </div>
      </div>
    </article>`;
  }

  // Total d'un ensemble d'ouvrages, avec la remise de 10 % dès 3 ouvrages
  function packTotals(items) {
    const sub = items.reduce((s, o) => s + parsePrice(o.prix), 0);
    const disc = items.length >= 3 ? Math.round(sub * 0.1) : 0;
    return { sub, disc, total: sub - disc };
  }

  // Encadré « pack » : ajoute d'un coup tous les ouvrages d'un concours (et d'une phase)
  function packHTML(cat, phase, items, all) {
    const t = packTotals(items);
    const ids = items.map(o => all.indexOf(o)).join(",");
    const label = phase ? `Pack ${phase}` : "Pack complet";
    return `<div class="pack">
      <div class="pack-text"><span class="pack-tag">${label}</span><b>${plural(items.length, "ouvrage")} en une commande</b>
      <span class="pack-price">${t.disc ? `<s>${fmt(t.sub)} FCFA</s>` : ""}<strong>${fmt(t.total)} FCFA</strong>${t.disc ? `<em>remise de 10 % incluse</em>` : ""}</span></div>
      <button class="btn btn-gold btn-sm" data-pack="${ids}">${svg("i-plus", 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"')}Ajouter le pack</button>
    </div>`;
  }

  // Ouvrages d'un concours rangés par phase, avec un pack par phase si demandé
  function groupHTML(items, all, cart, withPacks) {
    const book = o => bookHTML(o, all.indexOf(o), cart.includes(all.indexOf(o)));
    const phases = [...new Set(items.map(o => o.phase).filter(Boolean))];
    const cat = items[0] && items[0].categorie;
    if (!phases.length) {
      return (withPacks ? packHTML(cat, "", items, all) : "") + `<div class="books">${items.map(book).join("")}</div>`;
    }
    let html = phases.map(ph => {
      const sub = items.filter(o => o.phase === ph);
      return `<h4 class="phase-title">${ph}<small>${plural(sub.length, "ouvrage")}</small></h4>${withPacks ? packHTML(cat, ph, sub, all) : ""}<div class="books">${sub.map(book).join("")}</div>`;
    }).join("");
    const rest = items.filter(o => !o.phase);
    if (rest.length) html += `<div class="books">${rest.map(book).join("")}</div>`;
    return html;
  }

  scope.SESAME = { CONCOURS, EPREUVES_PAR_CONCOURS, EDITION, parsePrice, fmt, svg, attr, slugify, plural, setRoot, ouvrageSlug, ouvrageURL, coverParts, coverHTML, bookHTML, packTotals, packHTML, groupHTML };
})(typeof window !== "undefined" ? window : globalThis);
