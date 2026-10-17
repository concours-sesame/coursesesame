// Fonction « agent-revision » : rédaction intégrale ou correction notée sur 20 d'un cas pratique, d'une dissertation
// ou d'un commentaire d'article, à partir des contenus exclusifs (table « passages ») et de la méthode de l'éditeur
// (table « agent_consignes », jamais dans le dépôt). La réponse est envoyée au fil de sa rédaction, ligne par ligne
// au format JSON : { "t": "texte" } pendant la rédaction, puis { "fin": { ... } } ou { "erreur": "message" }.
//
// Déploiement : sans vérification de jeton par la plateforme. La fonction vérifie elle-même la session de l'appelant,
// son abonnement (formules d'un mois et plus), son appareil et son quota. Secret requis : ANTHROPIC_API_KEY.
// Seuls le sujet, la copie et les passages des ouvrages sont envoyés au modèle, jamais le nom, l'e-mail ou le téléphone.
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const EXERCICES: Record<string, string> = { cas_pratique: "Cas pratique", dissertation: "Dissertation juridique", commentaire: "Commentaire d'article" };
const MODES: Record<string, string> = { redaction: "Rédaction intégrale du corrigé", correction: "Correction de la copie, avec note sur 20" };
const MAX_JETONS = 6000;
const PASSAGES_MAX = 10, PASSAGE_CARACTERES = 2500, PASSAGES_CARACTERES = 22000;

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
const erreur = (message: string, statut = 400) => json({ error: message }, statut);
const texte = (v: unknown, max: number) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const cleApi = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const service = createClient(url, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });

  // L'appelant : session valide, puis droits vus par la base avec son propre jeton
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: appelant, error: errAppelant } = await service.auth.getUser(jeton);
  if (errAppelant || !appelant?.user) return erreur("Connexion requise.", 401);
  const uid = appelant.user.id;
  const lui = createClient(url, clePublique(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
  const [agent, admin, appareil] = await Promise.all([lui.rpc("mon_agent"), lui.rpc("est_admin"), lui.rpc("verifier_appareil")]);
  const etat = agent.data?.[0];
  if (agent.error || !etat) return erreur("Service momentanément indisponible.", 503);
  const estAdmin = admin.data === true;
  if (!estAdmin && appareil.data === false) return erreur("Votre compte est ouvert sur un autre appareil. Reconnectez-vous.", 403);
  if (!etat.acces) return erreur("L'agent de révision est réservé aux abonnements en cours d'un mois et plus.", 403);
  if (!etat.actif && !estAdmin) return erreur("L'agent de révision n'est pas encore ouvert.", 403);
  if (!cleApi) return erreur("L'agent de révision n'est pas encore activé.", 503);

  // La demande
  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return erreur("Requête invalide");
  }
  const exercice = String(d.exercice ?? ""), mode = String(d.mode ?? "");
  if (!EXERCICES[exercice] || !MODES[mode]) return erreur("Choisissez l'exercice et le type de demande.");
  const matiere = texte(d.matiere, 80), sujet = texte(d.sujet, 12000), copie = mode === "correction" ? texte(d.copie, 40000) : "";
  if (sujet.length < 10) return erreur("Indiquez le sujet complet (énoncé, article ou question).");
  if (mode === "correction" && copie.length < 200) return erreur("Collez votre copie (200 caractères au moins).");

  // Quotas et plafond de dépense du mois
  const [{ data: reglages }, { data: usage }] = await Promise.all([
    service.from("agent_reglages").select("*").maybeSingle(),
    service.rpc("agent_usage", { p_user: uid }),
  ]);
  const u = usage?.[0] ?? { jour: 0, mois: 0, depense_mois_fcfa: 0 };
  if (!reglages) return erreur("Service momentanément indisponible.", 503);
  if (!estAdmin) {
    if (u.jour >= reglages.quota_jour) return erreur(`Vous avez utilisé vos ${reglages.quota_jour} demandes du jour. Revenez demain.`, 429);
    if (u.mois >= reglages.quota_mois) return erreur(`Vous avez utilisé vos ${reglages.quota_mois} demandes du mois.`, 429);
    if (Number(u.depense_mois_fcfa) >= reglages.plafond_mois_fcfa) return erreur("L'agent de révision a atteint sa limite pour ce mois. Il rouvrira le mois prochain.", 429);
  }

  // Méthode de l'éditeur : consignes communes, puis celles de l'exercice
  const { data: consignes } = await service.from("agent_consignes").select("cle, texte").in("cle", ["commun", exercice]);
  const consigne = (cle: string) => consignes?.find((c) => c.cle === cle)?.texte ?? "";
  if (!consigne("commun") || !consigne(exercice)) return erreur("L'agent de révision n'est pas encore configuré.", 503);

  // Passages des ouvrages les plus proches du sujet (et du début de la copie)
  const { data: trouves } = await service.rpc("rechercher_passages", {
    p_texte: `${matiere} ${sujet} ${copie.slice(0, 3000)}`,
    p_ouvrages: true,
    p_matiere: matiere || null,
    p_nombre: PASSAGES_MAX,
  });
  const passages: { titre: string; page: number; texte: string }[] = [];
  let total = 0;
  for (const p of trouves ?? []) {
    const t = String(p.texte).slice(0, PASSAGE_CARACTERES);
    if (total + t.length > PASSAGES_CARACTERES) break;
    total += t.length;
    passages.push({ titre: p.titre, page: p.page, texte: t });
  }
  const sources = passages.map((p) => ({ titre: p.titre, page: p.page }));

  const { data: ligne, error: errLigne } = await service.from("agent_echanges")
    .insert({ user_id: uid, exercice, mode, matiere: matiere || null, sujet, copie: copie || null, sources, modele: reglages.modele })
    .select("id").single();
  if (errLigne || !ligne) return erreur("Service momentanément indisponible.", 503);

  const demande = [
    `<passages>\n${passages.length ? passages.map((p, i) => `[${i + 1}] ${p.titre}, page ${p.page}\n${p.texte}`).join("\n\n") : "Aucun passage trouvé dans les ouvrages pour ce sujet."}\n</passages>`,
    `<demande>\nExercice : ${EXERCICES[exercice]}\nType de demande : ${MODES[mode]}\n${matiere ? `Matière : ${matiere}\n` : ""}Sujet :\n${sujet}\n</demande>`,
    copie ? `<copie>\n${copie}\n</copie>` : "",
  ].filter(Boolean).join("\n\n");

  const appel = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cleApi, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: reglages.modele,
      max_tokens: MAX_JETONS,
      stream: true,
      system: [
        { type: "text", text: consigne("commun") },
        { type: "text", text: consigne(exercice), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: demande }],
    }),
  });
  if (!appel.ok || !appel.body) {
    console.error("Anthropic :", appel.status, (await appel.text()).slice(0, 500));
    await service.from("agent_echanges").update({ statut: "erreur" }).eq("id", ligne.id);
    return erreur("L'agent de révision n'a pas pu répondre. Réessayez dans quelques minutes.", 502);
  }

  // Relais au fil de l'eau ; l'échange est enregistré à la fin, même si l'abonné a fermé la page entre-temps
  const enc = new TextEncoder();
  const flux = new ReadableStream({
    async start(ctrl) {
      const envoyer = (o: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* page fermée */ } };
      let reponse = "", tampon = "", arret = "";
      const jetons = { entree: 0, sortie: 0, cache: 0, ecriture: 0 };
      try {
        const lecteur = appel.body!.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await lecteur.read();
          if (done) break;
          tampon += value;
          let i;
          while ((i = tampon.indexOf("\n")) >= 0) {
            const l = tampon.slice(0, i).trim();
            tampon = tampon.slice(i + 1);
            if (!l.startsWith("data:")) continue;
            let ev: Record<string, any>;
            try { ev = JSON.parse(l.slice(5)); } catch { continue; }
            if (ev.type === "message_start") {
              const us = ev.message?.usage ?? {};
              jetons.entree = us.input_tokens ?? 0;
              jetons.cache = us.cache_read_input_tokens ?? 0;
              jetons.ecriture = us.cache_creation_input_tokens ?? 0;
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              reponse += ev.delta.text;
              envoyer({ t: ev.delta.text });
            } else if (ev.type === "message_delta") {
              jetons.sortie = ev.usage?.output_tokens ?? jetons.sortie;
              arret = ev.delta?.stop_reason ?? arret;
            } else if (ev.type === "error") {
              throw new Error(ev.error?.message ?? "erreur du modèle");
            }
          }
        }
        // Note indicative, donnée par le modèle sur une dernière ligne [[NOTE: 12,5]] retirée de la réponse
        const m = reponse.match(/\[\[NOTE\s*:\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*\]\]/i);
        const note = m ? Math.min(20, Math.max(0, Number(m[1].replace(",", ".")))) : null;
        reponse = reponse.replace(/\s*\[\[NOTE\s*:[^\]]*\]\]\s*/gi, "\n").trim();
        const cout = ((jetons.entree * reglages.prix_entree_usd + jetons.sortie * reglages.prix_sortie_usd
          + jetons.cache * reglages.prix_cache_usd + jetons.ecriture * reglages.prix_entree_usd * 1.25) / 1e6) * reglages.taux_fcfa;
        await service.from("agent_echanges").update({
          reponse, note: mode === "correction" ? note : null, statut: reponse ? "termine" : "erreur",
          jetons_entree: jetons.entree + jetons.ecriture, jetons_sortie: jetons.sortie, jetons_cache: jetons.cache,
          cout_fcfa: Math.round(cout * 100) / 100,
        }).eq("id", ligne.id);
        envoyer({ fin: { id: ligne.id, note: mode === "correction" ? note : null, sources, tronque: arret === "max_tokens", reponse } });
      } catch (e) {
        console.error("Flux :", (e as Error).message);
        await service.from("agent_echanges").update({ statut: "erreur", reponse: reponse || null }).eq("id", ligne.id);
        envoyer({ erreur: "La rédaction a été interrompue. Réessayez dans quelques minutes." });
      }
      try { ctrl.close(); } catch { /* déjà fermé */ }
    },
  });
  return new Response(flux, { headers: { ...CORS, "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
});
