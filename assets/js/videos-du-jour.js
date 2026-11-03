/* Les vidéos du jour de l'espace abonnés, sur la page d'accueil.
   Chaque vidéo publiée sur TikTok (QCM, article, fiche ou notion du jour) entre le même jour dans l'espace abonnés,
   ouverte à tout abonné en cours, VIP ou non (contenus.video_ouverte).
   Ce module n'en montre que le titre, la matière et la date de sortie, lus par la fonction publique
   apercu_contenus, qui ne renvoie que les contenus déjà sortis. La vidéo elle-même reste réservée aux abonnés :
   son fichier n'est lisible qu'avec un abonnement en cours (règles de la base). */
(function () {
  var zone = document.querySelector("[data-videos-jour]");
  if (!zone || !window.fetch) return;
  var URL_ = "https://iyftcjszvnaaakirlsdd.supabase.co", CLE = "sb_publishable_LuJ-9onygOrGouPTupJnPA_VzfefNtJ";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var dateFr = function (iso) { var d = new Date(iso); return d.getUTCDate() + (d.getUTCDate() === 1 ? "er " : " ") + MOIS[d.getUTCMonth()]; };
  fetch(URL_ + "/rest/v1/rpc/apercu_contenus", {
    method: "POST", headers: { apikey: CLE, Authorization: "Bearer " + CLE, "Content-Type": "application/json" }, body: "{}"
  }).then(function (r) { return r.ok ? r.json() : []; }).then(function (liste) {
    var v = (liste || []).filter(function (c) { return c.type === "video" && c.video_ouverte; })
      .sort(function (a, b) { return a.publie_le < b.publie_le ? 1 : -1; }).slice(0, 6);
    if (!v.length) return;
    var cadenas = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    zone.querySelector("ul").innerHTML = v.map(function (c) {
      return '<li><a href="espace-abonnes/#inscription"><span class="vj-cadenas">' + cadenas + '</span><span class="vj-texte"><b>' + esc(c.titre) +
        '</b><small>' + esc(c.matiere || "") + " · sortie le " + dateFr(c.publie_le) + "</small></span></a></li>";
    }).join("");
    zone.hidden = false;
  }).catch(function () {});
})();
