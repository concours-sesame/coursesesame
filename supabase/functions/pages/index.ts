// Fonction « pages » : seule porte d'accès des abonnés aux documents PDF. Le fichier d'origine ne leur est jamais
// envoyé : chaque page est signée à leur nom (nom, téléphone, e-mail, date et heure) puis transformée en image.
//   { action: "info", contenu }                 nombre de pages, pages lues aujourd'hui et plafond
//   { action: "lire", contenu, page, echelle }  une page en PNG, comptée dans le plafond de lecture (300 par jour)
//   { action: "reserver", contenu, pages }      réserve des pages à télécharger (20 pages sur 30 jours, 5 par document)
//   { action: "telecharger", reservation, page } une page réservée, en PDF image (30 minutes après la réservation)
//
// Déploiement : sans vérification de jeton par la plateforme. La fonction vérifie elle-même la session de l'appelant,
// son appareil et son droit de lire le document (fichier_autorise, avec son propre jeton : abonnement en cours,
// suspension, formule d'un mois et plus pour les ouvrages complets, date de mise en ligne).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.0";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { latin, morceau, PAGES_PAR_MORCEAU, pagePdf, pagePng } from "./rendu.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-restantes, x-points",
};
const PAR_DEMANDE = 15;
const RESERVATION_MINUTES = 30;

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
const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
const erreur = (message: string, statut = 400) => json({ error: message }, statut);
class Refus extends Error {
  constructor(message: string, readonly statut = 400) {
    super(message);
  }
}

// « 3-7, 12 » donne [3, 4, 5, 6, 7, 12] (pages distinctes, dans l'ordre)
function lirePages(texte: string, total: number): number[] {
  const pages = new Set<number>();
  for (const bout of texte.split(/[,;\s]+/).filter(Boolean)) {
    const m = bout.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
    if (!m) throw new Refus(`« ${bout} » n'est pas une page ni un intervalle (exemple 3-7, 12).`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b > total) throw new Refus(`Pages ${bout} hors du document, qui compte ${total} pages.`);
    if (b - a + 1 > PAR_DEMANDE) throw new Refus(`${PAR_DEMANDE} pages au plus par téléchargement.`);
    for (let n = a; n <= b; n++) pages.add(n);
  }
  if (!pages.size) throw new Refus("Indiquez au moins une page.");
  if (pages.size > PAR_DEMANDE) throw new Refus(`${PAR_DEMANDE} pages au plus par téléchargement.`);
  return [...pages].sort((x, y) => x - y);
}

type Contenu = { id: number; titre: string; type: string; fichier: string | null };
const empreinte = async (t: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))).slice(0, 8), (o) => o.toString(16).padStart(2, "0")).join("");

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

  try {
    const action = String(d.action ?? "");
    if (action === "telecharger") return await telecharger(service, lui, uid, appelant.user.email ?? "", d);
    const c = await contenu(service, Number(d.contenu));
    const estAdmin = await autoriser(lui, c);
    const total = await nombrePages(service, c);
    if (action === "info") {
      const { data: lues } = await lui.rpc("mes_pages_lues");
      return json({ pages: total, lues: lues?.lues ?? 0, plafond: lues?.plafond ?? 300, admin: estAdmin });
    }
    if (action === "lire") {
      const page = Number(d.page);
      if (!Number.isInteger(page) || page < 1 || page > total) throw new Refus("Page hors du document.");
      let restantes = -1;
      if (!estAdmin) {
        const { data, error } = await service.rpc("noter_page_lue", { p_user: uid, p_contenu: c.id, p_page: page });
        if (error) throw new Refus(error.message, 429);
        restantes = Number(data);
      }
      const quand = horodatage();
      const { profil } = await identite(service, uid);
      const signature = latin(`${profil.prenom} ${profil.nom} · ${profil.telephone} · ${appelant.user.email ?? ""} · ${quand}`);
      const mention = latin(`Réservé à ${profil.prenom} ${profil.nom} · Les Cours Sésame et SAJ · Lecture en ligne, reproduction interdite`);
      const { octets, rang } = await morceauDe(service, c, page);
      const { png, points } = await pagePng(octets, rang, signature, mention, Number(d.echelle) === 3 ? 3 : 2);
      return new Response(png, {
        headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Restantes": String(restantes), "X-Points": points.join("x") },
      });
    }
    if (action === "reserver") {
      const pages = lirePages(String(d.pages ?? ""), total);
      const { data: reservation, error } = await service.rpc("reserver_telechargement", { p_user: uid, p_contenu: c.id, p_titre: c.titre, p_pages: pages });
      if (error || !reservation) throw new Refus(error?.message || "Téléchargement impossible.", 429);
      return json({ reservation, pages });
    }
    return erreur("Action inconnue.");
  } catch (e) {
    if (e instanceof Refus) return erreur(e.message, e.statut);
    console.error(e);
    return erreur("Le document n'a pas pu être préparé. Réessayez.", 500);
  }
});

const horodatage = () =>
  new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function contenu(service: SupabaseClient, id: number): Promise<Contenu> {
  if (!Number.isInteger(id) || id < 1) throw new Refus("Document introuvable.", 404);
  const { data: c } = await service.from("contenus").select("id, titre, type, fichier").eq("id", id).maybeSingle();
  if (!c || c.type !== "pdf" || !c.fichier) throw new Refus("Document introuvable.", 404);
  return c as Contenu;
}

// Droit de lire : appareil enregistré et fichier compris dans l'abonnement en cours. Renvoie vrai pour l'administrateur.
async function autoriser(lui: SupabaseClient, c: Contenu): Promise<boolean> {
  const [admin, appareil, droit] = await Promise.all([
    lui.rpc("est_admin"), lui.rpc("verifier_appareil"), lui.rpc("fichier_autorise", { chemin: c.fichier }),
  ]);
  const estAdmin = admin.data === true;
  if (!estAdmin && appareil.data === false) throw new Refus("Votre compte est ouvert sur un autre appareil. Reconnectez-vous.", 403);
  if (droit.data !== true) throw new Refus("Ce document n'est pas compris dans votre abonnement en cours.", 403);
  return estAdmin;
}

async function identite(service: SupabaseClient, uid: string) {
  const { data } = await service.from("profils").select("prenom, nom, telephone").eq("id", uid).maybeSingle();
  return { profil: { prenom: data?.prenom ?? "", nom: data?.nom ?? "", telephone: data?.telephone ?? "" } };
}

async function original(service: SupabaseClient, c: Contenu): Promise<PDFDocument> {
  const { data, error } = await service.storage.from("exclusif").download(c.fichier!);
  if (error || !data) throw new Refus("Document momentanément indisponible.", 503);
  return await PDFDocument.load(await data.arrayBuffer(), { ignoreEncryption: true });
}

// Nombre de pages, gardé en base (recalculé si le fichier du contenu a été remplacé)
async function nombrePages(service: SupabaseClient, c: Contenu): Promise<number> {
  const { data } = await service.from("documents_pages").select("fichier, nb").eq("contenu_id", c.id).maybeSingle();
  if (data && data.fichier === c.fichier) return data.nb;
  const nb = (await original(service, c)).getPageCount();
  await service.from("documents_pages").upsert({ contenu_id: c.id, fichier: c.fichier, nb, maj_le: new Date().toISOString() });
  return nb;
}

// Morceau de 20 pages contenant la page demandée, rangé dans « exclusif/pages/ » (jamais lisible par les abonnés)
async function morceauDe(service: SupabaseClient, c: Contenu, page: number) {
  const k = Math.floor((page - 1) / PAGES_PAR_MORCEAU);
  const chemin = `pages/${c.id}/${await empreinte(c.fichier!)}/${k}.pdf`;
  const rang = (page - 1) % PAGES_PAR_MORCEAU;
  const { data } = await service.storage.from("exclusif").download(chemin);
  if (data) return { octets: new Uint8Array(await data.arrayBuffer()), rang };
  const octets = await morceau(await original(service, c), k);
  await service.storage.from("exclusif").upload(chemin, octets, { contentType: "application/pdf", upsert: true });
  return { octets, rang };
}

async function telecharger(service: SupabaseClient, lui: SupabaseClient, uid: string, email: string, d: Record<string, unknown>) {
  const id = Number(d.reservation), page = Number(d.page);
  if (!Number.isInteger(id) || !Number.isInteger(page)) throw new Refus("Requête invalide");
  const { data: r } = await service.from("telechargements").select("id, user_id, contenu_id, pages, cree_le").eq("id", id).maybeSingle();
  if (!r || r.user_id !== uid || !r.contenu_id || !(r.pages as number[]).includes(page)) throw new Refus("Page non réservée.", 403);
  if (Date.now() - new Date(r.cree_le).getTime() > RESERVATION_MINUTES * 60000) throw new Refus("Réservation expirée. Recommencez le téléchargement.", 410);
  const c = await contenu(service, r.contenu_id);
  await autoriser(lui, c);
  const { profil } = await identite(service, uid);
  const signature = latin(`${profil.prenom} ${profil.nom} · ${profil.telephone} · ${email} · ${horodatage()} · réf. ${r.id}`);
  const mention = latin(`Réservé à ${profil.prenom} ${profil.nom} · Les Cours Sésame et SAJ · Reproduction et diffusion interdites`);
  const { octets, rang } = await morceauDe(service, c, page);
  const pdf = await pagePdf(octets, rang, signature, mention, 2, latin(`${c.titre}, page ${page}`));
  return new Response(pdf, { headers: { ...CORS, "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
}
