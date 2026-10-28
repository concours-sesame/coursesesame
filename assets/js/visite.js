/* Suivi des visites, affiché en temps réel dans l'administration (onglet Visites).
   Chaque page vue est enregistrée avec un identifiant anonyme tiré au hasard et gardé dans ce navigateur,
   la page, le site de provenance (ou la marque de l'adresse, comme « fb=12 » pour une publication Facebook)
   et le type d'appareil. Si le visiteur est connecté à son compte abonné,
   la visite est rattachée à son compte. Aucune adresse IP n'est conservée. Les robots ne sont pas comptés. */
(function () {
  try {
    if (navigator.webdriver || /bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent)) return;
    var URL_ = "https://iyftcjszvnaaakirlsdd.supabase.co", CLE = "sb_publishable_LuJ-9onygOrGouPTupJnPA_VzfefNtJ";
    var K = "sesame-visiteur", id = localStorage.getItem(K);
    if (!/^[0-9a-f-]{36}$/.test(id || "")) {
      id = crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
        return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
      });
      localStorage.setItem(K, id);
    }
    var ref = document.referrer, prov = "";
    if (ref) { try { var h = new URL(ref).hostname; prov = h === location.hostname ? "(site)" : h.replace(/^www\./, ""); } catch (e) { prov = ""; } }
    // Une marque dans l'adresse l'emporte sur la page d'origine, que les applications (Facebook, WhatsApp) ne
    // transmettent pas toujours : « fb=<numéro> » vient d'une publication de la page Facebook, « utm_source » d'un
    // autre lien marqué
    var p = new URLSearchParams(location.search), fb = p.get("fb");
    if (fb !== null) prov = /^\d{1,9}$/.test(fb) ? "fb-" + fb : "facebook";
    else if (p.get("utm_source")) prov = p.get("utm_source").slice(0, 60);
    var appareil = /iPad|Tablet/i.test(navigator.userAgent) ? "tablette" : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "téléphone" : "ordinateur";
    var entetes = { "apikey": CLE, "Content-Type": "application/json" };
    // Session de l'espace abonnés, si elle est ouverte et encore valable
    try {
      var s = JSON.parse(localStorage.getItem("sesame-espace-abonnes") || "null");
      if (s && s.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now() + 5000)) entetes.Authorization = "Bearer " + s.access_token;
    } catch (e) { /* session illisible : visite anonyme */ }
    var corps = JSON.stringify({ p_visiteur: id, p_page: location.pathname + location.hash.replace(/^#(epreuve|connexion|inscription).*/, ""), p_provenance: prov, p_appareil: appareil });
    var envoyer = function (h) { return fetch(URL_ + "/rest/v1/rpc/enregistrer_visite", { method: "POST", headers: h, body: corps, keepalive: true }); };
    envoyer(entetes).then(function (r) {
      // Jeton refusé (session expirée côté serveur) : la visite est enregistrée comme anonyme
      if (r.status === 401 && entetes.Authorization) { delete entetes.Authorization; envoyer(entetes); }
    }).catch(function () {});
  } catch (e) { /* le suivi ne doit jamais gêner la page */ }
})();
