import { chromium } from 'playwright'; import fs from 'fs'; import path from 'path';
const [,, scr, out, ...ts] = process.argv;
const D = JSON.parse(fs.readFileSync(scr)); const T = JSON.parse(fs.readFileSync(out + '/calendrier.json'));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 1280 } });
const errs=[]; p.on('pageerror', e => errs.push(String(e)));
await p.goto('file://' + path.resolve('rendu.html'));
await p.evaluate(([d, t]) => charge(d, t), [D, T]);
const times = ts.length ? ts.map(Number) : T.scenes.map(s => s.fin - 0.5);
for (const t of times) { await p.evaluate(t => rendu(t), t); await p.screenshot({ path: `${out}/apercu-${t.toFixed(1)}.png` }); }
console.log(times.map(t=>t.toFixed(1)).join(' '), errs);
await b.close();
