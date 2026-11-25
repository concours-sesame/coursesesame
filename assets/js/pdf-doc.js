/* Fichiers PDF fabriqués dans le navigateur de l'administrateur, avec la même présentation que les fichiers Word
   (assets/js/word.js) : en-tête avec le logo, un filet or et la matière ; pied de page « LES COURS SÉSAME ET SAJ » et
   pagination ; titre en Lora bleu nuit ; texte en Liberation Serif 12 points, justifié. Même mise en forme du texte :
   paragraphes séparés par une ligne vide, « ## » et « ### » pour les titres, **gras**, illustrations.

   PdfDoc.pdf(o, { racine }) -> Promise<Uint8Array>, avec le même objet o que Word.docx.
   pdf-lib, fontkit et les polices (assets/vendor/) ne sont chargés qu'à la première demande. */
(function (racine) {
  "use strict";

  const CM = 28.3465;
  const ILLUSTRATION = /^!\[([^\]]*)\]\((assets\/img\/blancs\/[a-z0-9-]+\.(?:jpg|jpeg|png))\)$/;
  const POLICES = { r: "LiberationSerif-Regular.ttf", b: "LiberationSerif-Bold.ttf", i: "LiberationSerif-Italic.ttf", sans: "LiberationSans-Regular.ttf", lora: "Lora-Bold.ttf" };

  /* ---------- Chargement des outils, une seule fois ---------- */
  let enCache = null;
  const charger = src => new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error("Chargement impossible : " + src));
    document.head.appendChild(s);
  });
  function outils(opt) {
    if (opt && opt.PDFLib) return Promise.resolve(opt);
    if (!enCache) enCache = (async () => {
      const base = (opt && opt.racine) || "";
      if (!racine.PDFLib) await charger(base + "assets/vendor/pdf-lib-1.17.1/pdf-lib.min.js");
      if (!racine.fontkit) await charger(base + "assets/vendor/fontkit-1.1.1/fontkit.umd.min.js");
      const lire = async n => {
        const r = await fetch(base + "assets/vendor/polices-pdf/" + n);
        if (!r.ok) throw new Error("Police introuvable : " + n);
        return new Uint8Array(await r.arrayBuffer());
      };
      const cles = Object.keys(POLICES), octets = await Promise.all(cles.map(k => lire(POLICES[k])));
      return { PDFLib: racine.PDFLib, fontkit: racine.fontkit, polices: Object.fromEntries(cles.map((k, i) => [k, octets[i]])) };
    })().catch(e => { enCache = null; throw e; });
    return enCache;
  }

  // Caractères de contrôle retirés ; espace fine insécable ramenée à l'espace insécable, présente dans les polices
  const propre = t => String(t == null ? "" : t).replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/ /g, " ")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​﻿]/g, "");

  // Texte -> lignes forcées (retours à la ligne) -> mots -> morceaux de même police (**gras**)
  function decouper(texte, fN, fB) {
    const lignes = [[]];
    let mot = null;
    const fermer = () => { if (mot) { lignes[lignes.length - 1].push(mot); mot = null; } };
    propre(texte).split(/\*\*(.+?)\*\*/s).forEach((seg, k) => {
      const f = k % 2 ? fB : fN;
      for (const ch of seg) {
        if (ch === "\n") { fermer(); lignes.push([]); continue; }
        if (ch === " ") { fermer(); continue; }
        if (!mot) mot = [];
        const der = mot[mot.length - 1];
        if (der && der.f === f) der.t += ch; else mot.push({ t: ch, f });
      }
    });
    fermer();
    return lignes;
  }

  async function pdf(o, opt) {
    const { PDFLib, fontkit, polices } = await outils(opt || {});
    const { PDFDocument, rgb } = PDFLib;
    const BLEU = rgb(0, 0x2c / 255, 0x5f / 255), OR = rgb(0xea / 255, 0xa7 / 255, 0x26 / 255), NOIR = rgb(0, 0, 0);

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setTitle(propre(o.titre || "Document").replace(/\*\*/g, ""));
    doc.setAuthor("Les Cours Sésame et SAJ");
    doc.setCreator("Les Cours Sésame et SAJ");
    doc.setLanguage("fr-FR");
    const F = {};
    for (const k of Object.keys(POLICES)) F[k] = await doc.embedFont(polices[k], { subset: true });

    const [W, H] = o.paysage ? [841.89, 595.28] : [595.28, 841.89];
    const M = 2 * CM, largeur = W - 2 * M;
    const HAUT = H - 2.8 * CM, BAS = 2 * CM;

    // En-tête et pied de page de chaque page
    let logo = null;
    if (o.logo && o.logo.octets) { try { logo = await doc.embedPng(o.logo.octets); } catch (e) { logo = null; } }
    const lignesEntete = (() => {
      const t = propre(o.entete || "Savoirs · Méthode · Réussite").replace(/\*\*/g, ""), max = (o.paysage ? 8.1 : 6) * CM, mots = t.split(/ +/), L = [];
      let cur = "";
      for (const m of mots) { const essai = cur ? cur + " " + m : m; if (cur && F.sans.widthOfTextAtSize(essai, 9) > max) { L.push(cur); cur = m; } else cur = essai; }
      if (cur) L.push(cur);
      return L.slice(0, 3);
    })();
    let page = null, y = 0, numero = 0;
    function nouvellePage() {
      page = doc.addPage([W, H]);
      numero++;
      const hLogo = 1.3 * CM, haut = H - 1 * CM, centre = haut - hLogo / 2;
      let xFilet = M;
      if (logo) {
        const l = hLogo * logo.width / logo.height;
        page.drawImage(logo, { x: M, y: haut - hLogo, width: l, height: hLogo });
        xFilet = M + l + 0.35 * CM;
      }
      const lt = Math.max(...lignesEntete.map(t => F.sans.widthOfTextAtSize(t, 9)));
      lignesEntete.forEach((t, k) => {
        const yl = centre + (lignesEntete.length - 1) * 5.5 - k * 11 - 3;
        page.drawText(t, { x: W - M - F.sans.widthOfTextAtSize(t, 9), y: yl, size: 9, font: F.sans, color: BLEU });
      });
      const finFilet = W - M - lt - 0.35 * CM;
      if (finFilet > xFilet) page.drawLine({ start: { x: xFilet, y: centre }, end: { x: finFilet, y: centre }, thickness: 1.5, color: OR });
      const yPied = 1.1 * CM;
      page.drawLine({ start: { x: M, y: yPied + 13 }, end: { x: W - M, y: yPied + 13 }, thickness: 0.75, color: OR });
      page.drawText("LES COURS SÉSAME ET SAJ", { x: M, y: yPied, size: 9, font: F.sans, color: BLEU });
      const n = String(numero);
      page.drawText(n, { x: W - M - F.sans.widthOfTextAtSize(n, 9), y: yPied, size: 9, font: F.sans, color: BLEU });
      y = HAUT;
    }

    // Mise en lignes d'un paragraphe
    function mettreEnLignes(texte, s) {
      const esp = s.fN.widthOfTextAtSize(" ", s.taille), sortie = [];
      const larg = mot => mot.reduce((t, p) => t + p.f.widthOfTextAtSize(p.t, s.taille), 0);
      for (const ligne of decouper(texte, s.fN, s.fB)) {
        let cur = [], lc = 0;
        for (const mot of ligne) {
          const lm = larg(mot);
          if (cur.length && lc + esp + lm > s.largeur) { sortie.push({ mots: cur, l: lc, fin: false }); cur = []; lc = 0; }
          lc += (cur.length ? esp : 0) + lm;
          cur.push({ mot, lm });
        }
        sortie.push({ mots: cur, l: lc, fin: true });
      }
      return sortie;
    }
    function dessinerLigne(li, s) {
      const esp = s.fN.widthOfTextAtSize(" ", s.taille);
      let x = s.x, ecart = esp;
      if (s.align === "center") x += (s.largeur - li.l) / 2;
      else if (s.align === "justify" && !li.fin && li.mots.length > 1) ecart = esp + (s.largeur - li.l) / (li.mots.length - 1);
      for (const { mot, lm } of li.mots) {
        let xm = x;
        for (const p of mot) { page.drawText(p.t, { x: xm, y, size: s.taille, font: p.f, color: s.couleur }); xm += p.f.widthOfTextAtSize(p.t, s.taille); }
        x += lm + ecart;
      }
    }
    // Un bloc de texte ; garder : hauteur à réserver en plus pour ne pas laisser un titre seul en bas de page
    function bloc(texte, s, garder = 0) {
      s = Object.assign({ x: M, largeur, align: "justify", couleur: NOIR, taille: 12, interligne: 16, avant: 0, apres: 6, fN: F.r, fB: F.b }, s);
      const lignes = mettreEnLignes(texte, s);
      if (y !== HAUT) y -= s.avant;
      if (garder && y - s.interligne * lignes.length - garder < BAS) nouvellePage();
      for (const li of lignes) {
        if (y - s.interligne < BAS) nouvellePage();
        y -= s.interligne;
        dessinerLigne(li, s);
      }
      y -= s.apres;
    }
    const filetOr = () => { page.drawLine({ start: { x: M, y }, end: { x: M + largeur, y }, thickness: 1.5, color: OR }); };

    nouvellePage();
    bloc(o.titre || "Document", { fN: F.lora, fB: F.lora, taille: 20, interligne: 25, couleur: BLEU, align: "left", apres: 3 });
    if (o.sousTitre) {
      bloc(o.sousTitre, { fN: F.i, fB: F.b, couleur: BLEU, align: "left", apres: 0 });
      y -= 9; filetOr(); y -= 18;
    } else y -= 12;

    for (const [k, sec] of (o.sections || []).entries()) {
      if (sec.nouvellePage && k) nouvellePage();
      if (sec.titre) bloc(sec.titre, { fN: F.lora, fB: F.lora, taille: 15, interligne: 19, couleur: BLEU, align: "left", avant: 12, apres: 8 }, 40);
      const blocs = propre(sec.texte).split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      for (const b of blocs) {
        const img = b.match(ILLUSTRATION);
        if (img) {
          let im = null;
          try {
            const d = opt && opt.image ? await opt.image(img[2]) : o.image ? await o.image(img[2]) : null;
            if (d && d.octets) im = d.ext === "png" || /\.png$/i.test(img[2]) ? await doc.embedPng(d.octets) : await doc.embedJpg(d.octets);
          } catch (e) { im = null; }
          if (im) {
            let lw = Math.min(largeur, 16 * CM, im.width * 0.75), lh = lw * im.height / im.width;
            const hMax = HAUT - BAS - 40;
            if (lh > hMax) { lh = hMax; lw = lh * im.width / im.height; }
            if (y - 6 - lh - 30 < BAS) nouvellePage();
            y -= 6 + lh;
            page.drawImage(im, { x: M + (largeur - lw) / 2, y, width: lw, height: lh });
            y -= 4;
          }
          if (img[1]) bloc(img[1], { fN: F.i, fB: F.i, taille: 10, interligne: 13, align: "center", apres: 12 });
          continue;
        }
        if (/^###\s/.test(b)) bloc(b.replace(/^###\s+/, ""), { fN: F.b, align: "left", avant: 10, apres: 5 }, 32);
        else if (/^##\s/.test(b)) bloc(b.replace(/^##\s+/, ""), { fN: F.b, taille: 13, interligne: 17, couleur: BLEU, align: "left", avant: 12, apres: 6 }, 32);
        else bloc(b, {});
      }
    }
    return doc.save();
  }

  const PdfDoc = { pdf, TYPE: "application/pdf" };
  if (typeof module === "object" && module.exports) module.exports = PdfDoc;
  else racine.PdfDoc = PdfDoc;
})(typeof window !== "undefined" ? window : globalThis);
