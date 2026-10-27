// Visuels Facebook 1080 x 1350 aux couleurs de Sésame, à partir du champ « visuel » de chaque publication.
// Usage : node tools/facebook/visuels.js <semaine.json> <dossier de sortie>
// Chaque publication du fichier : { n, visuel: { fond: "navy" | "cream", etiquette, titre, sous?, options? (QCM, quatre
// réponses), points? ([titre, texte]), etapes? ([titre, texte]), pied? } } ; une image <n>.png par publication avec visuel.
// Nécessite Playwright et Chromium. Les images ne vont pas dans le dépôt : elles sont déposées dans le stockage privé
// par l'action televersement de la fonction facebook.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [,, fichier, sortie] = process.argv;
const posts = JSON.parse(fs.readFileSync(fichier, 'utf8'));
const F = 'file://' + path.resolve(__dirname, '../../assets/fonts') + '/';
// Espace insécable avant les signes doubles, à la française
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/ ([?:;!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0').replace(/(\d) (?=\S)/g, '$1\u00a0');
const logo = `<svg viewBox="0 0 100 100"><g transform="translate(6 2) scale(.88)"><path fill="#e8a62b" d="M30 3C31.2 11 33 12.8 41 14 33 15.2 31.2 17 30 25 28.8 17 27 15.2 19 14 27 12.8 28.8 11 30 3Z"/><path fill="currentColor" d="M12 84V50C12 35 24 26 40 26H45V34H41C30 34 21.5 41 21.5 51V84Z"/><path fill="#e8a62b" d="M45 26 57 30V87L45 84Z"/><path fill="currentColor" d="M57 30 73 27V88L57 87Z"/><path fill="currentColor" d="M77 25H82V88H77Z"/><path fill="#e8a62b" d="M4 95C30 82 70 82 96 95 70 88.5 30 88.5 4 95Z"/></g></svg>`;
const css = `
@font-face{font-family:SSerif;src:url(${F}source-serif-4-latin-700-normal.woff2);font-weight:700}
@font-face{font-family:SSans;src:url(${F}source-sans-3-latin-400-normal.woff2);font-weight:400}
@font-face{font-family:SSans;src:url(${F}source-sans-3-latin-600-normal.woff2);font-weight:600}
@font-face{font-family:SSans;src:url(${F}source-sans-3-latin-700-normal.woff2);font-weight:700}
*{box-sizing:border-box;margin:0}
.v{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:SSans;display:flex;flex-direction:column;padding:84px 88px 0}
.navy{background:#0f2a5c;color:#fff}.cream{background:#f3f5f8;color:#0f2a5c}
.marque{display:flex;align-items:center;gap:22px}.marque svg{width:84px;height:84px}
.marque b{font-family:SSerif;font-size:34px;line-height:1.12}
.corps{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:30px 0 40px}
.etiq{font-size:34px;font-weight:700;color:#e8a62b;margin-bottom:26px}.cream .etiq{color:#8a5a00}
h1{font-family:SSerif;font-weight:700;line-height:1.1;font-size:var(--t)}
.sous{font-size:42px;line-height:1.35;margin-top:30px;font-weight:600}
.filet{width:120px;height:8px;background:#e8a62b;margin:40px 0 36px}
.opt{display:flex;gap:26px;align-items:center;border:3px solid rgba(255,255,255,.25);padding:22px 28px;margin-bottom:18px;font-size:36px;line-height:1.25}
.opt i{font-style:normal;flex:none;width:64px;height:64px;background:#e8a62b;color:#0f2a5c;font-family:SSerif;font-weight:700;font-size:38px;display:flex;align-items:center;justify-content:center}
.pt{background:#fff;border-left:12px solid #e8a62b;padding:22px 34px;margin-bottom:16px}.navy .pt{background:rgba(255,255,255,.07)}
.pt b{display:block;font-family:SSerif;font-size:38px}.pt span{display:block;font-size:32px;line-height:1.32;margin-top:6px;opacity:.9}
.et{display:flex;gap:30px;align-items:center;margin-bottom:30px}
.et i{font-style:normal;flex:none;width:86px;height:86px;background:#e8a62b;color:#0f2a5c;font-family:SSerif;font-weight:700;font-size:50px;display:flex;align-items:center;justify-content:center}
.et b{display:block;font-family:SSerif;font-size:42px;line-height:1.15}.et span{display:block;font-size:32px;margin-top:6px;opacity:.85}
.pied{height:150px;display:flex;align-items:center;justify-content:space-between;border-top:2px solid rgba(127,140,160,.35);font-size:32px;font-weight:600}
.pied span:last-child{opacity:.7}
.bas{position:absolute;left:0;right:0;bottom:0;height:22px;background:#e8a62b}`;
function html(v) {
  const L = v.titre.length, t = v.options ? (L > 60 ? 60 : 68) : L > 110 ? 56 : L > 70 ? 66 : L > 40 ? 80 : 96;
  let bloc = '';
  if (v.options) bloc = v.options.map((o, i) => `<div class="opt"><i>${'ABCD'[i]}</i><div>${esc(o)}</div></div>`).join('');
  if (v.points) bloc = v.points.map(([a, b]) => `<div class="pt"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('');
  if (v.etapes) bloc = v.etapes.map(([a, b], i) => `<div class="et"><i>${i + 1}</i><div><b>${esc(a)}</b>${b ? `<span>${esc(b)}</span>` : ''}</div></div>`).join('');
  return `<div class="v ${v.fond}"><div class="marque">${logo}<b>Les Cours<br>Sésame et SAJ</b></div>
  <div class="corps"><div class="etiq">${esc(v.etiquette)}</div><h1 style="--t:${t}px">${esc(v.titre)}</h1>${v.sous ? `<p class="sous">${esc(v.sous)}</p>` : ''}
  ${bloc ? '<div class="filet"></div>' + bloc : ''}</div>
  <div class="pied"><span>${esc(v.pied || "coursesesame.com")}</span>${/coursesesame/.test(v.pied || "coursesesame") ? "" : "<span>coursesesame.com</span>"}</div><div class="bas"></div></div>`;
}
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  for (const post of posts.filter(x => x.visuel)) {
    const v = post.visuel;
    const page = path.join(sortie, '_rendu.html');
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>${css}</style>${html(v)}`);
    await p.goto('file://' + page);
    await p.evaluate(() => document.fonts.ready);
    // Ajustement : on réduit le titre puis les blocs tant que le contenu déborde de la zone centrale
    await p.evaluate(() => {
      const c = document.querySelector('.corps'), h = document.querySelector('h1');
      const blocs = [...document.querySelectorAll('.pt span,.et span,.opt div,.sous')];
      for (let i = 0; i < 20 && c.scrollHeight > c.clientHeight + 2; i++) {
        h.style.fontSize = (parseFloat(getComputedStyle(h).fontSize) - 4) + 'px';
        if (i % 2) blocs.forEach(b => b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) - 1) + 'px');
      }
    });
    const deborde = await p.evaluate(() => { const c = document.querySelector('.corps'); return c.scrollHeight > c.clientHeight + 2; });
    await p.locator('.v').screenshot({ path: path.join(sortie, post.n + '.png') });
    console.log(post.n, deborde ? 'DEBORDE' : 'ok');
  }
  await b.close();
})();
