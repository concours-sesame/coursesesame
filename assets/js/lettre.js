/* Inscription à la lettre d'information sans compte (formulaires [data-lettre]) : prénom, e-mail et concours,
   envoyés à la fonction fiche-offerte (action « lettre »), qui enregistre le contact et envoie l'e-mail de bienvenue. */
(function () {
  var URL_ = "https://iyftcjszvnaaakirlsdd.supabase.co/functions/v1/fiche-offerte";
  Array.prototype.forEach.call(document.querySelectorAll("form[data-lettre]"), function (f) {
    var etat = f.querySelector(".lettre-etat"), bouton = f.querySelector("button[type=submit]");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var corps = { action: "lettre", prenom: f.prenom.value, email: f.email.value, concours: f.concours.value, page: location.pathname };
      bouton.disabled = true; etat.textContent = "Inscription en cours…";
      fetch(URL_, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (x) {
          if (!x.ok) throw new Error(x.d && x.d.error || "Inscription impossible pour le moment.");
          f.reset();
          etat.textContent = x.d.deja ? "Cette adresse est déjà inscrite à notre lettre. Merci !" : "C'est fait. Un e-mail de bienvenue vient de partir : regardez aussi dans les courriers indésirables.";
        })
        .catch(function (err) { etat.textContent = err.message || "Inscription impossible pour le moment. Réessayez plus tard."; })
        .then(function () { bouton.disabled = false; });
    });
  });
})();
