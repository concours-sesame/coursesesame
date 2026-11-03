// Fonction « echeances » : rappel par e-mail des dates importantes de l'éditeur, une semaine avant chacune.
// Appelable par la base seule (en-tête x-import, clé du coffre vérifiée par textes_verifier_import), chaque matin.
//   { action: "rappels" } : dates de echeances_liste() comprises entre aujourd'hui et dans 7 jours, pas encore
//                           rappelées (echeances_rappels) ; un seul e-mail aux administrateurs, qui les réunit
// Une date ajoutée moins d'une semaine à l'avance est rappelée le matin suivant. Secret : BREVO_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const SITE = "https://coursesesame.com";
const EXPEDITEUR = { name: "Les Cours Sésame et SAJ", email: "infos@coursesesame.com" };
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const dateFr = (d: string) => { const [a, m, j] = d.split("-").map(Number); return `${j === 1 ? "1er" : j} ${MOIS[m - 1]} ${a}`; };
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

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
type Echeance = { cle: string; titre: string; date_echeance: string; detail: string | null };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: valide } = await service.rpc("textes_verifier_import", { p_cle: req.headers.get("x-import") ?? "" });
  if (valide !== true) return json({ error: "Accès refusé" }, 403);

  const auj = new Date().toISOString().slice(0, 10), limite = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const { data: liste, error } = await service.rpc("echeances_liste");
  if (error) return json({ error: error.message }, 500);
  const { data: faits } = await service.from("echeances_rappels").select("cle, date_echeance");
  const deja = new Set((faits ?? []).map((r: { cle: string; date_echeance: string }) => `${r.cle}|${r.date_echeance}`));
  const aRappeler = ((liste ?? []) as Echeance[]).filter((e) => e.date_echeance >= auj && e.date_echeance <= limite && !deja.has(`${e.cle}|${e.date_echeance}`));
  if (!aRappeler.length) return json({ rappels: 0 });
  if (!Deno.env.get("BREVO_API_KEY")) return json({ error: "Clé Brevo absente" }, 500);

  const jours = (d: string) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(auj + "T00:00:00Z")) / 86400_000);
  const quand = (d: string) => { const n = jours(d); return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`; };
  const sujet = aRappeler.length === 1 ? `Rappel : ${aRappeler[0].titre}, le ${dateFr(aRappeler[0].date_echeance)}` : `Rappel : ${aRappeler.length} dates importantes cette semaine`;
  const lignes = aRappeler.map((e) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee"><b style="color:#0f2a5c">${esc(e.titre)}</b><br><span style="color:#c9962b;font-weight:700">${dateFr(e.date_echeance)}, ${quand(e.date_echeance)}</span>${e.detail ? `<br><span style="font-size:14px;color:#3a4763">${esc(e.detail)}</span>` : ""}</td></tr>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(sujet)}</title></head>
<body style="margin:0;background:#f8f4ec;font-family:Arial,Helvetica,sans-serif;color:#18202f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f4ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">Les Cours Sésame et SAJ<div style="font-size:13px;font-weight:400;color:#e8a62b;margin-top:4px">Dates importantes</div></td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55">
<p>Bonjour,</p>
<p>${aRappeler.length === 1 ? "Une date importante arrive" : "Des dates importantes arrivent"} dans les sept prochains jours :</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
<p style="margin:24px 0"><a href="${SITE}/espace-abonnes/" style="display:inline-block;padding:12px 22px;background:#e8a62b;color:#0f2a5c;font-weight:700;text-decoration:none;border-radius:6px">Voir toutes les dates</a></p>
<p style="font-size:13px;color:#5b6475">Toutes les dates sont épinglées en haut de votre espace, quand vous êtes connecté avec le compte administrateur.</p>
</td></tr></table></td></tr></table></body></html>`;
  const texte = ["Bonjour,", "", "Dates importantes des sept prochains jours :", "",
    ...aRappeler.map((e) => `- ${e.titre} : ${dateFr(e.date_echeance)}, ${quand(e.date_echeance)}.${e.detail ? " " + e.detail : ""}`), "",
    `Toutes les dates : ${SITE}/espace-abonnes/`].join("\n");

  const { data: dest } = await service.rpc("echeances_destinataires");
  const erreurs: string[] = [];
  for (const d of (dest ?? []) as { email: string; prenom: string }[]) {
    const rep = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: EXPEDITEUR, to: [{ email: d.email, name: d.prenom || "Administrateur" }], subject: sujet, htmlContent: html, textContent: texte, tags: ["echeances"] }),
    }).catch((e) => e);
    if (!(rep instanceof Response) || !rep.ok) erreurs.push(rep instanceof Response ? `Brevo ${rep.status}` : String(rep));
  }
  if (!erreurs.length) await service.from("echeances_rappels").insert(aRappeler.map((e) => ({ cle: e.cle, date_echeance: e.date_echeance })));
  return json({ rappels: aRappeler.length, envoyes: (dest ?? []).length - erreurs.length, erreurs });
});
