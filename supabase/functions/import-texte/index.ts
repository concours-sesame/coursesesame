// Fonction « import-texte » : verse dans l'espace abonnés un texte officiel (loi, décret, acte uniforme, décision)
// téléchargé directement depuis sa source officielle. Elle n'est appelable que par la base (en-tête x-import, clé
// gardée dans le coffre et vérifiée par textes_verifier_import) et ne télécharge que depuis les sites listés dans
// HOTES. Le contenu est créé en brouillon : il n'est visible des abonnés qu'une fois publié.
// Requête : POST { url, titre, description, matiere, concours: [...], nom } ; nom = nom du fichier, sans extension.
// Variante pour un fichier transmis par l'éditeur : POST { action: "televersement", nom } renvoie une adresse de dépôt
// signée, valable deux heures, pour le seul fichier textes/<nom>.pdf (sans remplacement d'un fichier existant).
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const HOTES = [/(^|\.)ohada\.org$/, /(^|\.)ccja-ohada\.org$/, /(^|\.)gouv\.ci$/, /(^|\.)conseil-constitutionnel\.ci$/,
  /(^|\.)courdecassation\.ci$/, /(^|\.)assemblee-nationale\.ci$/, /(^|\.)senat\.ci$/, /(^|\.)presidence\.ci$/, /(^|\.)conseil-etat\.ci$/];
const TAILLE_MAX = 50 * 1024 * 1024;

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
const autorise = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && HOTES.some((h) => h.test(x.hostname));
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleJson("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: valide } = await service.rpc("textes_verifier_import", { p_cle: req.headers.get("x-import") ?? "" });
  if (valide !== true) return json({ error: "Accès refusé" }, 403);

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  if (d.action === "televersement") {
    const nomDepot = String(d.nom ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
    if (!nomDepot) return json({ error: "Nom manquant" }, 400);
    const { data, error } = await service.storage.from("exclusif").createSignedUploadUrl(`textes/${nomDepot}.pdf`);
    return error ? json({ error: `Stockage ${error.message}` }, 409) : json({ chemin: data.path, url: data.signedUrl });
  }
  const url = String(d.url ?? ""), titre = String(d.titre ?? "").trim().slice(0, 160), matiere = String(d.matiere ?? "").trim().slice(0, 80);
  const nom = String(d.nom ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  if (!autorise(url)) return json({ error: "Source non autorisée" }, 400);
  if (!titre || !nom || !/^(texte officiel|jurisprudence)/i.test(matiere)) return json({ error: "Titre, nom ou matière manquant" }, 400);

  // Téléchargement (redirections suivies, mais la destination finale doit rester une source autorisée)
  const rep = await fetch(url, { redirect: "follow" });
  if (!rep.ok) return json({ error: `Source ${rep.status}` }, 502);
  if (!autorise(rep.url)) return json({ error: "Redirection vers une source non autorisée" }, 400);
  const octets = new Uint8Array(await rep.arrayBuffer());
  if (octets.length > TAILLE_MAX) return json({ error: "Fichier trop lourd" }, 413);
  if (new TextDecoder().decode(octets.slice(0, 5)) !== "%PDF-") return json({ error: "Ce n'est pas un PDF" }, 415);

  const chemin = `textes/${nom}.pdf`;
  const { error: errEnvoi } = await service.storage.from("exclusif").upload(chemin, octets, { contentType: "application/pdf", upsert: false });
  if (errEnvoi) return json({ error: `Stockage ${errEnvoi.message}` }, 409);
  const concours = Array.isArray(d.concours) ? (d.concours as unknown[]).map(String).slice(0, 10) : [];
  const { data: c, error } = await service.from("contenus").insert({
    titre, description: String(d.description ?? "").slice(0, 600), type: "pdf", fichier: chemin, matiere, concours, publie: false,
  }).select("id").single();
  if (error) {
    await service.storage.from("exclusif").remove([chemin]);
    return json({ error: `Base ${error.message}` }, 500);
  }
  return json({ id: c.id, chemin, octets: octets.length });
});
