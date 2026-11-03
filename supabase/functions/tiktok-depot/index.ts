// Fonction « tiktok-depot » : déballe dans l'espace de stockage public « tiktok » un lot de vidéos fabriquées pour TikTok.
// Appelable par la base seule (en-tête x-import, clé du coffre vérifiée par textes_verifier_import).
// Le lot est déposé au préalable dans le stockage privé par l'action « televersement » de import-texte (textes/<nom>.pdf).
// Format du lot : 10 chiffres (longueur L de l'index), l'index JSON [{ chemin, taille }] sur L octets, puis les fichiers
// mis bout à bout dans l'ordre de l'index. Chaque fichier va dans tiktok/<chemin> (dossier/nom.mp4, sans remplacement).
// Requête : POST { nom } ; le lot est effacé une fois déballé.
// Copie vers l'espace abonnés : POST { copier: ["qcm/qcm-du-jour-001.mp4", …] } recopie chaque vidéo du stockage public
// « tiktok » dans le stockage privé, à exclusif/videos/<nom>.mp4 (sans remplacement), où elle n'est lisible qu'aux
// conditions de la ligne correspondante de la table contenus (date de publication, abonnement, accès aux vidéos).
// Nettoyage : POST { effacer: ["donnees/<nom>.mp4", "qcm/<nom>.mp4", …] } efface des fichiers de données provisoires du
// dossier donnees/, et les vidéos publiques dont la copie privée identique existe (200 chemins au plus par appel).
// Gros ouvrage : POST { nom, morceaux: <contenu> } déballe un lot de morceaux de 20 pages pour la fonction « pages ».
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

function cleSecrete(): string {
  try {
    const cles = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (cles.default) return cles.default;
  } catch {
    // ancienne forme seulement
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: valide } = await service.rpc("textes_verifier_import", { p_cle: req.headers.get("x-import") ?? "" });
  if (valide !== true) return json({ error: "Accès refusé" }, 403);
  let d: { nom?: string; copier?: string[]; effacer?: string[]; morceaux?: number };
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  // Effacement des fichiers de données provisoires (tiktok/donnees/…) une fois lus par la base, et des vidéos publiques
  // (tiktok/<dossier>/<nom>.mp4) dont la copie privée exclusif/videos/<nom>.mp4 existe avec la même taille
  if (Array.isArray(d.effacer)) {
    const chemins: string[] = [], gardes: string[] = [];
    const { data: copies } = await service.storage.from("exclusif").list("videos", { limit: 1000 });
    const tailles = new Map((copies ?? []).map((o) => [o.name, Number(o.metadata?.size ?? -1)]));
    const dossiers = new Map<string, Map<string, number>>();
    for (const c of d.effacer.slice(0, 200).map(String)) {
      if (/^donnees\/[a-z0-9-]+\.mp4$/.test(c)) {
        chemins.push(c);
        continue;
      }
      const m = c.match(/^([a-z0-9-]+)\/([a-z0-9-]+\.mp4)$/);
      if (!m) {
        gardes.push(`${c} : invalide`);
        continue;
      }
      if (!dossiers.has(m[1])) {
        const { data: l } = await service.storage.from("tiktok").list(m[1], { limit: 1000 });
        dossiers.set(m[1], new Map((l ?? []).map((o) => [o.name, Number(o.metadata?.size ?? -2)])));
      }
      const t = dossiers.get(m[1])!.get(m[2]);
      if (t === undefined) gardes.push(`${c} : absente`);
      else if (tailles.get(m[2]) !== t) gardes.push(`${c} : pas de copie privée identique`);
      else chemins.push(c);
    }
    if (!chemins.length) return json({ effaces: [], gardes });
    const { data, error: e } = await service.storage.from("tiktok").remove(chemins);
    return e ? json({ error: e.message }, 500) : json({ effaces: (data ?? []).map((o) => o.name), gardes });
  }
  if (Array.isArray(d.copier)) {
    const faits: string[] = [], erreurs: string[] = [];
    for (const chemin of d.copier.slice(0, 40).map(String)) {
      if (!/^[a-z0-9-]+\/[a-z0-9-]+\.mp4$/.test(chemin)) {
        erreurs.push(`${chemin} : invalide`);
        continue;
      }
      const cible = `videos/${chemin.split("/")[1]}`;
      const { data: video, error: e1 } = await service.storage.from("tiktok").download(chemin);
      if (e1 || !video) {
        erreurs.push(`${chemin} : ${e1?.message ?? "absente"}`);
        continue;
      }
      const { error: e2 } = await service.storage.from("exclusif").upload(cible, video, { contentType: "video/mp4", upsert: false });
      if (e2) erreurs.push(`${cible} : ${e2.message}`);
      else faits.push(cible);
    }
    return json({ copies: faits.length, faits, erreurs });
  }
  const nom = String(d.nom ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  if (!nom) return json({ error: "Nom manquant" }, 400);
  // Morceaux de 20 pages d'un gros ouvrage, découpés d'avance pour la fonction « pages » : POST { nom, morceaux: <contenu> }
  // déballe le lot (index [{ chemin: "<k>.pdf", taille }]) dans exclusif/pages/<contenu>/<empreinte du fichier>/<k>.pdf
  if (d.morceaux !== undefined) {
    const id = Number(d.morceaux);
    const { data: c } = await service.from("contenus").select("fichier").eq("id", id).maybeSingle();
    if (!c?.fichier) return json({ error: "Contenu introuvable" }, 404);
    const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(c.fichier))).slice(0, 8),
      (o) => o.toString(16).padStart(2, "0")).join("");
    const lotM = `textes/${nom}.pdf`;
    const { data: f, error: e0 } = await service.storage.from("exclusif").download(lotM);
    if (e0 || !f) return json({ error: `Stockage ${e0?.message ?? "lot absent"}` }, 404);
    const o = new Uint8Array(await f.arrayBuffer());
    const l = Number(new TextDecoder().decode(o.slice(0, 10)));
    const idx: { chemin: string; taille: number }[] = JSON.parse(new TextDecoder().decode(o.slice(10, 10 + l)));
    let p = 10 + l;
    const faits: string[] = [], erreurs: string[] = [];
    for (const { chemin, taille } of idx) {
      const m = o.slice(p, p + taille);
      p += taille;
      if (!/^\d+\.pdf$/.test(chemin) || m.byteLength !== taille) {
        erreurs.push(`${chemin} : invalide`);
        continue;
      }
      const cible = `pages/${id}/${empreinte}/${chemin}`;
      const { error: e } = await service.storage.from("exclusif").upload(cible, m, { contentType: "application/pdf", upsert: true });
      if (e) erreurs.push(`${cible} : ${e.message}`);
      else faits.push(cible);
    }
    if (!erreurs.length) await service.storage.from("exclusif").remove([lotM]);
    return json({ deposes: faits.length, erreurs });
  }
  const lot = `textes/${nom}.pdf`;
  const { data: fichier, error } = await service.storage.from("exclusif").download(lot);
  if (error || !fichier) return json({ error: `Stockage ${error?.message ?? "lot absent"}` }, 404);
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const longueur = Number(new TextDecoder().decode(octets.slice(0, 10)));
  let index: { chemin: string; taille: number }[];
  try {
    index = JSON.parse(new TextDecoder().decode(octets.slice(10, 10 + longueur)));
  } catch {
    return json({ error: "Index du lot illisible" }, 400);
  }
  let pos = 10 + longueur;
  const faits: string[] = [], erreurs: string[] = [];
  for (const { chemin, taille } of index) {
    const morceau = octets.slice(pos, pos + taille);
    pos += taille;
    if (!/^[a-z0-9-]+\/[a-z0-9-]+\.mp4$/.test(chemin) || morceau.byteLength !== taille) {
      erreurs.push(`${chemin} : invalide`);
      continue;
    }
    const { error: e } = await service.storage.from("tiktok").upload(chemin, morceau, { contentType: "video/mp4", upsert: false });
    if (e) erreurs.push(`${chemin} : ${e.message}`);
    else faits.push(chemin);
  }
  if (!erreurs.length) await service.storage.from("exclusif").remove([lot]);
  return json({ deposes: faits.length, faits, erreurs });
});
