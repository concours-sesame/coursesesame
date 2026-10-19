// Fonction « emails » : envoi des e-mails aux abonnés par Brevo, depuis infos@coursesesame.com.
//   { action: "planif" }          appel de la tâche planifiée (en-tête x-planif, vérifié par la base) : bienvenue,
//                                 rappel de fin d'abonnement, annonce quotidienne des nouveautés
//   { action: "etat" }            administrateur : envoi ouvert ou fermé, clé Brevo enregistrée ou non
//   { action: "essai" }           administrateur : e-mail d'essai envoyé à sa propre adresse
//   { action: "desinscrire", jeton } lien des e-mails : l'abonné ne reçoit plus l'annonce des nouveautés
//
// Déploiement : sans vérification de jeton par la plateforme. Secret requis : BREVO_API_KEY. Seuls l'adresse e-mail,
// le prénom et le contenu du message sont transmis à Brevo.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-planif",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SITE = "https://coursesesame.com";
const EXPEDITEUR = { name: "Les Cours Sésame et SAJ", email: "infos@coursesesame.com" };
const WHATSAPP = "+225 01 60 86 05 37";
const WA = "2250160860537";
const ENVOIS_MAX = 250; // par passage, sous la limite quotidienne de l'offre gratuite de Brevo (300)

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });
  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const action = String(d.action ?? "");

  if (action === "desinscrire") {
    const jeton = String(d.jeton ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jeton)) return json({ error: "Lien invalide." }, 400);
    const { data } = await service.rpc("emails_desinscrire", { p_jeton: jeton });
    return data ? json({ ok: true }) : json({ error: "Lien invalide ou expiré." }, 404);
  }

  if (action === "planif") {
    const { data: valide } = await service.rpc("emails_verifier_planif", { p_cle: req.headers.get("x-planif") ?? "" });
    if (valide !== true) return json({ error: "Accès refusé" }, 403);
    return json(await planif(service));
  }

  // Actions de l'administrateur : session valide et validation en deux étapes (est_admin)
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: appelant } = await service.auth.getUser(jeton);
  if (!appelant?.user) return json({ error: "Connexion requise." }, 401);
  const lui = createClient(url, clePublique(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
  const { data: admin } = await lui.rpc("est_admin");
  if (admin !== true) return json({ error: "Accès réservé à l'administrateur." }, 403);
  if (action === "etat") {
    const { data: r } = await service.from("emails_reglages").select("actif").maybeSingle();
    return json({ cle: !!Deno.env.get("BREVO_API_KEY"), actif: !!r?.actif });
  }
  if (action === "essai") {
    if (!Deno.env.get("BREVO_API_KEY")) return json({ error: "La clé Brevo n'est pas encore enregistrée dans Supabase." }, 503);
    const { data: p } = await service.from("profils").select("prenom, jeton_emails").eq("id", appelant.user.id).maybeSingle();
    const { data: derniers } = await service.from("contenus").select("titre, matiere, type").eq("publie", true).order("publie_le", { ascending: false }).limit(3);
    const m = nouveautes(p?.prenom ?? "", (derniers ?? []) as Contenu[], p?.jeton_emails ?? "");
    const r = await envoyer(appelant.user.email!, p?.prenom ?? "", "[Essai] " + m.sujet, m.html, m.texte, "essai", p?.jeton_emails);
    await service.from("emails_envoyes").insert({ user_id: appelant.user.id, type: "essai", cle: new Date().toISOString(), statut: r ? "erreur" : "envoye", erreur: r });
    return r ? json({ error: r }, 502) : json({ ok: true, a: appelant.user.email });
  }
  return json({ error: "Action inconnue." }, 400);
});

type Contenu = { titre: string; matiere: string | null; type: string };
type Ligne = { type: string; cle: string; user_id: string; email: string; prenom: string; donnees: Record<string, unknown> };

async function planif(service: SupabaseClient) {
  const { data: r } = await service.from("emails_reglages").select("actif").maybeSingle();
  if (!r?.actif) return { actif: false };
  if (!Deno.env.get("BREVO_API_KEY")) return { actif: true, cle: false };
  const { data: file, error } = await service.rpc("emails_file");
  if (error) return { erreur: error.message };
  let envoyes = 0, erreurs = 0, annonce = false;
  for (const l of (file ?? []) as Ligne[]) {
    if (envoyes + erreurs >= ENVOIS_MAX) break;
    // Réservation de l'envoi : une seule exécution peut l'obtenir (clé unique abonné, type, clé)
    const { data: reserve } = await service.from("emails_envoyes").upsert({ user_id: l.user_id, type: l.type, cle: l.cle }, { onConflict: "user_id,type,cle", ignoreDuplicates: true }).select("id");
    if (!reserve?.length) continue;
    const m = l.type === "bienvenue" ? bienvenue(l.prenom, l.donnees)
      : l.type === "rappel_fin" ? rappel(l.prenom, l.donnees)
      : nouveautes(l.prenom, l.donnees.contenus as Contenu[], String(l.donnees.jeton ?? ""));
    const echec = await envoyer(l.email, l.prenom, m.sujet, m.html, m.texte, l.type, l.type === "nouveautes" ? String(l.donnees.jeton ?? "") : undefined);
    await service.from("emails_envoyes").update({ statut: echec ? "erreur" : "envoye", erreur: echec }).eq("id", reserve[0].id);
    if (echec) erreurs++; else envoyes++;
    if (l.type === "nouveautes") annonce = true;
  }
  if (annonce) await service.rpc("emails_annonce_faite");
  return { actif: true, envoyes, erreurs };
}

// Envoi par l'API de Brevo ; renvoie null si l'e-mail est parti, sinon le message d'erreur
async function envoyer(a: string, nom: string, sujet: string, html: string, texte: string, etiquette: string, jeton?: string): Promise<string | null> {
  const corps: Record<string, unknown> = { sender: EXPEDITEUR, to: [{ email: a, name: nom || a }], subject: sujet, htmlContent: html, textContent: texte, tags: [etiquette] };
  if (jeton) corps.headers = { "List-Unsubscribe": `<${lienDesinscription(jeton)}>` };
  try {
    const rep = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corps),
    });
    if (rep.ok) return null;
    return `Brevo ${rep.status} ${(await rep.text()).slice(0, 300)}`;
  } catch (e) {
    return `Réseau ${e instanceof Error ? e.message : ""}`.slice(0, 300);
  }
}

/* ---------- Modèles des e-mails ---------- */

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const dateFr = (d: unknown) => new Date(String(d) + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const lienDesinscription = (jeton: string) => `${SITE}/espace-abonnes/?desinscription=${jeton}`;
const bouton = (texte: string, lien: string, fond = "#e8a62b", couleur = "#0f2a5c") =>
  `<p style="margin:24px 0"><a href="${lien}" style="display:inline-block;padding:12px 22px;background:${fond};color:${couleur};font-weight:700;text-decoration:none;border-radius:6px">${esc(texte)}</a></p>`;

function gabarit(titre: string, corps: string, pied: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titre)}</title></head>
<body style="margin:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#18202f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">Les Cours Sésame et SAJ<div style="font-size:13px;font-weight:400;color:#e8a62b;margin-top:4px">Préparation aux concours, Abidjan</div></td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55">${corps}</td></tr>
<tr><td style="padding:16px 24px;background:#f3f5f8;font-size:12px;line-height:1.5;color:#5b6475">${pied}
<br>Pour nous écrire, utilisez WhatsApp au ${WHATSAPP}. Cette adresse ne reçoit pas les réponses.</td></tr>
</table></td></tr></table></body></html>`;
}
const piedService = "Vous recevez cet e-mail parce que vous avez un compte sur l'espace abonnés de coursesesame.com.";

function bienvenue(prenom: string, d: Record<string, unknown>) {
  const ouvrages = d.ouvrages === true;
  const sujet = "Bienvenue dans votre espace abonnés";
  const points = [
    ouvrages ? "les ouvrages complets compris dans votre formule" : "les sujets corrigés, les fiches de révision et les QCM chronométrés (les ouvrages complets sont réservés aux formules d'un mois et plus)",
    "la révision du jour, qui fait revenir les questions de QCM au bon moment",
    "le simulateur de grand oral et le sujet de la semaine",
    ...(ouvrages ? ["l'agent de révision, qui rédige un corrigé ou note votre copie sur 20, lorsqu'il est ouvert"] : []),
    "le téléchargement de quelques pages chaque semaine, à votre nom",
  ];
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>Votre abonnement est actif du <b>${dateFr(d.debut)}</b> au <b>${dateFr(d.fin)}</b> inclus. Merci de votre confiance.</p>
<p>Dans votre espace, vous trouverez</p><ul>${points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${bouton("Ouvrir mon espace abonnés", `${SITE}/espace-abonnes/`)}
<p>Votre compte est personnel et s'ouvre sur un seul appareil à la fois. Chaque page porte votre nom ; les contenus sont réservés à votre usage personnel.</p>
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const texte = `Bonjour ${prenom},\n\nVotre abonnement est actif du ${dateFr(d.debut)} au ${dateFr(d.fin)} inclus. Merci de votre confiance.\n\nDans votre espace, vous trouverez\n${points.map((x) => "- " + x).join("\n")}\n\nOuvrir mon espace abonnés ${SITE}/espace-abonnes/\n\nVotre compte est personnel et s'ouvre sur un seul appareil à la fois. Chaque page porte votre nom ; les contenus sont réservés à votre usage personnel.\n\nBonne préparation,\nL'équipe des Cours Sésame et SAJ\n\nPour nous écrire, utilisez WhatsApp au ${WHATSAPP}.`;
  return { sujet, html: gabarit(sujet, corps, piedService), texte };
}

function rappel(prenom: string, d: Record<string, unknown>) {
  const fin = dateFr(d.fin);
  const sujet = `Votre abonnement se termine le ${fin}`;
  const message = encodeURIComponent(`Bonjour, je souhaite prolonger mon abonnement à l'espace abonnés (fin le ${fin}).`);
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>Votre abonnement à l'espace abonnés se termine le <b>${fin}</b> au soir.</p>
<p>Pour continuer sans interruption, réglez la formule de votre choix par Mobile Money, puis envoyez-nous la référence du paiement sur WhatsApp. La prolongation s'ajoute à la suite de votre abonnement en cours, vous ne perdez donc aucun jour.</p>
${bouton("Prolonger sur WhatsApp", `https://wa.me/${WA}?text=${message}`, "#25d366", "#ffffff")}
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const texte = `Bonjour ${prenom},\n\nVotre abonnement à l'espace abonnés se termine le ${fin} au soir.\n\nPour continuer sans interruption, réglez la formule de votre choix par Mobile Money, puis envoyez-nous la référence du paiement sur WhatsApp au ${WHATSAPP}. La prolongation s'ajoute à la suite de votre abonnement en cours, vous ne perdez donc aucun jour.\n\nL'équipe des Cours Sésame et SAJ`;
  return { sujet, html: gabarit(sujet, corps, piedService), texte };
}

function nouveautes(prenom: string, contenus: Contenu[], jeton: string) {
  const n = contenus.length;
  const sujet = n === 1 ? `Nouveau dans votre espace, ${contenus[0].titre}` : `${n} nouveaux contenus dans votre espace abonnés`;
  const nature = (c: Contenu) => (/^ouvrage/i.test(c.matiere ?? "") ? "Ouvrage complet" : c.type === "video" ? "Vidéo" : c.type === "texte" ? "Fiche ou QCM" : "Document");
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>${n === 1 ? "Un nouveau contenu vient d'être mis en ligne" : `${n} nouveaux contenus viennent d'être mis en ligne`} dans votre espace abonnés.</p>
<ul>${contenus.map((c) => `<li><b>${esc(c.titre)}</b><br><span style="color:#5b6475;font-size:14px">${esc(/^ouvrage/i.test(c.matiere ?? "") || !c.matiere ? nature(c) : c.matiere)}</span></li>`).join("")}</ul>
${bouton("Voir les nouveautés", `${SITE}/espace-abonnes/`)}
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const pied = `${piedService} Vous pouvez <a href="${lienDesinscription(jeton)}" style="color:#5b6475">ne plus recevoir l'annonce des nouveautés</a>, ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const texte = `Bonjour ${prenom},\n\n${n === 1 ? "Un nouveau contenu vient d'être mis en ligne" : `${n} nouveaux contenus viennent d'être mis en ligne`} dans votre espace abonnés.\n\n${contenus.map((c) => `- ${c.titre} (${nature(c)})`).join("\n")}\n\nVoir les nouveautés ${SITE}/espace-abonnes/\n\nL'équipe des Cours Sésame et SAJ\n\nNe plus recevoir l'annonce des nouveautés ${lienDesinscription(jeton)}`;
  return { sujet, html: gabarit(sujet, corps, pied), texte };
}
