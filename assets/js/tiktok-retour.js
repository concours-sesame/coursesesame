/* Page /tiktok/ : retour de TikTok après que l'éditeur a autorisé l'application « Cours Sésame et SAJ ».
   Le code et le jeton « state » reçus dans l'adresse sont transmis à la fonction tiktok, qui vérifie le jeton (créé
   depuis l'administration, valable 15 minutes), échange le code contre les jetons d'accès et les garde côté serveur. */
(function () {
  "use strict";
  const etat = document.getElementById("tiktokEtat");
  const p = new URLSearchParams(location.search);
  const code = p.get("code"), state = p.get("state"), refus = p.get("error");
  // L'adresse ne garde pas le code, à usage unique
  if (code || refus) history.replaceState(null, "", location.pathname);
  const dire = t => { if (etat) etat.textContent = t; };
  if (refus) { dire(`TikTok n'a pas donné l'autorisation (${p.get("error_description") || refus}). Recommencez depuis l'administration.`); return; }
  if (!code || !state) { dire("Aucune connexion en cours. Ouvrez la connexion depuis l'onglet TikTok de l'administration."); return; }
  fetch(`${ESPACE_CONFIG.url}/functions/v1/tiktok`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ESPACE_CONFIG.cle },
    body: JSON.stringify({ action: "retour", code, etat: state })
  })
    .then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => dire(ok ? `Compte TikTok connecté${d.nom ? ` : ${d.nom}` : ""}. Vous pouvez revenir à l'administration pour publier.` : (d.error || "La connexion a échoué.")))
    .catch(() => dire("Le serveur ne répond pas. Vérifiez votre connexion internet, puis recommencez depuis l'administration."));
})();
