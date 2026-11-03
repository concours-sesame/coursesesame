// Fonction « tiktok » : publie les vidéos des Cours Sésame et SAJ sur le compte TikTok de l'éditeur, par le Login Kit
// et la Content Posting API de TikTok for Developers.
//
// Clés de l'application TikTok : coffre de la base (tiktok_client_key, tiktok_client_secret), lues par tiktok_cles().
// Jetons du compte connecté : table tiktok_compte, jamais renvoyés au navigateur. Déploiement sans vérification de jeton
// par la plateforme : la fonction contrôle elle-même l'appelant.
//
// Requêtes : POST { action, ... }
//   Administrateur connecté (session validée par le code si la validation en deux étapes est activée) :
//     autoriser                 : adresse de la page d'autorisation TikTok (avec un jeton « state » de 15 minutes)
//     etat                      : compte connecté et informations du créateur (pseudonyme, confidentialités permises,
//                                 interactions désactivées, durée maximale), lues chez TikTok avant chaque publication
//     publier { id }            : envoie tout de suite une publication validée de tiktok_publications
//     statut { id }             : interroge TikTok sur le traitement d'une publication envoyée
//     deconnecter               : retire l'autorisation chez TikTok et efface les jetons
//   Page https://coursesesame.com/tiktok/ (retour de TikTok après autorisation, sans session) :
//     retour { code, etat }     : vérifie le jeton « state », échange le code contre les jetons, lit le nom du compte
//   Base (pg_cron toutes les cinq minutes, en-tête x-import vérifié par textes_verifier_import) :
//     planif                    : envoie les publications validées arrivées à leur heure (plus de trois heures de retard :
//                                 « manquee »), puis suit celles que TikTok traite encore
//     televersement { chemin }  : adresse de dépôt signée (deux heures) dans l'espace public « tiktok » (vidéos fabriquées
//                                 pour TikTok, par exemple qcm/qcm-du-jour-001.mp4), sans remplacement d'un fichier existant
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const API = "https://open.tiktokapis.com/v2";
const REDIRECTION = "https://coursesesame.com/tiktok/";
const AUTORISATIONS = "user.info.basic,video.publish,video.upload";
const SITE = "https://coursesesame.com/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json" } });
const erreur = (message: string, statut = 400) => reponse({ error: message }, statut);

function cleSecrete(): string {
  try {
    const cles = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (cles.default) return cles.default;
  } catch {
    // ancienne forme seulement
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
function niveauSession(jeton: string): string {
  try {
    return JSON.parse(atob(jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal ?? "aal1";
  } catch {
    return "aal1";
  }
}

// deno-lint-ignore no-explicit-any
type Service = any;
// deno-lint-ignore no-explicit-any
type Ligne = Record<string, any>;

async function cles(service: Service): Promise<{ client_key: string; client_secret: string }> {
  const { data } = await service.rpc("tiktok_cles");
  const c = Array.isArray(data) ? data[0] : data;
  if (!c?.client_key || !c?.client_secret) throw new Error("Clés de l'application TikTok absentes du coffre.");
  return c;
}

// Appel de l'API TikTok : réponse { data, error: { code, message } } ; code « ok » en cas de succès
async function api(chemin: string, jeton: string, corps?: unknown, methode = "POST") {
  const rep = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json; charset=UTF-8" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const r = await rep.json().catch(() => ({}));
  const code = r?.error?.code ?? (rep.ok ? "ok" : `http_${rep.status}`);
  if (code !== "ok") throw new Error(`TikTok : ${code}${r?.error?.message ? `, ${r.error.message}` : ""}`);
  return r.data ?? {};
}

// Échange de jetons (code d'autorisation ou jeton de renouvellement) : formulaire, pas de JSON
async function jetons(service: Service, params: Record<string, string>) {
  const c = await cles(service);
  const rep = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: c.client_key, client_secret: c.client_secret, ...params }),
  });
  const r = await rep.json().catch(() => ({}));
  if (!r?.access_token) throw new Error(`TikTok : ${r?.error ?? `http_${rep.status}`}${r?.error_description ? `, ${r.error_description}` : ""}`);
  const maintenant = Date.now();
  return {
    open_id: String(r.open_id ?? ""),
    scope: String(r.scope ?? ""),
    access_token: String(r.access_token),
    access_expire_le: new Date(maintenant + Number(r.expires_in ?? 86400) * 1000).toISOString(),
    refresh_token: String(r.refresh_token),
    refresh_expire_le: new Date(maintenant + Number(r.refresh_expires_in ?? 31536000) * 1000).toISOString(),
  };
}

// Jeton d'accès valable (renouvelé s'il expire dans moins de dix minutes)
async function jetonValide(service: Service): Promise<string> {
  const { data: compte } = await service.from("tiktok_compte").select("*").maybeSingle();
  if (!compte) throw new Error("Aucun compte TikTok connecté.");
  if (new Date(compte.access_expire_le).getTime() - Date.now() > 10 * 60 * 1000) return compte.access_token;
  if (new Date(compte.refresh_expire_le).getTime() < Date.now()) throw new Error("La connexion TikTok a expiré : reconnectez le compte.");
  const j = await jetons(service, { grant_type: "refresh_token", refresh_token: compte.refresh_token });
  await service.from("tiktok_compte").update({
    access_token: j.access_token, access_expire_le: j.access_expire_le,
    refresh_token: j.refresh_token, refresh_expire_le: j.refresh_expire_le, scope: j.scope || compte.scope,
  }).eq("id", true);
  return j.access_token;
}

const infoCreateur = (jeton: string) => api("/post/publish/creator_info/query/", jeton, {});

// Fichier de la vidéo : site public (assets/video/…), stockage public « tiktok » (tiktok/…) ou stockage privé (videos/…)
async function video(service: Service, source: string): Promise<Uint8Array> {
  if (source.startsWith("tiktok/")) {
    const { data, error } = await service.storage.from("tiktok").download(source.slice(7));
    if (error || !data) throw new Error(`Vidéo introuvable dans l'espace tiktok (${error?.message ?? "absente"}).`);
    return new Uint8Array(await data.arrayBuffer());
  }
  if (source.startsWith("assets/video/")) {
    const rep = await fetch(SITE + source);
    if (!rep.ok) throw new Error(`Vidéo introuvable sur le site (${rep.status}).`);
    return new Uint8Array(await rep.arrayBuffer());
  }
  const { data, error } = await service.storage.from("exclusif").download(source);
  if (error || !data) throw new Error(`Vidéo introuvable dans le stockage (${error?.message ?? "absente"}).`);
  return new Uint8Array(await data.arrayBuffer());
}

// Envoi d'une publication validée : informations du créateur, initialisation, dépôt du fichier par morceaux
async function envoyer(service: Service, ligne: Ligne): Promise<Ligne> {
  const { data: prise } = await service.from("tiktok_publications").update({ statut: "envoi", erreur: null })
    .eq("id", ligne.id).eq("statut", "programmee").select("*").maybeSingle();
  if (!prise) return { id: ligne.id, statut: ligne.statut, erreur: "Publication déjà envoyée ou non validée." };
  try {
    const jeton = await jetonValide(service);
    const createur = await infoCreateur(jeton);
    const fichier = await video(service, prise.source);
    const taille = fichier.byteLength;
    // Moins de 64 Mo : un seul morceau ; au-delà, morceaux de 10 Mo (le dernier prend le reste)
    const morceau = taille <= 64 * 1024 * 1024 ? taille : 10 * 1024 * 1024;
    const nombre = Math.max(1, Math.floor(taille / morceau));
    const source_info = { source: "FILE_UPLOAD", video_size: taille, chunk_size: morceau, total_chunk_count: nombre };
    let init;
    if (prise.mode === "brouillon") {
      init = await api("/post/publish/inbox/video/init/", jeton, { source_info });
    } else {
      const options: string[] = createur.privacy_level_options ?? [];
      let confidentialite = prise.confidentialite;
      // Publication validée d'avance (calendrier des vidéos du jour) : tant que TikTok n'autorise pas la publication
      // publique pour l'application (avant son audit), la vidéo part en « moi seul » plutôt que d'être perdue
      if (prise.automatique && confidentialite && !options.includes(confidentialite) && options.includes("SELF_ONLY")) confidentialite = "SELF_ONLY";
      if (!confidentialite || !options.includes(confidentialite)) {
        throw new Error(`Confidentialité « ${confidentialite ?? "non choisie"} » refusée par TikTok pour ce compte (permises : ${options.join(", ") || "aucune"}).`);
      }
      init = await api("/post/publish/video/init/", jeton, {
        post_info: {
          title: prise.legende,
          privacy_level: confidentialite,
          disable_comment: !prise.commentaires || !!createur.comment_disabled,
          disable_duet: !prise.duo || !!createur.duet_disabled,
          disable_stitch: !prise.collage || !!createur.stitch_disabled,
          video_cover_timestamp_ms: 3600,
          brand_content_toggle: !!prise.contenu_sponsorise,
          brand_organic_toggle: !!prise.marque_propre,
        },
        source_info,
      });
    }
    for (let i = 0; i < nombre; i++) {
      const debut = i * morceau, fin = i === nombre - 1 ? taille : debut + morceau;
      const rep = await fetch(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${debut}-${fin - 1}/${taille}` },
        body: fichier.slice(debut, fin),
      });
      if (![200, 201, 206].includes(rep.status)) throw new Error(`Dépôt de la vidéo refusé par TikTok (${rep.status}).`);
    }
    const { data: fait } = await service.from("tiktok_publications")
      .update({ statut: "traitement", publish_id: init.publish_id }).eq("id", prise.id).select("*").single();
    return fait;
  } catch (e) {
    const { data: rate } = await service.from("tiktok_publications")
      .update({ statut: "erreur", erreur: String((e as Error).message ?? e).slice(0, 500) }).eq("id", prise.id).select("*").single();
    return rate;
  }
}

// Suivi chez TikTok d'une publication envoyée
async function suivre(service: Service, ligne: Ligne): Promise<Ligne> {
  if (!ligne.publish_id) return ligne;
  const jeton = await jetonValide(service);
  const s = await api("/post/publish/status/fetch/", jeton, { publish_id: ligne.publish_id });
  let maj: Ligne = {};
  if (s.status === "PUBLISH_COMPLETE") {
    const ids = s.publicaly_available_post_id ?? s.publicly_available_post_id ?? [];
    maj = { statut: "publiee", publiee_le: new Date().toISOString(), post_id: ids.length ? String(ids[0]) : null };
  } else if (s.status === "SEND_TO_USER_INBOX") {
    maj = { statut: "brouillon_envoye", publiee_le: new Date().toISOString() };
  } else if (s.status === "FAILED") {
    maj = { statut: "erreur", erreur: `TikTok : ${s.fail_reason ?? "échec du traitement"}` };
  } else if (Date.now() - new Date(ligne.prevue_le).getTime() > 6 * 3600 * 1000) {
    maj = { statut: "erreur", erreur: `TikTok traite encore la vidéo après six heures (${s.status ?? "état inconnu"}).` };
  }
  if (!Object.keys(maj).length) return ligne;
  const { data } = await service.from("tiktok_publications").update(maj).eq("id", ligne.id).select("*").single();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return erreur("Méthode non autorisée", 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } });
  let d: Ligne;
  try {
    d = await req.json();
  } catch {
    return erreur("Requête invalide");
  }

  try {
    // Retour de TikTok après l'autorisation : appelé par la page /tiktok/ du site, protégé par le jeton « state »
    if (d.action === "retour") {
      const etat = String(d.etat ?? ""), code = String(d.code ?? "");
      if (!/^[0-9a-f]{64}$/.test(etat) || !code) return erreur("Retour de TikTok incomplet.");
      const { data: e } = await service.from("tiktok_etats").select("*").eq("etat", etat).maybeSingle();
      await service.from("tiktok_etats").delete().eq("etat", etat);
      if (!e || Date.now() - new Date(e.cree_le).getTime() > 15 * 60 * 1000) return erreur("Lien de connexion expiré : recommencez depuis l'administration.", 403);
      const j = await jetons(service, { grant_type: "authorization_code", code, redirect_uri: REDIRECTION });
      let nom = "", avatar = "";
      try {
        const u = await api("/user/info/?fields=open_id,avatar_url,display_name", j.access_token, undefined, "GET");
        nom = u.user?.display_name ?? "";
        avatar = u.user?.avatar_url ?? "";
      } catch {
        // le nom n'est pas indispensable
      }
      const { error } = await service.from("tiktok_compte").upsert({ id: true, ...j, nom, avatar, connecte_le: new Date().toISOString(), connecte_par: e.user_id });
      if (error) return erreur(`Base : ${error.message}`, 500);
      return reponse({ nom, autorisations: j.scope });
    }

    // Dépôt d'une vidéo fabriquée pour TikTok (appel de la base, même clé que planif)
    if (d.action === "televersement") {
      const { data: valide } = await service.rpc("textes_verifier_import", { p_cle: req.headers.get("x-import") ?? "" });
      if (valide !== true) return erreur("Accès refusé", 403);
      const chemin = String(d.chemin ?? "");
      if (!/^[a-z0-9-]+\/[a-z0-9-]+\.mp4$/.test(chemin)) return erreur("Chemin invalide.");
      const { data, error } = await service.storage.from("tiktok").createSignedUploadUrl(chemin);
      return error ? erreur(`Stockage ${error.message}`, 409) : reponse({ chemin, url: data.signedUrl });
    }

    // Tâche planifiée de la base
    if (d.action === "planif") {
      const { data: valide } = await service.rpc("textes_verifier_import", { p_cle: req.headers.get("x-import") ?? "" });
      if (valide !== true) return erreur("Accès refusé", 403);
      const maintenant = new Date().toISOString(), il3h = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      await service.from("tiktok_publications").update({ statut: "manquee", erreur: "Plus de trois heures de retard : non envoyée." })
        .eq("statut", "programmee").lt("prevue_le", il3h);
      // Sans compte TikTok connecté, rien n'est envoyé : les publications restent programmées (puis « manquée »
      // après trois heures de retard), au lieu de passer en erreur
      const { data: compte } = await service.from("tiktok_compte").select("id").maybeSingle();
      const { data: dues } = compte ? await service.from("tiktok_publications").select("*").eq("statut", "programmee")
        .lte("prevue_le", maintenant).order("prevue_le").limit(2) : { data: [] as Ligne[] };
      const envoyees = [];
      for (const l of dues ?? []) envoyees.push((await envoyer(service, l))?.statut);
      const { data: enCours } = await service.from("tiktok_publications").select("*").eq("statut", "traitement").order("prevue_le").limit(10);
      const suivies = [];
      for (const l of enCours ?? []) {
        try {
          suivies.push((await suivre(service, l))?.statut);
        } catch (e) {
          suivies.push(String((e as Error).message));
        }
      }
      return reponse({ envoyees, suivies });
    }

    // Administrateur
    const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: appelant, error: errAppelant } = await service.auth.getUser(jeton);
    if (errAppelant || !appelant?.user) return erreur("Connexion requise.", 401);
    const { data: estAdmin } = await service.from("admins").select("user_id").eq("user_id", appelant.user.id).maybeSingle();
    if (!estAdmin) return erreur("Accès réservé à l'administrateur.", 403);
    const deuxEtapes = (appelant.user.factors ?? []).some((f: Ligne) => f.status === "verified");
    if (deuxEtapes && niveauSession(jeton) !== "aal2") return erreur("Saisissez d'abord votre code de validation en deux étapes.", 403);

    if (d.action === "autoriser") {
      const etat = Array.from(crypto.getRandomValues(new Uint8Array(32)), (o) => o.toString(16).padStart(2, "0")).join("");
      await service.from("tiktok_etats").delete().lt("cree_le", new Date(Date.now() - 3600 * 1000).toISOString());
      const { error } = await service.from("tiktok_etats").insert({ etat, user_id: appelant.user.id });
      if (error) return erreur(`Base : ${error.message}`, 500);
      const c = await cles(service);
      const url = "https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({
        client_key: c.client_key, scope: AUTORISATIONS, response_type: "code", redirect_uri: REDIRECTION, state: etat,
      });
      return reponse({ url });
    }

    if (d.action === "etat") {
      const { data: compte } = await service.from("tiktok_compte")
        .select("open_id, nom, avatar, scope, access_expire_le, refresh_expire_le, connecte_le").maybeSingle();
      if (!compte) return reponse({ connecte: false });
      let createur = null, alerte = null;
      try {
        createur = await infoCreateur(await jetonValide(service));
      } catch (e) {
        alerte = String((e as Error).message);
      }
      return reponse({ connecte: true, compte: { ...compte, open_id: undefined }, createur, alerte });
    }

    if (d.action === "publier" || d.action === "statut") {
      const { data: ligne } = await service.from("tiktok_publications").select("*").eq("id", Number(d.id)).maybeSingle();
      if (!ligne) return erreur("Publication introuvable.", 404);
      const resultat = d.action === "publier" ? await envoyer(service, ligne) : await suivre(service, ligne);
      return reponse({ publication: resultat });
    }

    if (d.action === "deconnecter") {
      const { data: compte } = await service.from("tiktok_compte").select("access_token").maybeSingle();
      if (compte) {
        try {
          const c = await cles(service);
          await fetch(`${API}/oauth/revoke/`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_key: c.client_key, client_secret: c.client_secret, token: compte.access_token }),
          });
        } catch {
          // les jetons sont effacés de toute façon
        }
        await service.from("tiktok_compte").delete().eq("id", true);
      }
      return reponse({ deconnecte: true });
    }

    return erreur("Action inconnue");
  } catch (e) {
    return erreur(String((e as Error).message ?? e), 502);
  }
});
