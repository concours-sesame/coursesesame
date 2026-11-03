// Fonction « emails » : envoi des e-mails aux abonnés par Brevo, depuis infos@coursesesame.com.
//   { action: "planif" }          appel de la tâche planifiée (en-tête x-planif, vérifié par la base) : bienvenue,
//                                 invitation à renouveler (10 jours avant la fin), rappels de fin d'abonnement
//                                 (7 et 3 jours avant), relance d'inactivité,
//                                 annonce quotidienne des nouveautés, récapitulatif du lundi, passage en VIP
//                                 (emails_file_vip), relance des inscrits jamais abonnés (2 et 10 jours après
//                                 l'inscription, emails_file_relances), alertes à l'administrateur (nouvelle demande
//                                 d'activation, nouveau compte), et suivi des contacts qui ont accepté les conseils et
//                                 offres (fiche offerte, test de niveau : 1, 3 et 7 jours après, emails_file_prospects)
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
    const r = await envoyer(appelant.user.email!, p?.prenom ?? "", "[Essai] " + m.sujet, m.html, m.texte, "essai", p?.jeton_emails ? lienDesinscription(p.jeton_emails) : undefined);
    await service.from("emails_envoyes").insert({ user_id: appelant.user.id, type: "essai", cle: new Date().toISOString(), statut: r ? "erreur" : "envoye", erreur: r });
    return r ? json({ error: r }, 502) : json({ ok: true, a: appelant.user.email });
  }
  return json({ error: "Action inconnue." }, 400);
});

type Contenu = { titre: string; matiere: string | null; type: string };
type Contact = { id: number; prenom: string; email: string; source: string | null; concours: string | null; resultat: { note?: number; total?: number } | null; jeton: string; etape: number };
type Ligne = { type: string; cle: string; user_id: string; email: string; prenom: string; donnees: Record<string, unknown> };

async function planif(service: SupabaseClient) {
  const { data: r } = await service.from("emails_reglages").select("actif").maybeSingle();
  if (!r?.actif) return { actif: false };
  if (!Deno.env.get("BREVO_API_KEY")) return { actif: true, cle: false };
  const [{ data: fileBase, error }, { data: fileVip }, { data: fileRelances }] = await Promise.all([service.rpc("emails_file"), service.rpc("emails_file_vip"), service.rpc("emails_file_relances")]);
  if (error) return { erreur: error.message };
  const file = [...(fileBase ?? []), ...(fileVip ?? []), ...(fileRelances ?? [])];
  let envoyes = 0, erreurs = 0, annonce = false;
  for (const l of (file ?? []) as Ligne[]) {
    if (envoyes + erreurs >= ENVOIS_MAX) break;
    // Réservation de l'envoi : une seule exécution peut l'obtenir (clé unique abonné, type, clé). Un envoi déjà
    // tenté en vain est repris, trois fois au plus (emails_reprendre)
    const { data: nouveau } = await service.from("emails_envoyes").upsert({ user_id: l.user_id, type: l.type, cle: l.cle }, { onConflict: "user_id,type,cle", ignoreDuplicates: true }).select("id");
    let id = nouveau?.[0]?.id as number | undefined;
    if (!id) {
      const { data: repris } = await service.rpc("emails_reprendre", { p_user: l.user_id, p_type: l.type, p_cle: l.cle });
      id = repris ?? undefined;
    }
    if (!id) continue;
    const m = l.type === "bienvenue" ? bienvenue(l.prenom, l.donnees)
      : l.type === "rappel_fin" ? rappel(l.prenom, l.donnees)
      : l.type === "renouvellement" ? renouvellement(l.prenom, l.donnees)
      : l.type === "inactif" ? relance(l.prenom, l.donnees)
      : l.type === "campagne" ? campagne(l.prenom, l.donnees)
      : l.type === "hebdo" ? hebdo(l.prenom, l.donnees)
      : l.type === "passage_vip" ? passageVip(l.prenom, l.donnees)
      : l.type === "relance_inscrit" ? relanceInscrit(l.prenom, l.donnees)
      : l.type === "alerte_demande" ? alerteDemande(l.donnees)
      : l.type === "alerte_compte" ? alerteCompte(l.donnees)
      : l.type === "nouveautes" ? nouveautes(l.prenom, l.donnees.contenus as Contenu[], String(l.donnees.jeton ?? ""))
      : null;
    if (!m) {
      await service.from("emails_envoyes").update({ statut: "erreur", erreur: `Type inconnu : ${l.type}` }).eq("id", id);
      erreurs++;
      continue;
    }
    const echec = await envoyer(l.email, l.prenom, m.sujet, m.html, m.texte, l.type, ["nouveautes", "inactif", "campagne", "hebdo", "renouvellement", "relance_inscrit"].includes(l.type) ? lienDesinscription(String(l.donnees.jeton ?? "")) : undefined);
    await service.from("emails_envoyes").update({ statut: echec ? "erreur" : "envoye", erreur: echec }).eq("id", id);
    if (echec) erreurs++; else envoyes++;
    if (l.type === "nouveautes") annonce = true;
  }
  if (annonce) await service.rpc("emails_annonce_faite");

  // Suivi des contacts : l'étape est réservée avant l'envoi ; un envoi manqué n'est pas repris (erreur notée)
  const { data: contacts } = await service.rpc("emails_file_prospects");
  let suivis = 0;
  for (const c of (contacts ?? []) as Contact[]) {
    if (envoyes + erreurs >= ENVOIS_MAX) break;
    const { data: reserve } = await service.rpc("prospect_suivi_reserver", { p_id: c.id, p_etape: c.etape });
    if (reserve !== true) continue;
    const m = suiviContact(c);
    const echec = await envoyer(c.email, c.prenom, m.sujet, m.html, m.texte, `suivi_${c.etape}`, lienDesinscriptionContact(c.jeton));
    if (echec) {
      await service.rpc("prospect_suivi_erreur", { p_id: c.id, p_erreur: echec });
      erreurs++;
    } else {
      envoyes++;
      suivis++;
    }
  }
  return { actif: true, envoyes, erreurs, suivis };
}

// Envoi par l'API de Brevo ; renvoie null si l'e-mail est parti, sinon le message d'erreur
async function envoyer(a: string, nom: string, sujet: string, html: string, texte: string, etiquette: string, desinscription?: string): Promise<string | null> {
  const corps: Record<string, unknown> = { sender: EXPEDITEUR, to: [{ email: a, name: nom || a }], subject: sujet, htmlContent: html, textContent: texte, tags: [etiquette] };
  if (desinscription) corps.headers = { "List-Unsubscribe": `<${desinscription}>` };
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
const lienDesinscriptionContact = (jeton: string) => `${SITE}/fiches/?desinscription=${jeton}`;
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
  const ouvrages = d.ouvrages === true, vip = d.vip === true;
  const sujet = vip ? "Bienvenue dans votre espace VIP" : "Bienvenue dans votre espace abonnés";
  const points = [
    "les sujets corrigés, les fiches de révision, les QCM chronométrés, les textes officiels et la jurisprudence",
    vip ? "l'espace VIP : nos ouvrages complets et nos vidéos réservées" : ouvrages ? "les ouvrages complets compris dans votre formule" : "l'espace VIP, si vous le souhaitez : nos ouvrages complets et nos vidéos réservées, avec une formule VIP",
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

// Passage en VIP en cours d'abonnement (« Passer en VIP » dans l'administration, ou période VIP activée)
function passageVip(prenom: string, d: Record<string, unknown>) {
  const sujet = "Votre espace VIP est ouvert";
  const points = [
    "nos ouvrages complets, à lire en ligne",
    "nos vidéos réservées : une notion expliquée en une minute",
    "les documents VIP, dont la banque de plans de dissertation et le guide de préparation au grand oral",
    "chaque mois, une copie corrigée et notée sur 20 : déposez-la dans votre espace, encadré « Votre copie corrigée du mois »",
  ];
  const fin = d.fin ? dateFr(d.fin) : "";
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>Votre abonnement passe en VIP${fin ? ` : l'espace VIP vous est ouvert jusqu'au <b>${fin}</b> inclus` : ""}. Merci de votre confiance.</p>
<p>Vous y trouverez</p><ul>${points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${bouton("Ouvrir mon espace VIP", `${SITE}/espace-abonnes/`)}
<p>Le reste de votre abonnement ne change pas : sujets corrigés, fiches de révision, QCM, textes et jurisprudence.</p>
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const texte = `Bonjour ${prenom},\n\nVotre abonnement passe en VIP${fin ? ` : l'espace VIP vous est ouvert jusqu'au ${fin} inclus` : ""}. Merci de votre confiance.\n\nVous y trouverez\n${points.map((x) => "- " + x).join("\n")}\n\nOuvrir mon espace VIP ${SITE}/espace-abonnes/\n\nLe reste de votre abonnement ne change pas : sujets corrigés, fiches de révision, QCM, textes et jurisprudence.\n\nBonne préparation,\nL'équipe des Cours Sésame et SAJ\n\nPour nous écrire, utilisez WhatsApp au ${WHATSAPP}.`;
  return { sujet, html: gabarit(sujet, corps, piedService), texte };
}

function rappel(prenom: string, d: Record<string, unknown>) {
  const fin = dateFr(d.fin);
  const sujet = `Votre abonnement se termine le ${fin}`;
  const message = encodeURIComponent(`Bonjour, je souhaite prolonger mon abonnement à l'espace abonnés (fin le ${fin}).`);
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>Votre abonnement à l'espace abonnés se termine le <b>${fin}</b> au soir.</p>
<p>Pour continuer sans interruption, réglez la formule de votre choix par Mobile Money, puis saisissez la référence du paiement dans votre espace, en haut de la page, rubrique « Renouveler en ligne ». Vous pouvez aussi nous l'envoyer sur WhatsApp. La prolongation s'ajoute à la suite de votre abonnement en cours, vous ne perdez donc aucun jour.</p>
${bouton("Renouveler dans mon espace", `${SITE}/espace-abonnes/`)}
${bouton("Prolonger sur WhatsApp", `https://wa.me/${WA}?text=${message}`, "#25d366", "#ffffff")}
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const texte = `Bonjour ${prenom},\n\nVotre abonnement à l'espace abonnés se termine le ${fin} au soir.\n\nPour continuer sans interruption, réglez la formule de votre choix par Mobile Money, puis saisissez la référence du paiement dans votre espace, en haut de la page, rubrique « Renouveler en ligne » (${SITE}/espace-abonnes/). Vous pouvez aussi nous l'envoyer sur WhatsApp au ${WHATSAPP}. La prolongation s'ajoute à la suite de votre abonnement en cours, vous ne perdez donc aucun jour.\n\nL'équipe des Cours Sésame et SAJ`;
  return { sujet, html: gabarit(sujet, corps, piedService), texte };
}

// Invitation à renouveler, dix jours avant la fin : ce que l'abonné a dans son espace, les formules longues et leur
// économie par rapport à des mois pris un à un, le parrainage
const PRIX_MOIS = 5000;
const LONGUES: [string, number, number][] = [["3 mois", 12500, 3], ["6 mois", 22500, 6], ["12 mois", 40000, 12]];
// Espace VIP (depuis le 28 octobre 2026) : ouvrages complets et vidéos réservées, au triple du prix normal
const VIP_TEXTE = "Les ouvrages complets et les vidéos réservées sont désormais réunis dans l'espace VIP, au triple du prix de l'abonnement normal (15 000 FCFA le mois). Pour les garder après votre abonnement en cours, choisissez une formule VIP en renouvelant.";
const fcfa = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
function renouvellement(prenom: string, d: Record<string, unknown>) {
  const fin = dateFr(d.fin), jeton = String(d.jeton ?? "");
  const nouveaux = Number(d.nouveaux ?? 0), titres = (d.titres ?? []) as string[];
  const sujet = `Votre préparation continue après le ${fin} ?`;
  const message = encodeURIComponent(`Bonjour, je souhaite renouveler mon abonnement à l'espace abonnés (fin le ${fin}).`);
  const atouts = [
    "70 séries de concours blancs chronométrées (magistrature, Greffe, pénitentiaire, EPPJEJ, ENA), avec le corrigé-type et la grille sur 20 de chacune des 315 épreuves",
    "plus de 50 textes officiels et décisions, avec une recherche dans le texte",
    "la révision du jour, le simulateur de grand oral et le sujet de la semaine",
    "avec une formule VIP, l'espace VIP : nos ouvrages complets et les vidéos « Une notion, une minute »",
  ];
  const formules = LONGUES.map(([nom, prix, mois]) => `${nom} : ${fcfa(prix)}, au lieu de ${fcfa(PRIX_MOIS * mois)} en prenant ${mois} mois un à un`);
  const nouv = nouveaux
    ? `<p>Depuis le début de votre abonnement, ${nouveaux === 1 ? "un nouveau contenu a été ajouté" : `${nouveaux} nouveaux contenus ont été ajoutés`}, notamment</p><ul>${titres.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : "";
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>Votre abonnement à l'espace abonnés se termine le <b>${fin}</b>. Pour ne pas interrompre votre préparation, vous pouvez le renouveler dès maintenant : la nouvelle période s'ajoute à la suite de l'abonnement en cours, vous ne perdez aucun jour.</p>
${nouv}<p>En renouvelant, vous gardez</p><ul>${atouts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p>Le mois coûte ${fcfa(PRIX_MOIS)}. Les formules longues reviennent moins cher :</p><ul>${formules.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p>${esc(VIP_TEXTE)}</p>
<p>Pour renouveler, réglez la formule choisie par Mobile Money, puis saisissez la référence du paiement dans votre espace, en haut de la page, rubrique « Renouveler en ligne ». Vous pouvez aussi nous l'envoyer sur WhatsApp.</p>
${bouton("Renouveler dans mon espace", `${SITE}/espace-abonnes/`)}
${bouton("Renouveler sur WhatsApp", `https://wa.me/${WA}?text=${message}`, "#25d366", "#ffffff")}
<p>Un ami prépare aussi un concours ? Donnez-lui votre code de parrainage, visible dans votre espace : à son premier abonnement, vous recevez 7 jours offerts.</p>
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const pied = `${piedService} Vous pouvez <a href="${lienDesinscription(jeton)}" style="color:#5b6475">ne plus recevoir nos e-mails d'information</a>, ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const texte = `Bonjour ${prenom},\n\nVotre abonnement à l'espace abonnés se termine le ${fin}. Pour ne pas interrompre votre préparation, vous pouvez le renouveler dès maintenant : la nouvelle période s'ajoute à la suite de l'abonnement en cours, vous ne perdez aucun jour.\n\n${nouveaux ? `Depuis le début de votre abonnement, ${nouveaux === 1 ? "un nouveau contenu a été ajouté" : `${nouveaux} nouveaux contenus ont été ajoutés`}, notamment\n${titres.map((t) => "- " + t).join("\n")}\n\n` : ""}En renouvelant, vous gardez\n${atouts.map((x) => "- " + x).join("\n")}\n\nLe mois coûte ${fcfa(PRIX_MOIS)}. Les formules longues reviennent moins cher :\n${formules.map((x) => "- " + x).join("\n")}\n\n${VIP_TEXTE}\n\nPour renouveler, réglez la formule choisie par Mobile Money, puis saisissez la référence du paiement dans votre espace, rubrique « Renouveler en ligne » (${SITE}/espace-abonnes/), ou envoyez-la-nous sur WhatsApp au ${WHATSAPP}.\n\nUn ami prépare aussi un concours ? Donnez-lui votre code de parrainage, visible dans votre espace : à son premier abonnement, vous recevez 7 jours offerts.\n\nL'équipe des Cours Sésame et SAJ\n\nNe plus recevoir nos e-mails d'information ${lienDesinscription(jeton)}`;
  return { sujet, html: gabarit(sujet, corps, pied), texte };
}

function relance(prenom: string, d: Record<string, unknown>) {
  const jours = Number(d.jours ?? 0), fin = dateFr(d.fin), nouveaux = Number(d.nouveaux ?? 0);
  const titres = (d.titres ?? []) as string[];
  const sujet = "Votre espace abonnés vous attend";
  const etapes = [
    "la révision du jour, une dizaine de questions qui reviennent au bon moment",
    "un sujet corrigé ou une fiche de révision de la matière que vous redoutez le plus",
    "les textes officiels, pour relire un article de code en quelques secondes",
  ];
  const nouv = nouveaux
    ? `<p>Depuis votre dernier passage, ${nouveaux === 1 ? "un nouveau contenu a été ajouté" : `${nouveaux} nouveaux contenus ont été ajoutés`}, notamment</p><ul>${titres.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
    : "";
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>Nous ne vous avons pas vu dans votre espace abonnés depuis quelques jours. Votre abonnement court jusqu'au <b>${fin}</b> : il vous reste ${jours} ${jours > 1 ? "jours" : "jour"} pour en profiter.</p>
${nouv}<p>Pour reprendre en un quart d'heure, commencez par</p><ul>${etapes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${bouton("Reprendre ma préparation", `${SITE}/espace-abonnes/`)}
<p>Une difficulté pour vous connecter ? Écrivez-nous sur WhatsApp, nous vous répondons rapidement.</p>
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const pied = `${piedService} Vous pouvez <a href="${lienDesinscription(String(d.jeton ?? ""))}" style="color:#5b6475">ne plus recevoir nos e-mails d'information</a> (nouveautés et relances), ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const texte = `Bonjour ${prenom},\n\nNous ne vous avons pas vu dans votre espace abonnés depuis quelques jours. Votre abonnement court jusqu'au ${fin} : il vous reste ${jours} ${jours > 1 ? "jours" : "jour"} pour en profiter.\n\n${nouveaux ? `Depuis votre dernier passage, ${nouveaux} nouveau${nouveaux > 1 ? "x contenus ont été ajoutés" : " contenu a été ajouté"}, notamment\n${titres.map((t) => "- " + t).join("\n")}\n\n` : ""}Pour reprendre en un quart d'heure, commencez par\n${etapes.map((x) => "- " + x).join("\n")}\n\nReprendre ma préparation ${SITE}/espace-abonnes/\n\nUne difficulté pour vous connecter ? Écrivez-nous sur WhatsApp au ${WHATSAPP}.\n\nL'équipe des Cours Sésame et SAJ\n\nNe plus recevoir nos e-mails d'information ${lienDesinscription(String(d.jeton ?? ""))}`;
  return { sujet, html: gabarit(sujet, corps, pied), texte };
}

function nouveautes(prenom: string, contenus: Contenu[], jeton: string) {
  const n = contenus.length;
  const sujet = n === 1 ? `Nouveau dans votre espace, ${contenus[0].titre}` : `${n} nouveaux contenus dans votre espace abonnés`;
  const nature = (c: Contenu) => (/^ouvrage/i.test(c.matiere ?? "") ? "Ouvrage complet" : c.type === "video" ? "Vidéo" : c.type === "texte" ? "Fiche ou QCM" : "Document");
  const rubrique = (c: Contenu) => (/^ouvrage/i.test(c.matiere ?? "") || !c.matiere ? nature(c) : c.matiere);
  // Au-delà de 12 contenus, la liste est regroupée par rubrique pour rester lisible
  const groupes = new Map<string, number>();
  contenus.forEach((c) => groupes.set(rubrique(c), (groupes.get(rubrique(c)) ?? 0) + 1));
  const regroupe = n > 12;
  const lignes = regroupe
    ? [...groupes].map(([r, k]) => `<li><b>${esc(r)}</b>, ${k} ${k === 1 ? "contenu" : "contenus"}</li>`)
    : contenus.map((c) => `<li><b>${esc(c.titre)}</b><br><span style="color:#5b6475;font-size:14px">${esc(rubrique(c))}</span></li>`);
  const lignesTexte = regroupe
    ? [...groupes].map(([r, k]) => `- ${r}, ${k} ${k === 1 ? "contenu" : "contenus"}`)
    : contenus.map((c) => `- ${c.titre} (${nature(c)})`);
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>${n === 1 ? "Un nouveau contenu vient d'être mis en ligne" : `${n} nouveaux contenus viennent d'être mis en ligne`} dans votre espace abonnés.</p>
<ul>${lignes.join("")}</ul>
${bouton("Voir les nouveautés", `${SITE}/espace-abonnes/`)}
<p>Bonne préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const pied = `${piedService} Vous pouvez <a href="${lienDesinscription(jeton)}" style="color:#5b6475">ne plus recevoir l'annonce des nouveautés</a>, ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const texte = `Bonjour ${prenom},\n\n${n === 1 ? "Un nouveau contenu vient d'être mis en ligne" : `${n} nouveaux contenus viennent d'être mis en ligne`} dans votre espace abonnés.\n\n${lignesTexte.join("\n")}\n\nVoir les nouveautés ${SITE}/espace-abonnes/\n\nL'équipe des Cours Sésame et SAJ\n\nNe plus recevoir l'annonce des nouveautés ${lienDesinscription(jeton)}`;
  return { sujet, html: gabarit(sujet, corps, pied), texte };
}

// Campagnes ponctuelles (table emails_campagnes) ; une seule pour l'instant, l'ouverture des concours blancs
function campagne(prenom: string, d: Record<string, unknown>) {
  const jeton = String(d.jeton ?? "");
  const lien = `${SITE}/concours-blancs/`;
  const sujet = "10 concours blancs de la magistrature, chronométrés, avec leurs corrigés";
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p style="font-size:20px;line-height:1.3;font-weight:700;color:#0f2a5c">10 CONCOURS BLANCS DE LA MAGISTRATURE SONT EN LIGNE</p>
<p>Chaque série reproduit le concours direct de l'INFJ, sur des sujets inédits : la <b>présélection en 2 heures</b>, puis les cinq épreuves écrites en <b>4 heures chacune</b> (sujet d'ordre général, droit civil, droit commercial et OHADA, droit pénal et procédure pénale, droit administratif).</p>
<p>Le chronomètre démarre dès que vous entrez dans le sujet, et il n'y a pas de retour en arrière. Si vous quittez la page, il se fige, puis repart quand vous revenez.</p>
<p>Avec votre abonnement, vous lisez le corrigé de chaque épreuve dès votre copie rendue (formules d'une semaine et plus) :</p>
<ul>
<li>la note et la justification de chaque affirmation pour la présélection ;</li>
<li>un corrigé-type et une grille de notation sur 20 pour les écrits.</li>
</ul>
<p>Composez seul, sans document et sans aide, comme le jour du concours. Ces épreuves servent à mesurer votre vrai niveau : un résultat honnête vous dit exactement ce qu'il reste à travailler.</p>
${bouton("Je passe un concours blanc", lien)}
<p>Bon courage,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const pied = `${piedService} Vous pouvez <a href="${lienDesinscription(jeton)}" style="color:#5b6475">ne plus recevoir nos e-mails d'information</a>, ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const texte = `Bonjour ${prenom},

10 CONCOURS BLANCS DE LA MAGISTRATURE SONT EN LIGNE

Chaque série reproduit le concours direct de l'INFJ, sur des sujets inédits : la présélection en 2 heures, puis les cinq épreuves écrites en 4 heures chacune (sujet d'ordre général, droit civil, droit commercial et OHADA, droit pénal et procédure pénale, droit administratif).

Le chronomètre démarre dès que vous entrez dans le sujet, et il n'y a pas de retour en arrière. Si vous quittez la page, il se fige, puis repart quand vous revenez.

Avec votre abonnement, vous lisez le corrigé de chaque épreuve dès votre copie rendue (formules d'une semaine et plus) :
- la note et la justification de chaque affirmation pour la présélection ;
- un corrigé-type et une grille de notation sur 20 pour les écrits.

Composez seul, sans document et sans aide, comme le jour du concours. Ces épreuves servent à mesurer votre vrai niveau : un résultat honnête vous dit exactement ce qu'il reste à travailler.

Je passe un concours blanc ${lien}

L'équipe des Cours Sésame et SAJ

Ne plus recevoir nos e-mails d'information ${lienDesinscription(jeton)}`;
  return { sujet, html: gabarit(sujet, corps, pied), texte };
}

// Récapitulatif du lundi : la semaine écoulée, ce qui attend l'abonné cette semaine
const FORMULES: Record<string, string> = { j1: "1 jour", j7: "1 semaine", j14: "2 semaines", m1: "1 mois", m2: "2 mois", m3: "3 mois", m6: "6 mois", m12: "12 mois" };
function hebdo(prenom: string, d: Record<string, unknown>) {
  const jeton = String(d.jeton ?? "");
  const jours = Number(d.jours_actifs ?? 0), lectures = Number(d.lectures ?? 0), revoir = Number(d.a_revoir ?? 0), nouveaux = Number(d.nouveaux ?? 0);
  const titres = (d.titres ?? []) as string[];
  const blanc = d.blanc as { titre: string; debut: string } | null;
  const auj = new Date().toISOString().slice(0, 10);
  const jConcours = d.date_concours ? Math.round((new Date(String(d.date_concours) + "T00:00:00Z").getTime() - new Date(auj + "T00:00:00Z").getTime()) / 864e5) : null;
  const sujet = jours ? `Votre semaine de révision, ${jours} ${jours > 1 ? "jours actifs" : "jour actif"}` : "Votre programme de la semaine";
  const bilan = jours
    ? `La semaine dernière, vous avez révisé ${jours} ${jours > 1 ? "jours" : "jour"} sur 7${lectures ? ` et ouvert ${lectures} ${lectures > 1 ? "documents" : "document"}` : ""}. Continuez ainsi.`
    : "Vous n'avez pas révisé dans votre espace la semaine dernière. Un quart d'heure par jour suffit pour reprendre le rythme.";
  const points: string[] = [];
  if (revoir) points.push(`${revoir} ${revoir > 1 ? "questions de QCM vous attendent" : "question de QCM vous attend"} dans la révision du jour`);
  if (nouveaux) points.push(`${nouveaux > 1 ? `${nouveaux} nouveaux contenus ont été ajoutés` : "un nouveau contenu a été ajouté"} cette semaine${titres.length ? `, notamment ${titres.join(", ")}` : ""}`);
  if (blanc) points.push(`prochain concours blanc, ${blanc.titre}, le ${new Date(blanc.debut).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" })}`);
  points.push("un nouveau sujet de la semaine, à traiter dans les conditions de l'épreuve");
  const rebours = jConcours != null && jConcours >= 0 ? `<p><b>J-${jConcours}</b> avant votre concours.</p>` : "";
  const corps = `<p>Bonjour ${esc(prenom)},</p>
<p>${esc(bilan)}</p>${rebours}
<p>Cette semaine dans votre espace</p><ul>${points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${bouton("Ouvrir mon espace abonnés", `${SITE}/espace-abonnes/`)}
<p>Votre abonnement court jusqu'au ${dateFr(d.fin)}.</p>
<p>Bonne semaine de préparation,<br>L'équipe des Cours Sésame et SAJ</p>`;
  const pied = `${piedService} Vous pouvez <a href="${lienDesinscription(jeton)}" style="color:#5b6475">ne plus recevoir nos e-mails d'information</a>, ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const texte = `Bonjour ${prenom},\n\n${bilan}\n${jConcours != null && jConcours >= 0 ? `J-${jConcours} avant votre concours.\n` : ""}\nCette semaine dans votre espace\n${points.map((x) => "- " + x).join("\n")}\n\nOuvrir mon espace abonnés ${SITE}/espace-abonnes/\n\nVotre abonnement court jusqu'au ${dateFr(d.fin)}.\n\nL'équipe des Cours Sésame et SAJ\n\nNe plus recevoir nos e-mails d'information ${lienDesinscription(jeton)}`;
  return { sujet, html: gabarit(sujet, corps, pied), texte };
}

// Alertes à l'administrateur (sans lien de désinscription : e-mails de service)
const piedAdmin = "E-mail envoyé à l'administrateur de l'espace abonnés de coursesesame.com.";
function alerteDemande(d: Record<string, unknown>) {
  const montant = d.montant != null ? `${String(d.montant).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA` : "montant non indiqué";
  const sujet = `Demande d'activation, ${d.client}`;
  const lignes = [`Abonné : ${d.client} (${d.telephone})`, `Formule : ${/^vip-/.test(String(d.formule)) ? "VIP, " : ""}${FORMULES[String(d.formule).replace(/^vip-/, "")] ?? d.formule}, ${montant}`, `Paiement : ${d.moyen}, référence ${d.reference}`];
  const corps = `<p>Une nouvelle demande d'activation attend votre vérification.</p><ul>${lignes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p>Vérifiez la référence dans votre application Mobile Money, puis validez la demande dans l'administration.</p>
${bouton("Ouvrir l'administration", `${SITE}/espace-abonnes/admin/`)}`;
  const texte = `Une nouvelle demande d'activation attend votre vérification.\n\n${lignes.join("\n")}\n\nOuvrir l'administration ${SITE}/espace-abonnes/admin/`;
  return { sujet, html: gabarit(sujet, corps, piedAdmin), texte };
}
function alerteCompte(d: Record<string, unknown>) {
  const sujet = `Nouveau compte, ${d.client}`;
  const lignes = [`${d.client}, ${d.telephone}`, `Concours : ${d.concours ?? "non précisé"}`];
  const corps = `<p>Un nouveau compte vient d'être créé sur l'espace abonnés.</p><ul>${lignes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${bouton("Voir dans l'administration", `${SITE}/espace-abonnes/admin/`)}`;
  const texte = `Un nouveau compte vient d'être créé sur l'espace abonnés.\n\n${lignes.join("\n")}\n\n${SITE}/espace-abonnes/admin/`;
  return { sujet, html: gabarit(sujet, corps, piedAdmin), texte };
}

// Suivi des contacts et relance des inscrits : chaque message est une suite de blocs (paragraphe, liste, bouton),
// rendue à la fois en HTML et en texte brut
type Bloc = string | string[] | { bouton: string; lien: string; wa?: boolean };
function rendre(sujet: string, prenom: string, blocs: Bloc[], piedHtml: string, piedTexte: string) {
  const tout: Bloc[] = [`Bonjour ${prenom},`, ...blocs];
  const html = tout.map((b) => typeof b === "string" ? `<p>${esc(b).replace(/\n/g, "<br>")}</p>` : Array.isArray(b) ? `<ul>${b.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : b.wa ? bouton(b.bouton, b.lien, "#25d366", "#ffffff") : bouton(b.bouton, b.lien)).join("\n");
  const texte = [...tout.map((b) => typeof b === "string" ? b : Array.isArray(b) ? b.map((x) => "- " + x).join("\n") : `${b.bouton} ${b.lien}`),
    `Pour nous écrire, utilisez WhatsApp au ${WHATSAPP}.`, piedTexte].join("\n\n");
  return { sujet, html: gabarit(sujet, html, piedHtml), texte };
}
const signature = "Bonne préparation,\nL'équipe des Cours Sésame et SAJ";
const NOMS_CONCOURS: Record<string, string> = { infj: "la magistrature", greffe: "le Greffe", penitentiaire: "l'administration pénitentiaire", eppjej: "l'EPPJEJ", ena: "l'ENA" };
const CONTENU_ABONNES = [
  "toutes nos fiches de révision, en entier",
  "les corrigés-types et les grilles de notation sur 20 des 315 épreuves de nos 70 concours blancs (formules d'une semaine et plus)",
  "les sujets corrigés, les QCM chronométrés et la révision du jour, qui fait revenir les questions au bon moment",
  "plus de 50 textes officiels et décisions, avec une recherche dans le texte",
  "le simulateur de grand oral et le sujet de la semaine",
];
const TARIFS_COURTS = "500\u00a0FCFA pour un jour, 2\u00a0000\u00a0FCFA pour une semaine, 5\u00a0000\u00a0FCFA pour un mois. Les formules longues reviennent moins cher : 12\u00a0500\u00a0FCFA les trois mois, 40\u00a0000\u00a0FCFA les douze mois.";
const PAIEMENT = "Réglez la formule choisie par Mobile Money (Orange Money, MTN MoMo, Wave ou Moov Money), puis saisissez la référence du paiement dans votre espace. Votre accès s'ouvre dès que nous avons vérifié le paiement.";
const lienWaTexte = (t: string) => `https://wa.me/${WA}?text=${encodeURIComponent(t)}`;

function suiviContact(c: Contact) {
  const prenom = c.prenom || "", vise = c.concours && NOMS_CONCOURS[c.concours] ? ` de ${NOMS_CONCOURS[c.concours]}` : "";
  const lien = lienDesinscriptionContact(c.jeton);
  const piedHtml = `Vous recevez cet e-mail parce que vous avez laissé votre adresse sur coursesesame.com et accepté de recevoir nos conseils et offres. Pour ne plus les recevoir : <a href="${lien}" style="color:#5b6475">se désinscrire</a>.`;
  const piedTexte = `Pour ne plus recevoir nos conseils et offres : ${lien}`;
  const test = c.source === "test" && c.resultat?.total ? c.resultat : null;
  if (c.etape === 1) {
    return rendre("Votre préparation : par où continuer", prenom, [
      test ? `Hier, vous avez passé notre test de niveau et obtenu ${test.note} sur ${test.total}. Pour progresser dans les matières où vous avez perdu des points, voici trois outils gratuits.`
        : "Hier, vous avez reçu une de nos fiches de révision. Pour continuer sur votre lancée, voici trois outils gratuits.",
      [
        `la question du jour, sur notre page d'accueil : une question par jour pour garder le rythme (${SITE}/)`,
        `nos QCM gratuits par matière, avec l'explication de chaque réponse (${SITE}/qcm/)`,
        `29 sujets corrigés : dissertations, cas pratiques, commentaires et sujets d'ordre général (${SITE}/sujets/)`,
      ],
      ...(test ? [] : [`Pour savoir où vous en êtes, faites aussi le test de niveau gratuit : 20 questions sur les matières du concours${vise}, avec votre note par matière.`,
        { bouton: "Faire le test de niveau", lien: `${SITE}/test-de-niveau/` }]),
      ...(test ? [{ bouton: "Voir les sujets corrigés", lien: `${SITE}/sujets/` }] : []),
      signature,
    ], piedHtml, piedTexte);
  }
  if (c.etape === 2) {
    return rendre("Composez un concours blanc, gratuitement", prenom, [
      "Le meilleur entraînement reste l'épreuve en conditions réelles. Nos concours blancs reproduisent les concours de Côte d'Ivoire sur des sujets inédits : 10 séries de la magistrature, 15 du Greffe, 15 du pénitentiaire, 15 de l'EPPJEJ et 15 de l'ENA.",
      "Le chronomètre démarre dès que vous entrez dans le sujet, sans retour en arrière. Chacun compose gratuitement ; le corrigé de chaque épreuve est réservé aux abonnés des formules d'une semaine et plus.",
      "Composez seul, sans document, comme le jour du concours : un résultat honnête vous dit exactement ce qu'il reste à travailler.",
      { bouton: "Choisir un concours blanc", lien: `${SITE}/concours-blancs/` },
      signature,
    ], piedHtml, piedTexte);
  }
  return rendre("L'espace abonnés, dès 500 FCFA", prenom, [
    `Depuis une semaine, vous avez découvert une partie de nos contenus. Pour préparer le concours${vise}, l'espace abonnés réunit tout le reste :`,
    CONTENU_ABONNES,
    `Les tarifs : ${TARIFS_COURTS}`,
    `Pour vous abonner, créez votre compte. ${PAIEMENT}`,
    { bouton: "Créer mon compte", lien: `${SITE}/espace-abonnes/` },
    { bouton: "Une question ? WhatsApp", lien: lienWaTexte("Bonjour, j'ai une question sur l'abonnement à l'espace abonnés."), wa: true },
    "Ce message est le dernier de cette série.",
    signature,
  ], piedHtml, piedTexte);
}

// Relance des inscrits qui n'ont jamais pris d'abonnement : r1 deux jours après l'inscription, r2 dix jours après
function relanceInscrit(prenom: string, d: Record<string, unknown>) {
  const jeton = String(d.jeton ?? ""), vise = NOMS_CONCOURS[String(d.concours ?? "")];
  const piedHtml = `${piedService} Vous pouvez <a href="${lienDesinscription(jeton)}" style="color:#5b6475">ne plus recevoir nos e-mails d'information</a>, ou changer ce choix dans votre espace, rubrique Mon compte.`;
  const piedTexte = `Ne plus recevoir nos e-mails d'information ${lienDesinscription(jeton)}`;
  const wa = { bouton: "Activer sur WhatsApp", lien: lienWaTexte("Bonjour, je souhaite activer mon abonnement à l'espace abonnés."), wa: true };
  if (d.cle === "r1") {
    return rendre("Votre compte est prêt, il reste une étape", prenom, [
      "Vous avez créé votre compte sur l'espace abonnés de coursesesame.com. Il ne reste qu'à choisir une formule pour ouvrir l'accès aux contenus.",
      `Les tarifs : ${TARIFS_COURTS}`,
      PAIEMENT,
      { bouton: "Choisir ma formule", lien: `${SITE}/espace-abonnes/` },
      wa,
      "Pour essayer avant de vous engager, la formule d'une semaine suffit à découvrir l'espace, corrigés des concours blancs compris.",
      signature,
    ], piedHtml, piedTexte);
  }
  return rendre("Ce qui vous attend dans l'espace abonnés", prenom, [
    `Votre compte est toujours prêt${vise ? ` pour préparer le concours de ${vise}` : ""}. Avec un abonnement, vous ouvrez :`,
    CONTENU_ABONNES,
    `En attendant, nos concours blancs restent gratuits à composer, chronomètre en marche : ${SITE}/concours-blancs/`,
    `Les tarifs : ${TARIFS_COURTS}`,
    PAIEMENT,
    { bouton: "Activer mon abonnement", lien: `${SITE}/espace-abonnes/` },
    wa,
    signature,
  ], piedHtml, piedTexte);
}
