// Fonction « telechargement » : quelques pages d'un PDF de l'espace abonnés, avec le filigrane de l'abonné
// (nom, téléphone, e-mail, date et heure) imprimé sur chaque page. Le fichier d'origine ne quitte jamais le serveur.
// Limites, sur 7 jours glissants : 5 % du total des pages des PDF publiés, et 15 pages d'un même document
// (fonction reserver_telechargement, sous verrou).
//
// Déploiement : sans vérification de jeton par la plateforme. La fonction vérifie elle-même la session de l'appelant,
// son appareil et son droit de lire le fichier (fichier_autorise, avec son propre jeton : abonnement en cours,
// suspension, formule d'un mois et plus pour les ouvrages complets, date de mise en ligne).
// Requête : POST { "contenu": 12, "pages": "3-7, 12" }. Réponse : le PDF, ou { "error": "message" }.
import { createClient } from "npm:@supabase/supabase-js@2.117.0";
import { degrees, PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition, x-pages",
};
const PAR_DEMANDE = 15;

function cleJson(nom: string, ancien: string): string {
  try {
    const cles = JSON.parse(Deno.env.get(nom) ?? "{}");
    if (cles.default) return cles.default;
  } catch {
    // ancienne forme seulement
  }
  return Deno.env.get(ancien) ?? "";
}
const cleSecrete = () => cleJson("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const clePublique = () => cleJson("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const erreur = (message: string, statut = 400) =>
  new Response(JSON.stringify({ error: message }), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });

// « 3-7, 12 » donne [3, 4, 5, 6, 7, 12] (pages distinctes, dans l'ordre)
function lirePages(texte: string, total: number): number[] {
  const pages = new Set<number>();
  for (const morceau of texte.split(/[,;\s]+/).filter(Boolean)) {
    const m = morceau.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
    if (!m) throw new Error(`« ${morceau} » n'est pas une page ni un intervalle (exemple 3-7, 12).`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b > total) throw new Error(`Pages ${morceau} hors du document, qui compte ${total} pages.`);
    if (b - a + 1 > PAR_DEMANDE) throw new Error(`${PAR_DEMANDE} pages au plus par téléchargement.`);
    for (let n = a; n <= b; n++) pages.add(n);
  }
  if (!pages.size) throw new Error("Indiquez au moins une page.");
  if (pages.size > PAR_DEMANDE) throw new Error(`${PAR_DEMANDE} pages au plus par téléchargement.`);
  return [...pages].sort((x, y) => x - y);
}

// Les polices standard du PDF ne connaissent que l'alphabet latin courant : les autres caractères sont simplifiés
const latin = (t: string) =>
  t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/[^\x20-\x7e\u00a0-\u00ff]/g, (c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?"));
const nomFichier = (t: string) => t.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });

  // L'appelant : session valide, puis droits vus par la base avec son propre jeton
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: appelant, error: errAppelant } = await service.auth.getUser(jeton);
  if (errAppelant || !appelant?.user) return erreur("Connexion requise.", 401);
  const uid = appelant.user.id;
  const lui = createClient(url, clePublique(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return erreur("Requête invalide");
  }
  const contenuId = Number(d.contenu);
  if (!Number.isInteger(contenuId) || contenuId < 1) return erreur("Document introuvable.", 404);
  const { data: c } = await service.from("contenus").select("id, titre, type, fichier").eq("id", contenuId).maybeSingle();
  if (!c || c.type !== "pdf" || !c.fichier) return erreur("Seuls les documents PDF se téléchargent.", 404);

  const [admin, appareil, droit] = await Promise.all([
    lui.rpc("est_admin"), lui.rpc("verifier_appareil"), lui.rpc("fichier_autorise", { chemin: c.fichier }),
  ]);
  if (admin.data !== true && appareil.data === false) return erreur("Votre compte est ouvert sur un autre appareil. Reconnectez-vous.", 403);
  if (droit.data !== true) return erreur("Ce document n'est pas compris dans votre abonnement en cours.", 403);

  const [{ data: profil }, { data: fichier, error: errFichier }] = await Promise.all([
    service.from("profils").select("prenom, nom, telephone").eq("id", uid).maybeSingle(),
    service.storage.from("exclusif").download(c.fichier),
  ]);
  if (errFichier || !fichier) return erreur("Document momentanément indisponible.", 503);

  let source: PDFDocument, pages: number[];
  try {
    source = await PDFDocument.load(await fichier.arrayBuffer(), { ignoreEncryption: true });
    pages = lirePages(String(d.pages ?? ""), source.getPageCount());
  } catch (e) {
    return erreur(e instanceof Error && /page|intervalle/.test(e.message) ? e.message : "Document illisible.");
  }

  // Réservation : refusée si elle dépasse une limite (le message de la base est montré tel quel)
  const { data: reservation, error: errReservation } = await service.rpc("reserver_telechargement", {
    p_user: uid, p_contenu: c.id, p_titre: c.titre, p_pages: pages,
  });
  if (errReservation || !reservation) return erreur(errReservation?.message || "Téléchargement impossible.", 429);

  try {
    const quand = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const signature = latin(`${profil?.prenom ?? ""} ${profil?.nom ?? ""} · ${profil?.telephone ?? ""} · ${appelant.user.email ?? ""} · ${quand}`);
    const mention = latin(`Réservé à ${profil?.prenom ?? ""} ${profil?.nom ?? ""} · Les Cours Sésame et SAJ · Reproduction et diffusion interdites`);
    const cible = await PDFDocument.create();
    const police = await cible.embedFont(StandardFonts.HelveticaBold);
    const copies = await cible.copyPages(source, pages.map((n) => n - 1));
    for (const page of copies) {
      cible.addPage(page);
      const { width, height } = page.getSize();
      const taille = Math.max(8, Math.min(width, height) / 50);
      const largeur = police.widthOfTextAtSize(signature, taille);
      // Signature répétée en diagonale sur toute la page, comme à l'écran
      for (let y = -height; y < height * 1.5; y += taille * 7) {
        for (let x = -width; x < width * 1.5; x += largeur + taille * 6) {
          page.drawText(signature, { x, y, size: taille, font: police, color: rgb(0.06, 0.16, 0.36), opacity: 0.12, rotate: degrees(24) });
        }
      }
      page.drawText(mention, { x: 18, y: 10, size: Math.max(6, taille * 0.8), font: police, color: rgb(0.06, 0.16, 0.36), opacity: 0.6 });
    }
    cible.setTitle(`${c.titre} (pages ${pages.join(", ")})`);
    cible.setAuthor(latin(`${profil?.prenom ?? ""} ${profil?.nom ?? ""}`));
    cible.setProducer("Les Cours Sésame et SAJ");
    const octets = await cible.save();
    const nom = `${nomFichier(c.titre)} (p. ${String(d.pages).replace(/\s+/g, "").replace(/,/g, ", ")}).pdf`;
    return new Response(octets, {
      headers: {
        ...CORS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nom)}`,
        "X-Pages": String(pages.length),
      },
    });
  } catch {
    // Échec de fabrication : la réservation est annulée, les pages ne sont pas décomptées
    await service.from("telechargements").delete().eq("id", reservation);
    return erreur("Le fichier n'a pas pu être préparé. Réessayez.", 500);
  }
});
