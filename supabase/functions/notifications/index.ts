// Fonction « notifications » : notifications Web Push des abonnés (sortie de la vidéo du jour, à 19 h).
// Appelable par la base seule (en-tête x-import, clé du coffre vérifiée par textes_verifier_import).
//   { action: "initialiser" } : crée une fois les clés VAPID et les range dans le coffre (push_vapid)
//   { action: "envoyer" }     : tâche planifiée ; si une vidéo du jour est sortie depuis moins de 40 minutes et n'a pas
//                               encore été annoncée, notification à chaque abonnement d'un abonné en cours ;
//                               les abonnements refusés par le navigateur (404, 410) sont effacés
import { createClient } from "npm:@supabase/supabase-js@2.117.0";
import webpush from "npm:web-push@3.6.7";

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
  let d: { action?: string };
  try {
    d = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }

  if (d.action === "initialiser") {
    const { data: deja } = await service.rpc("push_cles");
    if (deja?.publicKey) return json({ cle: deja.publicKey, creee: false });
    const cles = webpush.generateVAPIDKeys();
    const { data: ok, error } = await service.rpc("push_enregistrer_cles", { p_cles: cles });
    return error ? json({ error: error.message }, 500) : json({ cle: cles.publicKey, creee: ok });
  }

  if (d.action === "envoyer") {
    const { data: cles } = await service.rpc("push_cles");
    if (!cles?.publicKey) return json({ error: "Clés absentes : action initialiser d'abord." }, 409);
    webpush.setVapidDetails("mailto:infos@coursesesame.com", cles.publicKey, cles.privateKey);
    const maintenant = new Date(), depuis = new Date(Date.now() - 40 * 60 * 1000);
    const { data: videos } = await service.from("contenus").select("id, titre").eq("publie", true).eq("type", "video").eq("video_ouverte", true)
      .gte("publie_le", depuis.toISOString()).lte("publie_le", maintenant.toISOString()).order("publie_le", { ascending: false }).limit(1);
    const v = videos?.[0];
    if (!v) return json({ envoyes: 0, raison: "aucune vidéo du jour à annoncer" });
    // Réservation : une seule exécution annonce la vidéo
    const { data: prise } = await service.from("push_envois").upsert({ contenu_id: v.id }, { onConflict: "contenu_id", ignoreDuplicates: true }).select("contenu_id");
    if (!prise?.length) return json({ envoyes: 0, raison: "déjà annoncée" });
    const { data: dest } = await service.rpc("push_destinataires");
    const charge = JSON.stringify({ titre: "La vidéo du jour est en ligne", corps: v.titre, url: "/espace-abonnes/" });
    let envoyes = 0, echecs = 0;
    const perimes: number[] = [];
    for (const a of (dest ?? []) as { id: number; endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, charge, { TTL: 6 * 3600, urgency: "normal" });
        envoyes++;
      } catch (e) {
        echecs++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) perimes.push(a.id);
      }
    }
    if (perimes.length) await service.from("push_abonnements").delete().in("id", perimes);
    await service.from("push_envois").update({ envoyes, echecs }).eq("contenu_id", v.id);
    return json({ video: v.titre, envoyes, echecs, effaces: perimes.length });
  }
  return json({ error: "Action inconnue" }, 400);
});
