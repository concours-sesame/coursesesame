// Impression des fiches HTML en PDF A4, avec pied de page (nom, fiche, pagination).
// Usage : node tools/fiches/pdf.js <dossier> [numéros séparés par des virgules] [échelle] ; lit <dossier>/NN.html,
// écrit <dossier>/NN.pdf. L'échelle (0,96 par exemple) resserre une fiche dont la dernière page serait presque vide.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = path.resolve(process.argv[2] || '.'), navigateur = await chromium.launch();
  const page = await navigateur.newPage();
  const choix = process.argv[3] ? process.argv[3].split(',').map(Number) : null, echelle = Number(process.argv[4] || 1);
  for (const f of fs.readdirSync(dir).filter(x => /^\d+\.html$/.test(x) && (!choix || choix.includes(parseInt(x, 10)))).sort()) {
    await page.goto('file://' + path.join(dir, f));
    await page.evaluate(() => document.fonts.ready);
    const num = parseInt(f, 10);
    await page.pdf({
      path: path.join(dir, f.replace('.html', '.pdf')), format: 'A4', scale: echelle, printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font:7.5pt Helvetica,Arial,sans-serif;color:#566074;padding:0 17mm;display:flex;justify-content:space-between"><span>Les Cours Sésame et SAJ · coursesesame.com</span><span>Fiche n° ${num} · page <span class="pageNumber"></span> sur <span class="totalPages"></span></span></div>`,
      margin: { top: '16mm', bottom: '18mm', left: '17mm', right: '17mm' },
    });
    console.log(f);
  }
  await navigateur.close();
})();
