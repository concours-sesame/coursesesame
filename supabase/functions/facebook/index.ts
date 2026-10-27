// Fonction « facebook » : publie sur la page Facebook « LES Cours Sesame et Saj » (posts gratuits) et en lit les
// statistiques. Elle n'est appelable que par la base (en-tête x-import, même clé du coffre que import-texte, vérifiée
// par textes_verifier_import). La clé de la page (FB_PAGE_TOKEN, clé permanente de type « Page ») est un secret des
// fonctions : elle ne va jamais dans le site ni dans le dépôt.
// Requêtes : POST { action, ... }
//   verifier                                  : type, expiration et autorisations de la clé, nom et abonnés de la page
//   publier { message, lien?, image?, programme? } : publie tout de suite, ou à la date ISO « programme »
//                                               (entre 10 minutes et 30 jours plus tard) ; « image » = adresse https
//                                               publique d'une image, le lien va alors dans le texte
//   essai                                     : crée une publication non publiée (invisible) puis la supprime
//   programmes                                : publications programmées
//   statistiques { nombre? }                  : dernières publications avec réactions, commentaires et partages
//   supprimer { id }                          : supprime une publication de la page
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const GRAPH = "https://graph.facebook.com/v26.0";
const PAGE = Deno.env.get("FB_PAGE_ID") ?? "1075997775588079";

function cleJson(nom: string, ancien: string): string {
  try {
    const cles = JSON.parse(Deno.env.get(nom) ?? "{}");
    if (cles.default) return cles.default;
  } catch {
    // ancienne forme seulement
  }
  return Deno.env.get(ancien) ?? "";
}
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json" } });

// Clé de la page, débarrassée de ce qu'un copier-coller depuis l'Explorateur de l'API Graph peut y ajouter (guillemets,
// virgule, ligne suivante)
const JETON = (Deno.env.get("FB_PAGE_TOKEN") ?? "").trim().replace(/^"/, "").split(/["\s,]/)[0];
// Facebook recopie la clé dans certains messages d'erreur : elle est masquée avant toute réponse
const masquer = (x: unknown) => JSON.parse(JSON.stringify(x ?? {}).split(JETON || "\u0000").join("[clé masquée]"));

async function graph(chemin: string, methode = "GET", params: Record<string, string> = {}) {
  const corps = new URLSearchParams({ ...params, access_token: JETON });
  const rep = methode === "GET"
    ? await fetch(`${GRAPH}/${chemin}${chemin.includes("?") ? "&" : "?"}${corps}`)
    : await fetch(`${GRAPH}/${chemin}`, { method: methode, body: corps });
  const donnees = masquer(await rep.json().catch(() => ({})));
  // La clé n'est jamais renvoyée : seules les données de Facebook (ou son message d'erreur, clé masquée) le sont
  return { ok: rep.ok, statut: rep.status, donnees };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleJson("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: valide } = await service.rpc("textes_verifier_import", { p_cle: req.headers.get("x-import") ?? "" });
  if (valide !== true) return json({ error: "Accès refusé" }, 403);
  if (!JETON) return json({ error: "Secret FB_PAGE_TOKEN absent" }, 500);

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const action = String(d.action ?? "");

  if (action === "verifier") {
    const debug = await graph(`debug_token?input_token=${encodeURIComponent(JETON)}`);
    const info = (debug.donnees as { data?: Record<string, unknown> }).data ?? {};
    const page = await graph(`${PAGE}?fields=name,link,fan_count,followers_count`);
    return json({
      cle: { type: info.type, valide: info.is_valid, expire: info.expires_at, acces_donnees_expire: info.data_access_expires_at,
        autorisations: info.scopes, page_id: info.profile_id, erreur: info.error ?? (debug.ok ? undefined : debug.donnees) },
      page: page.donnees,
    });
  }

  if (action === "publier") {
    const message = String(d.message ?? "").trim();
    if (!message) return json({ error: "Message vide" }, 400);
    const params: Record<string, string> = {};
    if (d.programme) {
      const t = Math.floor(new Date(String(d.programme)).getTime() / 1000);
      const maintenant = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(t) || t < maintenant + 600 || t > maintenant + 30 * 86400) {
        return json({ error: "La date doit être comprise entre 10 minutes et 30 jours à partir de maintenant" }, 400);
      }
      params.published = "false";
      params.scheduled_publish_time = String(t);
    }
    let r;
    if (d.image) {
      const image = String(d.image);
      if (!image.startsWith("https://")) return json({ error: "Image : adresse https attendue" }, 400);
      r = await graph(`${PAGE}/photos`, "POST", { ...params, url: image, caption: d.lien ? `${message}\n\n${d.lien}` : message });
    } else {
      r = await graph(`${PAGE}/feed`, "POST", { ...params, message, ...(d.lien ? { link: String(d.lien) } : {}) });
    }
    return json(r.donnees, r.ok ? 200 : 502);
  }

  if (action === "essai") {
    const r = await graph(`${PAGE}/feed`, "POST", { message: "Essai de connexion (publication non publiée)", published: "false" });
    if (!r.ok) return json({ etape: "creation", ...r.donnees as object }, 502);
    const id = String((r.donnees as { id?: string }).id ?? "");
    const s = await graph(id, "DELETE");
    return json({ creation: "ok", id, suppression: s.ok ? "ok" : s.donnees });
  }

  if (action === "programmes") {
    const r = await graph(`${PAGE}/scheduled_posts?fields=id,message,scheduled_publish_time,full_picture`);
    return json(r.donnees, r.ok ? 200 : 502);
  }

  if (action === "statistiques") {
    const nombre = Math.min(Math.max(Number(d.nombre ?? 10), 1), 50);
    const r = await graph(`${PAGE}/published_posts?fields=id,message,created_time,permalink_url,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)&limit=${nombre}`);
    return json(r.donnees, r.ok ? 200 : 502);
  }

  if (action === "supprimer") {
    const id = String(d.id ?? "");
    if (!id.startsWith(`${PAGE}_`)) return json({ error: "Identifiant de publication de la page attendu" }, 400);
    const r = await graph(id, "DELETE");
    return json(r.donnees, r.ok ? 200 : 502);
  }

  return json({ error: "Action inconnue" }, 400);
});
