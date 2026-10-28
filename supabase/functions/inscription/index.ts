// Fonction « inscription » : crée le compte d'un futur abonné.
//
// Le compte est créé déjà confirmé : le site n'envoie aucun e-mail (le service d'e-mails par défaut
// de Supabase ne sert qu'aux tests). L'abonnement, lui, n'est activé qu'après paiement, depuis la page
// d'administration. Pour limiter les abus : au plus 60 inscriptions par heure depuis une même adresse IP
// (plafond large : les opérateurs mobiles et les réseaux Wi-Fi d'une salle de cours partagent une même adresse).
// Mot de passe refusé s'il figure dans une fuite de données connue (Pwned Passwords).
// Code de parrainage facultatif (profils.code_parrain d'un autre compte) : il est enregistré dans profils.parrain_id ;
// un code inconnu est ignoré sans bloquer l'inscription.
//
// Déploiement : sans vérification de jeton (la fonction est appelée par des visiteurs non connectés).
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CONCOURS = ["infj", "greffe", "penitentiaire", "eppjej", "ena", "autre"];
const MAX_PAR_HEURE = 60;

// Clé secrète du projet : nouvelle forme (SUPABASE_SECRET_KEYS) ou ancienne (SUPABASE_SERVICE_ROLE_KEY)
function cleSecrete(): string {
  try {
    const cles = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (cles.default) return cles.default;
  } catch {
    // ancienne forme seulement
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
// Mot de passe paru dans une fuite de données connue (Pwned Passwords) : seuls les 5 premiers caractères de son
// empreinte SHA-1 sont envoyés. Sans réponse du service, l'inscription n'est pas bloquée.
async function motDePasseFuite(mdp: string): Promise<boolean> {
  try {
    const h = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(mdp)))]
      .map((o) => o.toString(16).padStart(2, "0")).join("").toUpperCase();
    const rep = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000) });
    if (!rep.ok) return false;
    return (await rep.text()).split("\n").some((l) => { const [suite, n] = l.trim().split(":"); return suite === h.slice(5) && Number(n) > 0; });
  } catch {
    return false;
  }
}
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
const erreur = (message: string, statut = 400) => reponse({ error: message }, statut);
const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return erreur("Requête invalide");
  }

  const prenom = texte(d.prenom, 60);
  const nom = texte(d.nom, 60);
  const email = texte(d.email, 254).toLowerCase();
  const telephone = String(d.telephone ?? "").replace(/[^0-9+]/g, "");
  const concours = CONCOURS.includes(String(d.concours)) ? String(d.concours) : null;
  const motDePasse = String(d.motDePasse ?? "");
  const parrain = String(d.parrain ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  if (!prenom || !nom) return erreur("Indiquez votre prénom et votre nom.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erreur("Adresse e-mail invalide.");
  if (!/^\+?[0-9]{8,15}$/.test(telephone)) return erreur("Numéro de téléphone invalide.");
  if (motDePasse.length < 8 || motDePasse.length > 72) return erreur("Le mot de passe doit compter au moins 8 caractères.");
  if (await motDePasseFuite(motDePasse)) return erreur("Ce mot de passe figure dans des fuites de données connues. Choisissez-en un autre.");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Limite par adresse IP sur une heure
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
  const uneHeure = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: errCompte } = await admin.from("journal_inscriptions")
    .select("id", { count: "exact", head: true }).eq("ip", ip).gte("cree_le", uneHeure);
  if (errCompte) {
    console.error("journal_inscriptions :", errCompte.message);
    return erreur("Inscription impossible pour le moment. Réessayez plus tard.", 500);
  }
  if ((count ?? 0) >= MAX_PAR_HEURE) return erreur("Trop d'inscriptions depuis cette connexion. Réessayez dans une heure.", 429);
  await admin.from("journal_inscriptions").insert({ ip });
  await admin.from("journal_inscriptions").delete().lt("cree_le", new Date(Date.now() - 86400_000).toISOString());

  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { prenom, nom, telephone, concours },
  });
  if (error) {
    if ((error as { code?: string }).code === "email_exists" || /already|registered|exists/i.test(error.message)) {
      return erreur("Un compte existe déjà avec cette adresse e-mail. Connectez-vous.", 409);
    }
    if (/password/i.test(error.message)) return erreur("Ce mot de passe est trop faible. Choisissez-en un autre.");
    console.error("createUser :", error.message);
    return erreur("Inscription impossible pour le moment. Réessayez plus tard.", 500);
  }
  if (parrain && cree?.user) {
    const { data: p } = await admin.from("profils").select("id").eq("code_parrain", parrain).maybeSingle();
    if (p && p.id !== cree.user.id) await admin.from("profils").update({ parrain_id: p.id }).eq("id", cree.user.id);
  }
  return reponse({ ok: true });
});
