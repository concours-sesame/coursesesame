/* Fiche offerte (pages fiches/) : envoi du formulaire à la fonction fiche-offerte, qui renvoie un lien de
   téléchargement et l'envoie aussi par e-mail ; désinscription depuis le lien des e-mails (?desinscription=). */
(function () {
  "use strict";
  const URL_FONCTION = ESPACE_CONFIG.url + "/functions/v1/fiche-offerte";
  const appel = corps => fetch(URL_FONCTION, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ESPACE_CONFIG.cle },
    body: JSON.stringify(corps)
  }).then(r => r.json().catch(() => ({ error: "Réponse illisible." })));

  const form = document.getElementById("offerteForm");
  if (form) {
    const etat = document.getElementById("offerteEtat");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (!d.email && !d.whatsapp) { etat.textContent = "Indiquez une adresse e-mail ou un numéro WhatsApp."; return; }
      const bouton = form.querySelector("button[type=submit]");
      bouton.disabled = true;
      etat.textContent = "Envoi en cours…";
      let r;
      try {
        r = await appel({ fiche: Number(form.dataset.fiche), prenom: d.prenom, email: d.email, whatsapp: d.whatsapp, concours: d.concours, accepte_offres: !!d.accepte_offres, page: location.pathname });
      } catch (err) {
        r = { error: "Connexion impossible. Vérifiez votre réseau et réessayez." };
      }
      bouton.disabled = false;
      if (!r.ok) { etat.textContent = r.error || "Envoi impossible pour le moment."; return; }
      form.hidden = true;
      const ok = document.getElementById("offerteOk");
      ok.querySelector("a.btn-gold").href = r.lien;
      ok.querySelector("[data-email]").hidden = !d.email;
      ok.hidden = false;
      if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "fiche-offerte " + location.pathname, title: "fiche-offerte", event: true });
    });
  }

  const jeton = new URLSearchParams(location.search).get("desinscription");
  const zone = document.getElementById("desinscription");
  if (jeton && zone) {
    zone.hidden = false;
    appel({ action: "desinscrire", jeton }).then(r => {
      zone.textContent = r.ok ? "C'est noté : vous ne recevrez plus nos conseils ni nos offres." : (r.error || "Désinscription impossible. Écrivez-nous sur WhatsApp.");
    }).catch(() => { zone.textContent = "Désinscription impossible. Écrivez-nous sur WhatsApp."; });
  }
})();
