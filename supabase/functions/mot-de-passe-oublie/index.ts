// Fonction « mot-de-passe-oublie » : envoie à l'abonné un lien pour choisir un nouveau mot de passe.
//
// Le lien est créé par Supabase (lien de récupération à usage unique) et envoyé par Brevo depuis
// infos@coursesesame.com. Il mène à espace-abonnes/?reinit=<jeton> : la page échange le jeton contre une session
// (verifyOtp) puis demande le nouveau mot de passe. La réponse est toujours la même, que l'adresse ait un compte
// ou non, pour ne pas révéler qui est inscrit. Limites : 3 demandes par heure pour une même adresse, 20 par heure
// depuis une même adresse IP.
//
// Déploiement : sans vérification de jeton (la fonction est appelée par des visiteurs non connectés).
// Secret requis : BREVO_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SITE = "https://coursesesame.com";
const EXPEDITEUR = { name: "Les Cours Sésame et SAJ", email: "infos@coursesesame.com" };
const WHATSAPP = "+225 01 60 86 05 37";
const MAX_EMAIL = 3, MAX_IP = 20;

function cleSecrete(): string {
  try {
    const cles = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (cles.default) return cles.default;
  } catch {
    // ancienne forme seulement
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const MESSAGE = "Si un compte existe avec cette adresse, un e-mail vient de lui être envoyé avec un lien pour choisir un nouveau mot de passe. Pensez à regarder dans les courriers indésirables.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const email = String(d.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Adresse e-mail invalide." }, 400);
  if (!Deno.env.get("BREVO_API_KEY")) return json({ error: "L'envoi d'e-mails est indisponible. Écrivez-nous sur WhatsApp." }, 503);

  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
  const uneHeure = new Date(Date.now() - 3600_000).toISOString();
  const [parEmail, parIp] = await Promise.all([
    service.from("journal_mot_de_passe").select("id", { count: "exact", head: true }).eq("email", email).gte("cree_le", uneHeure),
    service.from("journal_mot_de_passe").select("id", { count: "exact", head: true }).eq("ip", ip).gte("cree_le", uneHeure),
  ]);
  if (parEmail.error || parIp.error) {
    console.error("journal_mot_de_passe :", (parEmail.error ?? parIp.error)!.message);
    return json({ error: "Demande impossible pour le moment. Réessayez plus tard." }, 500);
  }
  if ((parEmail.count ?? 0) >= MAX_EMAIL || (parIp.count ?? 0) >= MAX_IP) {
    return json({ error: "Trop de demandes. Réessayez dans une heure, ou écrivez-nous sur WhatsApp." }, 429);
  }
  await service.from("journal_mot_de_passe").insert({ ip, email });
  await service.from("journal_mot_de_passe").delete().lt("cree_le", new Date(Date.now() - 86400_000).toISOString());

  // Lien de récupération : sans compte pour cette adresse, Supabase renvoie une erreur et rien n'est envoyé
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  const jeton = data?.properties?.hashed_token;
  if (error || !jeton || !data?.user) return json({ ok: true, message: MESSAGE });
  const { data: p } = await service.from("profils").select("prenom").eq("id", data.user.id).maybeSingle();
  const prenom = p?.prenom ?? "";
  const lien = `${SITE}/espace-abonnes/?reinit=${encodeURIComponent(jeton)}`;
  const sujet = "Choisir un nouveau mot de passe";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${sujet}</title></head>
<body style="margin:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#18202f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">Les Cours Sésame et SAJ</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55">
<p>Bonjour ${esc(prenom)},</p>
<p>Vous avez demandé à changer le mot de passe de votre compte sur l'espace abonnés. Le lien ci-dessous ne sert qu'une fois et expire rapidement : utilisez-le sans attendre.</p>
<p style="margin:24px 0"><a href="${lien}" style="display:inline-block;padding:12px 22px;background:#e8a62b;color:#0f2a5c;font-weight:700;text-decoration:none;border-radius:6px">Choisir un nouveau mot de passe</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail. Votre mot de passe actuel reste valable.</p>
<p>L'équipe des Cours Sésame et SAJ</p></td></tr>
<tr><td style="padding:16px 24px;background:#f3f5f8;font-size:12px;line-height:1.5;color:#5b6475">Pour nous écrire, utilisez WhatsApp au ${WHATSAPP}. Cette adresse ne reçoit pas les réponses.</td></tr>
</table></td></tr></table></body></html>`;
  const texte = `Bonjour ${prenom},\n\nVous avez demandé à changer le mot de passe de votre compte sur l'espace abonnés. Le lien ci-dessous ne sert qu'une fois et expire rapidement : utilisez-le sans attendre.\n\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail. Votre mot de passe actuel reste valable.\n\nL'équipe des Cours Sésame et SAJ\nPour nous écrire, utilisez WhatsApp au ${WHATSAPP}.`;
  try {
    const rep = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: EXPEDITEUR, to: [{ email, name: prenom || email }], subject: sujet, htmlContent: html, textContent: texte, tags: ["mot_de_passe"] }),
    });
    if (!rep.ok) console.error("Brevo", rep.status, (await rep.text()).slice(0, 300));
  } catch (e) {
    console.error("Brevo réseau", e instanceof Error ? e.message : e);
  }
  return json({ ok: true, message: MESSAGE });
});
