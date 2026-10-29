/* Témoignage d'admis (page temoignage/) : envoi à la fonction deposer_temoignage de la base, sans compte.
   Rien n'est publié avant la validation de l'administrateur. */
(function () {
  "use strict";
  const form = document.getElementById("temoignageForm");
  if (!form) return;
  const etat = document.getElementById("temoignageEtat"), texte = form.texte, compte = document.getElementById("tgCompte");
  texte.addEventListener("input", () => { compte.textContent = texte.value.length; });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const manque = !d.prenom.trim() ? "votre prénom" : !d.nom.trim() ? "votre nom" : !d.concours ? "le concours réussi"
      : d.texte.trim().length < 40 ? "un témoignage de 40 caractères au moins" : d.contact.trim().length < 6 ? "un téléphone ou un e-mail" : "";
    if (manque) { etat.textContent = "Indiquez " + manque + "."; return; }
    if (!d.accord) { etat.textContent = "Cochez l'accord de publication pour envoyer votre témoignage."; return; }
    const bouton = form.querySelector("button[type=submit]");
    bouton.disabled = true;
    etat.textContent = "Envoi en cours…";
    let ok = false, msg = "";
    try {
      const r = await fetch(ESPACE_CONFIG.url + "/rest/v1/rpc/deposer_temoignage", {
        method: "POST",
        headers: { apikey: ESPACE_CONFIG.cle, "Content-Type": "application/json" },
        body: JSON.stringify({ p_prenom: d.prenom, p_nom: d.nom, p_contact: d.contact, p_concours: d.concours, p_annee: Number(d.annee),
          p_detail: d.detail || null, p_texte: d.texte, p_accord: true })
      });
      ok = r.ok;
      if (!ok) { const j = await r.json().catch(() => ({})); msg = j.message || ""; }
    } catch (err) {
      msg = "Connexion impossible. Vérifiez votre réseau et réessayez.";
    }
    bouton.disabled = false;
    if (!ok) { etat.textContent = /^(Cochez|Trop)/.test(msg) || msg.startsWith("Connexion") ? msg : "Envoi impossible : vérifiez les champs et réessayez."; return; }
    form.hidden = true;
    document.getElementById("temoignageOk").hidden = false;
  });
})();
