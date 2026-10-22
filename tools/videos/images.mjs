// Enregistre les images de la vidéo : node images.mjs script.json dossier
import { chromium } from 'playwright';
import fs from 'fs'; import { spawn } from 'child_process'; import path from 'path';
const [,, scr, out] = process.argv;
const D = JSON.parse(fs.readFileSync(scr)); const T = JSON.parse(fs.readFileSync(out + '/calendrier.json'));
const exe = fs.readdirSync('/opt/pw-browsers').filter(x => x.startsWith('chromium-'))[0];
const b = await chromium.launch({ executablePath: `/opt/pw-browsers/${exe}/chrome-linux/chrome` });
const p = await b.newPage({ viewport: { width: 720, height: 1280 } });
await p.goto('file://' + path.resolve('rendu.html'));
await p.evaluate(([d, t]) => charge(d, t), [D, T]);
const FPS = 30, N = Math.ceil(T.duree * FPS);
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', out + '/voix.wav',
  '-af', 'loudnorm=I=-16:TP=-1.5,aresample=48000', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', out + '/video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
for (let i = 0; i < N; i++) {
  await p.evaluate(t => rendu(t), i / FPS);
  const img = await p.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log('image', i, '/', N);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
console.log('vidéo prête', out + '/video.mp4');
