/* Calendrier des concours (page calendrier-des-concours/) : dates publiées par l'administrateur (fonction
   calendrier_publie), groupées par concours, chacune avec sa source. Les étapes passées depuis plus de 60 jours
   disparaissent d'elles-mêmes. */
(function () {
  "use strict";
  const zone = document.getElementById("calendrier");
  if (!zone) return;
  const NOMS = { infj: "Magistrature (INFJ)", greffe: "Greffe (INFJ)", penitentiaire: "Administration pénitentiaire (INFJ)", eppjej: "EPPJEJ (INFJ)", ena: "ENA", autre: "Autres concours" };
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const date = d => new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const auj = new Date().toISOString().slice(0, 10);
  const vide = msg => {
    const wa = zone.dataset.wa, texte = encodeURIComponent("Bonjour Les Cours Sésame et SAJ, je souhaite être prévenu(e) dès l'ouverture des inscriptions au concours suivant : ");
    zone.innerHTML = `<div class="calendrier-vide"><p>${msg}</p><a class="btn btn-wa" href="https://wa.me/${wa}?text=${texte}" target="_blank" rel="noopener">Être prévenu sur WhatsApp</a></div>`;
  };
  fetch(ESPACE_CONFIG.url + "/rest/v1/rpc/calendrier_publie", {
    method: "POST", headers: { apikey: ESPACE_CONFIG.cle, "Content-Type": "application/json" }, body: "{}"
  }).then(r => r.ok ? r.json() : Promise.reject()).then(lignes => {
    if (!Array.isArray(lignes) || !lignes.length) {
      vide("Les dates de la prochaine session n'ont pas encore été publiées officiellement. Nous les ajoutons ici dès la parution du communiqué : demandez à être prévenu sur WhatsApp.");
      return;
    }
    const groupes = new Map();
    lignes.forEach(l => { const k = l.concours + "|" + l.intitule; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(l); });
    zone.innerHTML = [...groupes.values()].map(g => `<article class="calendrier-concours"><h2><span>${esc(NOMS[g[0].concours] || g[0].concours)}</span>${esc(g[0].intitule)}</h2>
      <ol>${g.map(l => {
        const finie = (l.fin || l.debut) < auj, enCours = !finie && l.debut <= auj;
        return `<li class="${finie ? "passee" : enCours ? "en-cours" : "a-venir"}"><b>${esc(l.etape)}</b>
          <span class="cal-dates">${l.fin && l.fin !== l.debut ? `du ${date(l.debut)} au ${date(l.fin)}` : `le ${date(l.debut)}`}${enCours ? " · en cours" : finie ? " · terminé" : ""}</span>
          <small>Source : ${l.source_url ? `<a href="${esc(l.source_url)}" target="_blank" rel="noopener">${esc(l.source_nom)}</a>` : esc(l.source_nom)}</small></li>`;
      }).join("")}</ol></article>`).join("");
  }).catch(() => vide("Le calendrier n'a pas pu être chargé. Vérifiez votre connexion, ou demandez-nous les prochaines dates sur WhatsApp."));
})();
