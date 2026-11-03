/* Le QCM du jour (page qcm-du-jour/) : la question sortie le plus récemment, la même que dans la vidéo TikTok du
   jour, puis les questions précédentes. Une question sort à 19 h, heure d'Abidjan (UTC), le jour prévu ; les suivantes
   ne sont pas affichées. Données : assets/js/qcm-du-jour-donnees.js (généré par tools/build.js). */
(function () {
  var box = document.getElementById("qdjBox");
  if (!box || typeof QCM_DU_JOUR === "undefined") return;
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var sortie = function (q) { return new Date(q.jour + "T19:00:00Z").getTime(); };
  var dateFr = function (q) { var d = new Date(q.jour + "T12:00:00Z"); return d.getUTCDate() + (d.getUTCDate() === 1 ? "er " : " ") + MOIS[d.getUTCMonth()] + " " + d.getUTCFullYear(); };
  var sorties = QCM_DU_JOUR.filter(function (q) { return sortie(q) <= Date.now(); }).sort(function (a, b) { return b.n - a.n; });
  var lettres = "ABCD";
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  if (!sorties.length) {
    var premiere = QCM_DU_JOUR.slice().sort(function (a, b) { return a.n - b.n; })[0];
    box.innerHTML = '<div class="qcm-card"><span class="qcm-tag">Bientôt</span><h3>La première question du jour sort le ' + dateFr(premiere) +
      ' à 19 h.</h3><p>En attendant, entraînez-vous sur nos <a href="../qcm/">QCM gratuits par matière</a>.</p></div>';
    return;
  }
  function jouer(q) {
    box.innerHTML = '<div class="qcm-card"><span class="qcm-tag">Question n° ' + q.n + ' · ' + esc(q.matiere) + ' · ' + dateFr(q) + '</span><h3>' + esc(q.q) + '</h3>' +
      '<div class="qcm-opts">' + q.options.map(function (o, k) { return '<button class="qcm-opt" data-k="' + k + '"><span>' + lettres[k] + '</span>' + esc(o) + '</button>'; }).join("") +
      '</div><div class="qcm-expl" hidden></div></div>';
    Array.prototype.forEach.call(box.querySelectorAll(".qcm-opt"), function (b) {
      b.addEventListener("click", function () {
        var k = +b.getAttribute("data-k"), bon = k === q.bonne;
        Array.prototype.forEach.call(box.querySelectorAll(".qcm-opt"), function (x) {
          var j = +x.getAttribute("data-k"); x.disabled = true;
          if (j === q.bonne) x.classList.add("ok"); else if (j === k) x.classList.add("ko");
        });
        var ex = box.querySelector(".qcm-expl"), lien = location.href.split("#")[0] + "#q" + q.n;
        ex.hidden = false;
        ex.innerHTML = "<b>" + (bon ? "Bonne réponse !" : "Pas tout à fait. La bonne réponse est " + lettres[q.bonne] + ".") + "</b> " + esc(q.explication || "") +
          ' <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=' +
          encodeURIComponent("Le QCM du jour des Cours Sésame et SAJ : " + q.q + " À toi de répondre : " + lien) + '">Défier un ami sur WhatsApp</a>';
      });
    });
  }
  var m = location.hash.match(/^#q(\d+)$/), choisie = m && sorties.filter(function (q) { return q.n === +m[1]; })[0];
  jouer(choisie || sorties[0]);
  var autres = sorties.slice(1);
  if (autres.length) {
    document.getElementById("qdjListe").innerHTML = autres.map(function (q) {
      return '<li><a href="#q' + q.n + '"><span class="vj-texte"><b>' + esc(q.q) + '</b><small>' + esc(q.matiere) + " · " + dateFr(q) + "</small></span></a></li>";
    }).join("");
    document.getElementById("qdjArchives").hidden = false;
  }
  window.addEventListener("hashchange", function () {
    var m2 = location.hash.match(/^#q(\d+)$/), q2 = m2 && sorties.filter(function (q) { return q.n === +m2[1]; })[0];
    if (q2) { jouer(q2); box.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
})();
