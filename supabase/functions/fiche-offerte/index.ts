// Fonction « fiche-offerte » : un visiteur laisse son prénom et un e-mail ou un numéro WhatsApp, et reçoit une fiche
// de révision entière (seulement celles de FICHES_OFFERTES).
//   { fiche, prenom, email?, whatsapp?, concours?, accepte_offres?, page? }
//        -> { ok, lien } : lien de téléchargement valable 7 jours ; envoyé aussi par e-mail (Brevo) si une adresse est donnée
//   { action: "desinscrire", jeton }   lien des e-mails : la personne ne veut plus de conseils ni d'offres
//   { action: "test", prenom, email?, whatsapp?, concours?, accepte_offres?, page?, resultat }
//        -> { ok } : test de niveau gratuit (page test-de-niveau/), contact enregistré avec son résultat
//        ({ note, total, themes: [{ nom, bons, total }] }), résultat envoyé par e-mail si une adresse est donnée
//
// Pour limiter les abus : au plus 20 demandes par heure depuis une même adresse IP, effacée après un jour.
// Déploiement : sans vérification de jeton (visiteurs non connectés). Secret : BREVO_API_KEY (déjà utilisé par emails).
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SITE = "https://coursesesame.com";
const EXPEDITEUR = { name: "Les Cours Sésame et SAJ", email: "infos@coursesesame.com" };
const WHATSAPP = "+225 01 60 86 05 37";
// Numéro de la fiche -> ligne de contenus (le fichier y est lu, pour suivre un éventuel remplacement en v2)
const FICHES_OFFERTES: Record<number, number> = { 1: 147, 23: 169 };
const CONCOURS = ["infj", "greffe", "penitentiaire", "eppjej", "ena", "autre"];
const MAX_PAR_HEURE = 20;
const DUREE_LIEN = 7 * 86400;

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
const texte = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);

  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return erreur("Requête invalide");
  }
  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (d.action === "desinscrire") {
    const jeton = String(d.jeton ?? "");
    if (!/^[0-9a-f-]{36}$/.test(jeton)) return erreur("Lien invalide.");
    await service.from("prospects").update({ accepte_offres: false, desinscrit_le: new Date().toISOString() })
      .eq("jeton", jeton).is("desinscrit_le", null);
    return reponse({ ok: true });
  }

  const test = d.action === "test";
  const fiche = test ? null : Number(d.fiche);
  const prenom = texte(d.prenom, 60);
  const email = texte(d.email, 254).toLowerCase() || null;
  const whatsapp = String(d.whatsapp ?? "").replace(/[^0-9+]/g, "") || null;
  const concours = CONCOURS.includes(String(d.concours)) ? String(d.concours) : null;
  const accepte = d.accepte_offres === true;
  const page = texte(d.page, 200) || null;

  if (!test && !FICHES_OFFERTES[fiche!]) return erreur("Cette fiche n'est pas offerte.");
  const resultat = test ? lireResultat(d.resultat) : null;
  if (test && !resultat) return erreur("Résultat du test invalide.");
  if (!prenom) return erreur("Indiquez votre prénom.");
  if (!email && !whatsapp) return erreur("Indiquez une adresse e-mail ou un numéro WhatsApp.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erreur("Adresse e-mail invalide.");
  if (whatsapp && !/^\+?[0-9]{8,15}$/.test(whatsapp)) return erreur("Numéro WhatsApp invalide.");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
  const { count, error: errCompte } = await service.from("prospects").select("id", { count: "exact", head: true })
    .eq("ip", ip).gte("cree_le", new Date(Date.now() - 3600_000).toISOString());
  if (errCompte) {
    console.error("prospects :", errCompte.message);
    return erreur("Envoi impossible pour le moment. Réessayez plus tard.", 500);
  }
  if ((count ?? 0) >= MAX_PAR_HEURE) return erreur("Trop de demandes depuis cette connexion. Réessayez dans une heure.", 429);
  await service.from("prospects").update({ ip: null }).not("ip", "is", null).lt("cree_le", new Date(Date.now() - 86400_000).toISOString());

  if (test) {
    const { data: ligne, error: errAjout } = await service.from("prospects")
      .insert({ prenom, email, whatsapp, concours, fiche: null, source: "test", resultat, page, accepte_offres: accepte, ip })
      .select("id, jeton").single();
    if (errAjout) {
      console.error("ajout test :", errAjout.message);
      return erreur("Enregistrement impossible pour le moment. Réessayez plus tard.", 500);
    }
    if (email) {
      const echec = await envoyerResultat(email, prenom, resultat!, accepte ? ligne.jeton : null);
      if (echec) console.error("Brevo :", echec);
      else await service.from("prospects").update({ email_envoye: true }).eq("id", ligne.id);
    }
    return reponse({ ok: true });
  }

  const { data: contenu } = await service.from("contenus").select("titre, fichier").eq("id", FICHES_OFFERTES[fiche!]).single();
  if (!contenu?.fichier) return erreur("Fiche introuvable.", 500);
  const { data: signe, error: errLien } = await service.storage.from("exclusif").createSignedUrl(contenu.fichier, DUREE_LIEN, {
    download: `fiche-${String(fiche).padStart(4, "0")}-cours-sesame-et-saj.pdf`,
  });
  if (errLien || !signe) {
    console.error("lien :", errLien?.message);
    return erreur("Envoi impossible pour le moment. Réessayez plus tard.", 500);
  }

  const { data: ligne, error: errAjout } = await service.from("prospects")
    .insert({ prenom, email, whatsapp, concours, fiche, page, accepte_offres: accepte, ip })
    .select("id, jeton").single();
  if (errAjout) {
    console.error("ajout :", errAjout.message);
    return erreur("Envoi impossible pour le moment. Réessayez plus tard.", 500);
  }

  if (email) {
    const titre = String(contenu.titre).replace(/^Fiche n° \d+ · /, "");
    const echec = await envoyer(email, prenom, titre, fiche!, signe.signedUrl, accepte ? ligne.jeton : null);
    if (echec) console.error("Brevo :", echec);
    else await service.from("prospects").update({ email_envoye: true }).eq("id", ligne.id);
  }
  return reponse({ ok: true, lien: signe.signedUrl });
});

type Resultat = { note: number; total: number; themes: { nom: string; bons: number; total: number }[] };
function lireResultat(v: unknown): Resultat | null {
  const r = v as Resultat;
  if (!r || typeof r !== "object" || !Array.isArray(r.themes) || r.themes.length > 12) return null;
  const total = Number(r.total), note = Number(r.note);
  if (!Number.isInteger(total) || total < 1 || total > 40 || !(note >= 0 && note <= total)) return null;
  const themes = r.themes.map((t) => ({ nom: texte(t?.nom, 60), bons: Number(t?.bons), total: Number(t?.total) }));
  if (themes.some((t) => !t.nom || !Number.isInteger(t.total) || t.total < 1 || !(t.bons >= 0 && t.bons <= t.total))) return null;
  return { note, total, themes };
}

async function brevo(a: string, prenom: string, sujet: string, html: string, corps: string, tag: string): Promise<string | null> {
  try {
    const rep = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": Deno.env.get("BREVO_API_KEY")!, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: EXPEDITEUR, to: [{ email: a, name: prenom }], subject: sujet, htmlContent: html, textContent: corps, tags: [tag] }),
    });
    if (rep.ok) return null;
    return `Brevo ${rep.status} ${(await rep.text()).slice(0, 300)}`;
  } catch (e) {
    return `Réseau ${e instanceof Error ? e.message : ""}`.slice(0, 300);
  }
}

// Résultat du test de niveau, sur 20, avec le détail par matière
async function envoyerResultat(a: string, prenom: string, r: Resultat, jeton: string | null): Promise<string | null> {
  const sur20 = Math.round((r.note / r.total) * 40) / 2;
  const n = String(sur20).replace(".", ",");
  const lignes = r.themes.map((t) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(t.nom)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right"><b>${t.bons}</b> sur ${t.total}</td></tr>`).join("");
  const conseil = sur20 < 10
    ? "Les bases sont à consolider : commencez par nos fiches de révision et nos QCM, matière par matière."
    : sur20 < 15
    ? "Vous avez de bonnes bases : entraînez-vous maintenant sur nos sujets corrigés et nos concours blancs."
    : "Très bon niveau : faites corriger vos copies et travaillez nos plans de dissertation pour viser le haut du classement.";
  const desinscription = jeton ? `<br>Vous avez accepté de recevoir nos conseils et offres. Pour ne plus les recevoir : <a href="${SITE}/fiches/?desinscription=${jeton}" style="color:#5b6475">se désinscrire</a>.` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Votre test de niveau</title></head>
<body style="margin:0;background:#f8f4ec;font-family:Arial,Helvetica,sans-serif;color:#18202f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f4ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">Les Cours Sésame et SAJ<div style="font-size:13px;font-weight:400;color:#e8a62b;margin-top:4px">Préparation aux concours, Abidjan</div></td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55">
<p>Bonjour ${esc(prenom)},</p>
<p>Voici le résultat de votre test de niveau : <b style="font-size:22px;color:#0f2a5c">${n}/20</b> (${r.note} bonnes réponses sur ${r.total}).</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;margin:12px 0 18px">${lignes}</table>
<p>${conseil}</p>
<p style="margin:24px 0"><a href="${SITE}/espace-abonnes/" style="display:inline-block;padding:12px 22px;background:#e8a62b;color:#0f2a5c;font-weight:700;text-decoration:none;border-radius:6px">Découvrir l'espace abonnés</a></p>
<p>Abonnement dès 500 FCFA la journée, par Mobile Money. Vous pouvez refaire le test quand vous voulez : <a href="${SITE}/test-de-niveau/" style="color:#0f2a5c">coursesesame.com/test-de-niveau</a>.</p>
<p>Bonnes révisions,<br>L'équipe des Cours Sésame et SAJ</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8f4ec;font-size:12px;line-height:1.5;color:#5b6475">Vous recevez cet e-mail parce que vous avez passé le test de niveau sur coursesesame.com.${desinscription}
<br>Pour nous écrire, utilisez WhatsApp au ${WHATSAPP}. Cette adresse ne reçoit pas les réponses.</td></tr>
</table></td></tr></table></body></html>`;
  const corps = [`Bonjour ${prenom},`, "", `Résultat de votre test de niveau : ${n}/20 (${r.note} bonnes réponses sur ${r.total}).`, "",
    ...r.themes.map((t) => `${t.nom} : ${t.bons} sur ${t.total}`), "", conseil, "",
    `L'espace abonnés, dès 500 FCFA la journée : ${SITE}/espace-abonnes/`, "", "L'équipe des Cours Sésame et SAJ",
    jeton ? `\nPour ne plus recevoir nos conseils et offres : ${SITE}/fiches/?desinscription=${jeton}` : ""].join("\n");
  return await brevo(a, prenom, `Votre test de niveau : ${n}/20`, html, corps, "test-niveau");
}

async function envoyer(a: string, prenom: string, titre: string, fiche: number, lien: string, jeton: string | null): Promise<string | null> {
  const bouton = `<p style="margin:24px 0"><a href="${esc(lien)}" style="display:inline-block;padding:12px 22px;background:#e8a62b;color:#0f2a5c;font-weight:700;text-decoration:none;border-radius:6px">Télécharger la fiche</a></p>`;
  const desinscription = jeton ? `<br>Vous avez accepté de recevoir nos conseils et offres. Pour ne plus les recevoir : <a href="${SITE}/fiches/?desinscription=${jeton}" style="color:#5b6475">se désinscrire</a>.` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titre)}</title></head>
<body style="margin:0;background:#f8f4ec;font-family:Arial,Helvetica,sans-serif;color:#18202f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f4ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#0f2a5c;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">Les Cours Sésame et SAJ<div style="font-size:13px;font-weight:400;color:#e8a62b;margin-top:4px">Préparation aux concours, Abidjan</div></td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55">
<p>Bonjour ${esc(prenom)},</p>
<p>Voici la fiche de révision n° ${fiche}, <b>${esc(titre)}</b>, en entier : l'essentiel, les textes cités mot pour mot, les exemples, les pièges des correcteurs et les questions corrigées.</p>
${bouton}
<p>Le lien reste valable 7 jours.</p>
<p>Les 100 fiches de révision se lisent dans l'espace abonnés, avec les sujets corrigés et les QCM, dès 500 FCFA la journée : <a href="${SITE}/espace-abonnes/" style="color:#0f2a5c">coursesesame.com/espace-abonnes</a>.</p>
<p>Bonnes révisions,<br>L'équipe des Cours Sésame et SAJ</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8f4ec;font-size:12px;line-height:1.5;color:#5b6475">Vous recevez cet e-mail parce que vous avez demandé cette fiche sur coursesesame.com.${desinscription}
<br>Pour nous écrire, utilisez WhatsApp au ${WHATSAPP}. Cette adresse ne reçoit pas les réponses.</td></tr>
</table></td></tr></table></body></html>`;
  const corps = [`Bonjour ${prenom},`, "", `Voici la fiche de révision n° ${fiche}, ${titre}, en entier :`, lien, "", "Le lien reste valable 7 jours.", "",
    `Les 100 fiches de révision se lisent dans l'espace abonnés, dès 500 FCFA la journée : ${SITE}/espace-abonnes/`, "",
    "L'équipe des Cours Sésame et SAJ", jeton ? `\nPour ne plus recevoir nos conseils et offres : ${SITE}/fiches/?desinscription=${jeton}` : ""].join("\n");
  return await brevo(a, prenom, `Votre fiche de révision : ${titre}`, html, corps, "fiche-offerte");
}
