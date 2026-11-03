// Fonction « tiktok-depot » : déballe dans l'espace de stockage public « tiktok » un lot de vidéos fabriquées pour TikTok.
// Appelable par la base seule (en-tête x-import, clé du coffre vérifiée par textes_verifier_import).
// Le lot est déposé au préalable dans le stockage privé par l'action « televersement » de import-texte (textes/<nom>.pdf).
// Format du lot : 10 chiffres (longueur L de l'index), l'index JSON [{ chemin, taille }] sur L octets, puis les fichiers
// mis bout à bout dans l'ordre de l'index. Chaque fichier va dans tiktok/<chemin> (dossier/nom.mp4, sans remplacement).
// Requête : POST { nom } ; le lot est effacé une fois déballé.
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
  let d: { nom?: string };
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const nom = String(d.nom ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  if (!nom) return json({ error: "Nom manquant" }, 400);
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
