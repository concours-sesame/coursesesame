// Fonction « facebook » : publie sur la page Facebook « LES Cours Sesame et Saj » (posts gratuits) et en lit les
// statistiques. Elle n'est appelable que par la base (en-tête x-import, même clé du coffre que import-texte, vérifiée
// par textes_verifier_import). La clé de la page (FB_PAGE_TOKEN, clé permanente de type « Page ») est un secret des
// fonctions : elle ne va jamais dans le site ni dans le dépôt.
// Requêtes : POST { action, ... }
//   verifier                                  : type, expiration et autorisations de la clé, nom et abonnés de la page
//   televersement { nom }                     : adresse de dépôt signée (deux heures) pour l'image facebook/<nom>.png
//                                               du stockage privé exclusif (Content-Type image/png)
//   publier { message, lien?, image?, images?, video?, video_titre?, programme? } : publie tout de suite, ou à la date ISO « programme »
//                                               (entre 10 minutes et 30 jours plus tard) ; « image » = adresse https
//                                               publique d'une image ; « images » = noms d'images déposées par
//                                               televersement (carrousel, dix au plus) ; avec une image, le lien va
//                                               dans le texte ; « video » = adresse https publique d'un MP4 (vidéo
//                                               publiée directement sur la page)
//   planif                                    : publie les lignes de facebook_publications arrivées à leur heure
//                                               (appelée toutes les cinq minutes par pg_cron ; plus de trois heures de
//                                               retard : « manquee »)
//   essai { video? }                          : crée une publication (ou une vidéo) non publiée, invisible, puis la supprime
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

// Publication immédiate ou programmée chez Facebook : texte seul (avec aperçu du lien), image par adresse, ou
// carrousel d'images déposées dans le stockage privé (facebook/<nom>.png)
// deno-lint-ignore no-explicit-any
async function publier(service: any, d: Record<string, unknown>): Promise<{ statut: number; donnees: unknown }> {
  const message = String(d.message ?? "").trim();
  if (!message) return { statut: 400, donnees: { error: "Message vide" } };
  const params: Record<string, string> = {};
  if (d.programme) {
    const t = Math.floor(new Date(String(d.programme)).getTime() / 1000);
    const maintenant = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(t) || t < maintenant + 600 || t > maintenant + 30 * 86400) {
      return { statut: 400, donnees: { error: "La date doit être comprise entre 10 minutes et 30 jours à partir de maintenant" } };
    }
    params.published = "false";
    params.scheduled_publish_time = String(t);
  }
  const images = Array.isArray(d.images) ? d.images.map(String) : [];
  if (images.length > 10) return { statut: 400, donnees: { error: "Dix images au plus" } };
  let r;
  if (d.video) {
    // Vidéo publiée directement sur la page : Facebook la télécharge depuis son adresse publique (site)
    const video = String(d.video);
    if (!video.startsWith("https://")) return { statut: 400, donnees: { error: "Vidéo : adresse https attendue" } };
    const corps = new URLSearchParams({ ...params, access_token: JETON, file_url: video,
      description: d.lien ? `${message}\n\n${d.lien}` : message, ...(d.video_titre ? { title: String(d.video_titre) } : {}) });
    const rep = await fetch(`https://graph-video.facebook.com/v26.0/${PAGE}/videos`, { method: "POST", body: corps });
    return { statut: rep.ok ? 200 : 502, donnees: masquer(await rep.json().catch(() => ({}))) };
  }
  if (images.length) {
    // Chaque image est d'abord envoyée sans être publiée, puis toutes sont jointes à une seule publication
    const ids: string[] = [];
    for (const nom of images) {
      if (!/^[a-z0-9-]{1,80}$/.test(nom)) return { statut: 400, donnees: { error: `Nom d'image invalide : ${nom}` } };
      const { data: fichier, error } = await service.storage.from("exclusif").download(`facebook/${nom}.png`);
      if (error || !fichier) return { statut: 404, donnees: { error: `Image introuvable : ${nom}` } };
      const form = new FormData();
      form.append("access_token", JETON);
      form.append("published", "false");
      if (params.scheduled_publish_time) form.append("temporary", "true");
      form.append("source", fichier, `${nom}.png`);
      const rep = await fetch(`${GRAPH}/${PAGE}/photos`, { method: "POST", body: form });
      const photo = masquer(await rep.json().catch(() => ({})));
      if (!rep.ok) return { statut: 502, donnees: { etape: `image ${nom}`, ...photo } };
      ids.push(String(photo.id));
    }
    const media: Record<string, string> = {};
    ids.forEach((id, i) => media[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }));
    r = await graph(`${PAGE}/feed`, "POST", { ...params, ...media, message: d.lien ? `${message}\n\n${d.lien}` : message });
  } else if (d.image) {
    const image = String(d.image);
    if (!image.startsWith("https://")) return { statut: 400, donnees: { error: "Image : adresse https attendue" } };
    r = await graph(`${PAGE}/photos`, "POST", { ...params, url: image, caption: d.lien ? `${message}\n\n${d.lien}` : message });
  } else {
    r = await graph(`${PAGE}/feed`, "POST", { ...params, message, ...(d.lien ? { link: String(d.lien) } : {}) });
  }
  return { statut: r.ok ? 200 : 502, donnees: r.donnees };
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

  if (action === "televersement") {
    const nom = String(d.nom ?? "");
    if (!/^[a-z0-9-]{1,80}$/.test(nom)) return json({ error: "Nom invalide (minuscules, chiffres et tirets)" }, 400);
    const { data, error } = await service.storage.from("exclusif").createSignedUploadUrl(`facebook/${nom}.png`);
    if (error) return json({ error: error.message }, 500);
    return json({ chemin: `facebook/${nom}.png`, url: data.signedUrl });
  }

  if (action === "publier") {
    const r = await publier(service, d);
    return json(r.donnees, r.statut);
  }

  if (action === "planif") {
    // Appelée toutes les cinq minutes par pg_cron : publie les publications du plan arrivées à leur heure
    const { data: dues } = await service.from("facebook_publications").select("id, prevue_le, message, lien, images, video, video_titre")
      .eq("statut", "programmee").lte("prevue_le", new Date().toISOString()).order("prevue_le").limit(3);
    const bilan = [];
    for (const p of dues ?? []) {
      // Réservation de la ligne : une autre exécution ne la reprendra pas
      const { data: prise } = await service.from("facebook_publications").update({ statut: "en_cours" })
        .eq("id", p.id).eq("statut", "programmee").select("id");
      if (!prise?.length) continue;
      if (Date.now() - new Date(p.prevue_le).getTime() > 3 * 3600 * 1000) {
        await service.from("facebook_publications").update({ statut: "manquee", erreur: "Plus de trois heures de retard" }).eq("id", p.id);
        bilan.push({ id: p.id, statut: "manquee" });
        continue;
      }
      const r = await publier(service, { message: p.message, lien: p.lien, images: p.images, video: p.video, video_titre: p.video_titre });
      const id = (r.donnees as { id?: string }).id;
      if (r.statut === 200 && id) {
        await service.from("facebook_publications").update({ statut: "publiee", fb_id: id, publiee_le: new Date().toISOString() }).eq("id", p.id);
        bilan.push({ id: p.id, statut: "publiee" });
      } else {
        await service.from("facebook_publications").update({ statut: "erreur", erreur: JSON.stringify(r.donnees).slice(0, 1000) }).eq("id", p.id);
        bilan.push({ id: p.id, statut: "erreur" });
      }
    }
    return json({ traitees: bilan });
  }

  if (action === "essai") {
    if (d.video) {
      // Essai de vidéo : envoi sans publication (invisible), puis suppression
      const corps = new URLSearchParams({ access_token: JETON, file_url: String(d.video), published: "false", description: "Essai" });
      const rep = await fetch(`https://graph-video.facebook.com/v26.0/${PAGE}/videos`, { method: "POST", body: corps });
      const v = masquer(await rep.json().catch(() => ({})));
      if (!rep.ok || !v.id) return json({ etape: "creation", ...v }, 502);
      const s = await graph(String(v.id), "DELETE");
      return json({ creation: "ok", id: v.id, suppression: s.ok ? "ok" : s.donnees });
    }
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
