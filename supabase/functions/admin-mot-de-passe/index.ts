// Fonction « admin-mot-de-passe » : l'administrateur donne un mot de passe provisoire à un abonné
// qui a oublié le sien (le site n'envoie pas d'e-mails). Le mot de passe est affiché à l'administrateur,
// qui le transmet à l'abonné sur WhatsApp ; l'abonné peut ensuite le changer depuis son espace.
//
// Déploiement : sans vérification de jeton par la plateforme. La fonction vérifie elle-même la session
// de l'appelant (auth.getUser) puis sa présence dans la table « admins ».
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
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
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
const erreur = (message: string, statut = 400) => reponse({ error: message }, statut);

// Mot de passe lisible au téléphone : 4 lettres, un tiret, 4 chiffres (sans I, O, L, 0, 1)
function motDePasseProvisoire() {
  const lettres = "ABCDEFGHJKMNPQRSTUVWXYZ", chiffres = "23456789";
  const tirage = (alphabet: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => alphabet[x % alphabet.length]).join("");
  return `${tirage(lettres, 4)}-${tirage(chiffres, 4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // L'appelant doit être connecté et inscrit comme administrateur
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: appelant, error: errAppelant } = await admin.auth.getUser(jeton);
  if (errAppelant || !appelant?.user) return erreur("Connexion requise.", 401);
  const { data: estAdmin } = await admin.from("admins").select("user_id").eq("user_id", appelant.user.id).maybeSingle();
  if (!estAdmin) return erreur("Accès réservé à l'administrateur.", 403);

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return erreur("Requête invalide");
  }
  const userId = String(d.user_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return erreur("Compte invalide.");

  const motDePasse = motDePasseProvisoire();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: motDePasse });
  if (error) {
    console.error("updateUserById :", error.message);
    return erreur("Impossible de changer le mot de passe de ce compte.", 500);
  }
  return reponse({ motDePasse });
});
