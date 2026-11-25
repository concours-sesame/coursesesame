/* Fichiers Word (.docx) fabriqués dans le navigateur de l'administrateur, aux couleurs de la charte des Cours Sésame
   et SAJ : en-tête avec le logo, un filet or et la matière ; pied de page « LES COURS SÉSAME ET SAJ » et pagination ;
   titre en Lora bleu nuit ; texte en Liberation Serif 12 points. Le texte suit la mise en forme des contenus du site :
   paragraphes séparés par une ligne vide, « ## » pour un titre de partie, « ### » pour un sous-titre, **gras**,
   illustration « ![légende](assets/img/blancs/fichier.png) ».

   Word.docx({ titre, sousTitre, entete, paysage, logo, sections: [{ titre, texte, nouvellePage }], image })
     -> Promise<Uint8Array>
     logo  : { octets, largeur, hauteur } (PNG), facultatif
     image : async chemin -> { octets, largeur, hauteur, ext } pour les illustrations, facultatif
   Word.zip([{ nom, octets }]) -> Uint8Array (archive sans compression, noms en UTF-8) */
(function (racine) {
  "use strict";

  const BLEU = "002C5F", OR = "EAA726";
  const EMU_CM = 360000, TWIP_CM = 567;

  /* ---------- Archive .zip sans compression ---------- */
  const TABLE_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = o => { let c = 0xffffffff; for (let i = 0; i < o.length; i++) c = TABLE_CRC[(c ^ o[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder();
  function zip(fichiers) {
    const d = new Date(), morceaux = [], centre = [];
    const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let pos = 0;
    for (const f of fichiers) {
      const octets = typeof f.octets === "string" ? enc.encode(f.octets) : f.octets;
      const nom = enc.encode(f.nom), crc = crc32(octets), n = octets.length;
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint16(10, heure, true); loc.setUint16(12, jour, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, n, true); loc.setUint32(22, n, true); loc.setUint16(26, nom.length, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(12, heure, true); cen.setUint16(14, jour, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, n, true); cen.setUint32(24, n, true); cen.setUint16(28, nom.length, true); cen.setUint32(42, pos, true);
      morceaux.push(new Uint8Array(loc.buffer), nom, octets);
      centre.push(new Uint8Array(cen.buffer), nom);
      pos += 30 + nom.length + n;
    }
    const tailleCentre = centre.reduce((t, x) => t + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentre, true); fin.setUint32(16, pos, true);
    const tout = [...morceaux, ...centre, new Uint8Array(fin.buffer)];
    const sortie = new Uint8Array(tout.reduce((t, x) => t + x.length, 0));
    let k = 0;
    for (const x of tout) { sortie.set(x, k); k += x.length; }
    return sortie;
  }

  /* ---------- Briques WordprocessingML ---------- */
  // Caractères interdits en XML retirés, puis échappement
  const x = t => String(t == null ? "" : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const police = p => `<w:rFonts w:ascii="${p}" w:hAnsi="${p}" w:cs="${p}" w:eastAsia="${p}"/>`;
  // Un passage de texte : les retours à la ligne deviennent des sauts de ligne, les espaces sont gardés
  function run(texte, rpr = "") {
    return String(texte).split("\n").map((ligne, i) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(ligne)}</w:t></w:r>`).join("");
  }
  // **gras** dans un paragraphe
  function runs(texte, rpr = "") {
    return String(texte).split(/\*\*(.+?)\*\*/s).map((morceau, i) => morceau ? run(morceau, i % 2 ? rpr + "<w:b/><w:bCs/>" : rpr) : "").join("");
  }
  const para = (contenu, ppr = "") => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${contenu}</w:p>`;
  const style = s => `<w:pStyle w:val="${s}"/>`;
  const sautDePage = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

  function dessin(rid, id, nom, cx, cy) {
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${x(nom)}"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>
<pic:nvPicPr><pic:cNvPr id="${id}" name="${x(nom)}"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  }

  const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
  const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

  const STYLES = `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${police("Liberation Serif")}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/></w:pPr><w:rPr><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr>${police("Lora")}<w:b/><w:color w:val="${BLEU}"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="8" w:color="${OR}"/></w:pBdr><w:spacing w:after="360"/><w:jc w:val="left"/></w:pPr><w:rPr><w:i/><w:color w:val="${BLEU}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="160"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${police("Lora")}<w:b/><w:color w:val="${BLEU}"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${BLEU}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr>${police("Liberation Sans")}<w:color w:val="${BLEU}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Header"/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

  // Polices de remplacement, si Lora ou Liberation manquent sur l'ordinateur qui ouvre le fichier
  const POLICES = `${XML}<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:font w:name="Liberation Serif"><w:altName w:val="Times New Roman"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="Liberation Sans"><w:altName w:val="Arial"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="Lora"><w:altName w:val="Georgia"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>
</w:fonts>`;

  const REGLAGES = `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const ILLUSTRATION = /^!\[([^\]]*)\]\((assets\/img\/blancs\/[a-z0-9-]+\.(?:jpg|jpeg|png))\)$/;

  async function docx(o) {
    const paysage = !!o.paysage;
    const pageL = paysage ? 16838 : 11906, pageH = paysage ? 11906 : 16838, marge = 2 * TWIP_CM;
    const largeurUtile = pageL - 2 * marge;
    const medias = [], rels = [];
    let numero = 10;
    const ajouterMedia = (octets, ext) => {
      const n = medias.length + 1, rid = `rIdImg${n}`, nom = `image${n}.${ext === "jpg" ? "jpeg" : ext}`;
      medias.push({ nom, octets });
      rels.push({ rid, nom });
      return rid;
    };

    // Corps : titre, sous-titre (filet or), puis chaque section
    const corps = [];
    corps.push(para(runs(o.titre || "Document"), style("Title")));
    if (o.sousTitre) corps.push(para(runs(o.sousTitre), style("Subtitle")));
    for (const [i, s] of (o.sections || []).entries()) {
      if (s.nouvellePage && i) corps.push(sautDePage);
      if (s.titre) corps.push(para(runs(s.titre), style("Heading1")));
      const blocs = String(s.texte || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      for (const b of blocs) {
        const img = b.match(ILLUSTRATION);
        if (img) {
          let im = null;
          try { im = o.image ? await o.image(img[2]) : null; } catch (e) { im = null; }
          if (im && im.octets && im.largeur && im.hauteur) {
            const maxL = Math.min(largeurUtile / TWIP_CM, 16) * EMU_CM;
            const cx = Math.round(Math.min(maxL, im.largeur * 9525)), cy = Math.round(cx * im.hauteur / im.largeur);
            const rid = ajouterMedia(im.octets, im.ext || "png");
            corps.push(para(`<w:r>${dessin(rid, ++numero, img[1] || "Illustration", cx, cy)}</w:r>`, `<w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/>`));
          }
          if (img[1]) corps.push(para(runs(img[1]), style("Caption")));
          continue;
        }
        if (/^###\s/.test(b)) corps.push(para(runs(b.replace(/^###\s+/, "")), style("Heading3")));
        else if (/^##\s/.test(b)) corps.push(para(runs(b.replace(/^##\s+/, "")), style("Heading2")));
        else corps.push(para(runs(b)));
      }
    }

    // En-tête : logo à gauche, filet or au centre, matière à droite (tableau sans bordures)
    let ridLogo = "";
    if (o.logo && o.logo.octets) ridLogo = ajouterMedia(o.logo.octets, "png");
    const hLogo = Math.round(1.3 * EMU_CM), lLogo = o.logo ? Math.round(hLogo * o.logo.largeur / o.logo.hauteur) : 0;
    const colLogo = Math.ceil(lLogo / EMU_CM * TWIP_CM) + 200, colTexte = paysage ? 4600 : 3400;
    const colFilet = largeurUtile - colLogo - colTexte;
    const cellule = (largeur, contenu) => `<w:tc><w:tcPr><w:tcW w:w="${largeur}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${contenu}</w:tc>`;
    const entete = `${XML}<w:hdr ${NS}><w:tbl><w:tblPr><w:tblW w:w="${largeurUtile}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr>
<w:tblGrid><w:gridCol w:w="${colLogo}"/><w:gridCol w:w="${colFilet}"/><w:gridCol w:w="${colTexte}"/></w:tblGrid><w:tr>
${cellule(colLogo, para(ridLogo ? `<w:r>${dessin(ridLogo, 1, "Logo Les Cours Sésame et SAJ", lLogo, hLogo)}</w:r>` : run("LES COURS SÉSAME ET SAJ"), style("Header")))}
${cellule(colFilet, para("", `${style("Header")}<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${OR}"/></w:pBdr><w:ind w:left="120" w:right="200"/>`))}
${cellule(colTexte, para(runs(o.entete || "Savoirs · Méthode · Réussite"), `${style("Header")}<w:jc w:val="right"/>`))}
</w:tr></w:tbl>${para("", `${style("Header")}<w:spacing w:after="120"/>`)}</w:hdr>`;

    // Pied de page : la mention à gauche, la pagination à droite
    const pied = `${XML}<w:ftr ${NS}>${para(`${run("LES COURS SÉSAME ET SAJ")}<w:r><w:tab/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`,
      `${style("Footer")}<w:pBdr><w:top w:val="single" w:sz="6" w:space="6" w:color="${OR}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${largeurUtile}"/></w:tabs>`)}</w:ftr>`;

    const sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rIdEntete"/><w:footerReference w:type="default" r:id="rIdPied"/>
<w:pgSz w:w="${pageL}" w:h="${pageH}"${paysage ? ` w:orient="landscape"` : ""}/><w:pgMar w:top="${marge}" w:right="${marge}" w:bottom="${marge}" w:left="${marge}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const document = `${XML}<w:document ${NS}><w:body>${corps.join("")}${sectPr}</w:body></w:document>`;

    const relsImages = r => r.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.nom}"/>`).join("");
    const relsEntete = rels.filter(m => m.rid === ridLogo);
    const relsCorps = rels.filter(m => m.rid !== ridLogo);
    const R = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
    const maintenant = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    return zip([
      { nom: "[Content_Types].xml", octets: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { nom: "_rels/.rels", octets: `${XML}${R}<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { nom: "docProps/core.xml", octets: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(o.titre || "")}</dc:title><dc:creator>Les Cours Sésame et SAJ</dc:creator><dc:language>fr-FR</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${maintenant}</dcterms:created></cp:coreProperties>` },
      { nom: "word/document.xml", octets: document },
      { nom: "word/styles.xml", octets: STYLES },
      { nom: "word/settings.xml", octets: REGLAGES },
      { nom: "word/fontTable.xml", octets: POLICES },
      { nom: "word/header1.xml", octets: entete },
      { nom: "word/footer1.xml", octets: pied },
      { nom: "word/_rels/document.xml.rels", octets: `${XML}${R}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdReglages" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdPolices" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rIdEntete" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdPied" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${relsImages(relsCorps)}</Relationships>` },
      { nom: "word/_rels/header1.xml.rels", octets: `${XML}${R}${relsImages(relsEntete)}</Relationships>` },
      ...medias.map(m => ({ nom: `word/media/${m.nom}`, octets: m.octets }))
    ]);
  }

  const Word = { docx, zip, TYPE: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (typeof module === "object" && module.exports) module.exports = Word;
  else racine.Word = Word;
})(typeof window !== "undefined" ? window : globalThis);
