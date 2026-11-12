/* Essai gratuit de l'espace abonnés : l'annonce du site suit le réglage de l'administration.
   Chaque mention de l'essai existe en deux versions dans la page (data-si-essai et data-si-sans-essai).
   Quand la base répond que l'essai n'est plus proposé (fonction essai_ouvert), l'attribut data-essai="non" est posé
   sur <html> et la feuille de style montre la version sans essai. La réponse est gardée dix minutes dans ce
   navigateur, pour ne pas interroger la base à chaque page. Aucune donnée personnelle n'est envoyée. */
(function () {
  try {
    var URL_ = "https://iyftcjszvnaaakirlsdd.supabase.co", CLE = "sb_publishable_LuJ-9onygOrGouPTupJnPA_VzfefNtJ";
    var K = "sesame-essai", racine = document.documentElement, connu = null;
    var appliquer = function (ouvert) { if (ouvert) racine.removeAttribute("data-essai"); else racine.setAttribute("data-essai", "non"); };
    try { connu = JSON.parse(localStorage.getItem(K) || "null"); } catch (e) { connu = null; }
    if (connu && typeof connu.o === "boolean") {
      appliquer(connu.o);
      if (Date.now() - connu.t < 10 * 60 * 1000) return;
    }
    fetch(URL_ + "/rest/v1/rpc/essai_ouvert", { method: "POST", headers: { "apikey": CLE, "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (ouvert) {
        if (typeof ouvert !== "boolean") return;
        appliquer(ouvert);
        try { localStorage.setItem(K, JSON.stringify({ o: ouvert, t: Date.now() })); } catch (e) { /* stockage indisponible */ }
      })
      .catch(function () { /* hors connexion : la page garde sa version par défaut */ });
  } catch (e) { /* l'annonce ne doit jamais gêner la page */ }
})();
