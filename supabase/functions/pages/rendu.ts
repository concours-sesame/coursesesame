// Rendu d'une page de PDF en image, avec la signature de l'abonné imprimée dans la page avant la transformation :
// le filigrane fait partie des pixels et ne peut pas être retiré. Sortie en PNG (lecture à l'écran) ou en PDF
// d'une page ne contenant que l'image (téléchargement).
import { PDFiumLibrary } from "npm:@hyzyla/pdfium@2.1.13";
import {
  concatTransformationMatrix, degrees, drawObject, PDFDocument, PDFName, popGraphicsState, pushGraphicsState, rgb, StandardFonts,
} from "npm:pdf-lib@1.17.1";

export const PAGES_PAR_MORCEAU = 20;

// Moteur PDFium (celui de Chrome) compilé en WebAssembly, chargé une fois par instance depuis le CDN jsDelivr ;
// son empreinte SHA-256 est vérifiée avant usage
const PDFIUM_WASM = "https://cdn.jsdelivr.net/npm/@hyzyla/pdfium@2.1.13/dist/pdfium.wasm";
const PDFIUM_SHA256 = "71aec412a303a0405baee21c3d6d3f30ad2033dc02444130fe476be3976e2d09";
let bibliotheque: Promise<PDFiumLibrary> | null = null;
async function chargerPdfium(): Promise<PDFiumLibrary> {
  const rep = await fetch(PDFIUM_WASM);
  if (!rep.ok) throw new Error("Moteur de rendu indisponible");
  const wasm = new Uint8Array(await rep.arrayBuffer());
  const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", wasm)), (o) => o.toString(16).padStart(2, "0")).join("");
  if (empreinte !== PDFIUM_SHA256) throw new Error("Moteur de rendu altéré");
  return await PDFiumLibrary.init({ wasmBinary: wasm.buffer });
}
const pdfium = () => (bibliotheque ??= chargerPdfium().catch((e) => { bibliotheque = null; throw e; }));

// Les polices standard du PDF ne connaissent que l'alphabet latin courant : guillemets et tirets typographiques
// sont remplacés, les lettres d'autres alphabets perdent leurs accents ou deviennent « ? »
const REMPLACEMENTS: Record<number, string> = { 0x2018: "'", 0x2019: "'", 0x201c: '"', 0x201d: '"', 0x2013: "-", 0x2014: "-", 0x2026: "..." };
export const latin = (t: string) =>
  Array.from(t, (c) => {
    const n = c.codePointAt(0)!;
    if ((n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff)) return c;
    if (REMPLACEMENTS[n]) return REMPLACEMENTS[n];
    const base = c.normalize("NFD").charAt(0), b = base.charCodeAt(0);
    return b >= 0x20 && b <= 0x7e ? base : "?";
  }).join("");

// Morceau n° k (0, 1, 2...) d'un document : pages k * 20 + 1 à k * 20 + 20
export async function morceau(source: PDFDocument, k: number): Promise<Uint8Array> {
  const total = source.getPageCount();
  const debut = k * PAGES_PAR_MORCEAU;
  const fin = Math.min(total, debut + PAGES_PAR_MORCEAU);
  const doc = await PDFDocument.create();
  (await doc.copyPages(source, Array.from({ length: fin - debut }, (_, i) => debut + i))).forEach((p) => doc.addPage(p));
  return await doc.save();
}

// Page « rang » (0 à 19) d'un morceau, signée puis dessinée en pixels (échelle 2 : 144 points par pouce)
async function pixels(octetsMorceau: Uint8Array, rang: number, signature: string, mention: string, echelle: number) {
  const src = await PDFDocument.load(octetsMorceau, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(src, [rang]);
  doc.addPage(page);
  const police = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const taille = Math.max(8, Math.min(width, height) / 50);
  const largeur = police.widthOfTextAtSize(signature, taille);
  const encre = rgb(0.06, 0.16, 0.36);
  for (let y = -height; y < height * 1.5; y += taille * 7) {
    for (let x = -width; x < width * 1.5; x += largeur + taille * 6) {
      page.drawText(signature, { x, y, size: taille, font: police, color: encre, opacity: 0.13, rotate: degrees(24) });
    }
  }
  page.drawText(mention, { x: 18, y: 10, size: Math.max(6, taille * 0.8), font: police, color: encre, opacity: 0.65 });
  const lib = await pdfium();
  const rendu = await lib.loadDocument(await doc.save());
  try {
    const r = await rendu.getPage(0).render({ scale: echelle, render: "bitmap" });
    return { largeur: r.width, hauteur: r.height, points: [r.originalWidth, r.originalHeight] as [number, number], rgba: r.data };
  } finally {
    rendu.destroy();
  }
}

// Teintes ramenées à 32 niveaux par couleur (invisible sur du texte, fichier deux fois plus léger),
// le blanc et le noir restant purs
const NIVEAUX = Uint8Array.from({ length: 256 }, (_, v) => { const q = v >> 3; return (q << 3) | (q >> 2); });
// RVBA vers RVB, avec en tête de chaque ligne l'octet de filtre exigé par le PNG (0 : aucun)
function rgbLignes(rgba: Uint8Array, l: number, h: number, filtre: boolean): Uint8Array {
  const pas = l * 3 + (filtre ? 1 : 0);
  const sortie = new Uint8Array(pas * h);
  for (let y = 0, s = 0; y < h; y++) {
    let o = y * pas;
    if (filtre) sortie[o++] = 0;
    for (let x = 0; x < l; x++, s += 4) {
      sortie[o++] = NIVEAUX[rgba[s]];
      sortie[o++] = NIVEAUX[rgba[s + 1]];
      sortie[o++] = NIVEAUX[rgba[s + 2]];
    }
  }
  return sortie;
}
// Compression zlib (format attendu par le PNG et par le filtre FlateDecode du PDF), faite par le moteur natif
async function zlib(octets: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([octets]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(...parties: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parties) for (let i = 0; i < p.length; i++) c = TABLE_CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type: string, donnees: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const b = new Uint8Array(12 + donnees.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, donnees.length);
  b.set(t, 4);
  b.set(donnees, 8);
  v.setUint32(8 + donnees.length, crc32(t, donnees));
  return b;
}

export async function pagePng(octetsMorceau: Uint8Array, rang: number, signature: string, mention: string, echelle: number) {
  const p = await pixels(octetsMorceau, rang, signature, mention, echelle);
  const entete = new Uint8Array(13);
  const v = new DataView(entete.buffer);
  v.setUint32(0, p.largeur);
  v.setUint32(4, p.hauteur);
  entete.set([8, 2, 0, 0, 0], 8); // 8 bits, couleurs RVB, sans entrelacement
  const idat = await zlib(rgbLignes(p.rgba, p.largeur, p.hauteur, true));
  const parties = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", entete), bloc("IDAT", idat), bloc("IEND", new Uint8Array())];
  const png = new Uint8Array(parties.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of parties) { png.set(x, o); o += x.length; }
  return { png, points: p.points };
}

export async function pagePdf(octetsMorceau: Uint8Array, rang: number, signature: string, mention: string, echelle: number, titre: string) {
  const p = await pixels(octetsMorceau, rang, signature, mention, echelle);
  const doc = await PDFDocument.create();
  const [l, h] = p.points;
  const page = doc.addPage([l, h]);
  const image = doc.context.register(doc.context.stream(await zlib(rgbLignes(p.rgba, p.largeur, p.hauteur, false)), {
    Type: "XObject", Subtype: "Image", Width: p.largeur, Height: p.hauteur, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "FlateDecode",
  }));
  page.node.setXObject(PDFName.of("Im0"), image);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(l, 0, 0, h, 0, 0), drawObject("Im0"), popGraphicsState());
  doc.setTitle(titre);
  doc.setProducer("Les Cours Sésame et SAJ");
  return await doc.save();
}
