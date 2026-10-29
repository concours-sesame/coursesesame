/* Test de niveau gratuit (page test-de-niveau/) : 20 questions tirées des QCM publics (assets/qj/test.json, écrit par
   tools/build.js), réparties entre les matières du concours choisi ; le résultat s'affiche une fois le prénom et un
   contact envoyés à la fonction fiche-offerte (action « test »), qui l'envoie aussi par e-mail. */
(function () {
  "use strict";
  const box = document.getElementById("testNiveau");
  if (!box) return;
  const URL_FONCTION = ESPACE_CONFIG.url + "/functions/v1/fiche-offerte";
  const NB = 20, prefix = box.dataset.prefix, LETTRES = "ABCD";
  const etapes = {};
  box.querySelectorAll(".test-etape").forEach(e => { etapes[e.dataset.etape] = e; });
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const melanger = a => { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const virgule = n => String(n).replace(".", ",");
  const voir = nom => {
    Object.keys(etapes).forEach(k => { etapes[k].hidden = k !== nom; });
    const haut = box.getBoundingClientRect().top;
    if (haut < 0 || haut > innerHeight * 0.6) box.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Contact déjà donné pendant cette visite : un nouveau test affiche son résultat directement
  let banque = null, concours = null, questions = [], choix = [], i = 0, contactDonne = false;

  // Tirage : les matières du concours à tour de rôle, une question au hasard à chaque tour, jusqu'à 20
  function tirer() {
    const themes = melanger(banque.filter(t => t.concours.includes(concours))
      .map(t => ({ reste: melanger(t.questions.map(q => Object.assign({ theme: t.nom, lien: t.lien }, q))) })));
    const liste = [];
    while (liste.length < NB && themes.some(t => t.reste.length)) {
      for (const t of themes) if (liste.length < NB && t.reste.length) liste.push(t.reste.pop());
    }
    return melanger(liste);
  }

  function afficherQuestion() {
    const q = questions[i];
    etapes.question.innerHTML = `<div class="qcm-card">
      <div class="cs-progress"><span>Question ${i + 1} sur ${questions.length}</span><i style="width:${((i + 1) / questions.length) * 100}%"></i></div>
      <span class="qcm-tag">${esc(q.theme)}</span>
      <h3>${esc(q.q)}</h3>
      <div class="qcm-opts">${q.options.map((o, k) => `<button class="qcm-opt" type="button" data-k="${k}"><span>${LETTRES[k]}</span>${esc(o)}</button>`).join("")}</div>
    </div>`;
  }

  etapes.debut.addEventListener("click", async e => {
    const b = e.target.closest("[data-concours]");
    if (!b) return;
    b.disabled = true;
    try {
      if (!banque) banque = await fetch(box.dataset.banque).then(r => { if (!r.ok) throw new Error(); return r.json(); });
    } catch (err) {
      b.disabled = false;
      alert("Les questions n'ont pas pu être chargées. Vérifiez votre connexion et réessayez.");
      return;
    }
    b.disabled = false;
    concours = b.dataset.concours;
    questions = tirer();
    choix = [];
    i = 0;
    afficherQuestion();
    voir("question");
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "test-niveau-debut " + concours, title: "test-niveau", event: true });
  });

  etapes.question.addEventListener("click", e => {
    const b = e.target.closest(".qcm-opt");
    if (!b) return;
    choix[i] = Number(b.dataset.k);
    i++;
    if (i < questions.length) { afficherQuestion(); return; }
    if (contactDonne) { afficherResultat(resultat()); return; }
    voir("contact");
    const p = document.getElementById("tPrenom");
    if (p) p.focus({ preventScroll: true });
  });

  function resultat() {
    const parTheme = new Map();
    questions.forEach((q, k) => {
      const t = parTheme.get(q.theme) || { nom: q.theme, lien: q.lien, bons: 0, total: 0 };
      t.total++;
      if (choix[k] === q.bonne) t.bons++;
      parTheme.set(q.theme, t);
    });
    const themes = [...parTheme.values()].sort((a, b) => a.bons / a.total - b.bons / b.total);
    const note = themes.reduce((n, t) => n + t.bons, 0);
    return { note, total: questions.length, themes };
  }

  function afficherResultat(r) {
    const sur20 = Math.round((r.note / r.total) * 40) / 2;
    const conseil = sur20 < 10
      ? "Les bases sont à consolider. Commencez par nos fiches de révision et nos QCM, matière par matière, en commençant par vos points faibles ci-dessous."
      : sur20 < 15
        ? "Vous avez de bonnes bases. Entraînez-vous maintenant sur nos sujets corrigés et nos concours blancs, pour passer de la connaissance à la copie."
        : "Très bon niveau. Pour viser le haut du classement, faites corriger vos copies et travaillez nos plans de dissertation, dans l'espace VIP.";
    const faibles = r.themes.filter(t => t.bons / t.total < 0.6);
    etapes.resultat.innerHTML = `<div class="test-note"><b>${virgule(sur20)}<small>/20</small></b><span>${r.note} bonne${r.note > 1 ? "s" : ""} réponse${r.note > 1 ? "s" : ""} sur ${r.total}</span></div>
      <p class="test-conseil">${conseil}</p>
      <h3>Matière par matière</h3>
      <ul class="test-themes">${r.themes.map(t => `<li><span>${esc(t.nom)}</span><i><i style="width:${Math.round((t.bons / t.total) * 100)}%"></i></i><b>${t.bons} sur ${t.total}</b></li>`).join("")}</ul>
      ${faibles.length ? `<p>À travailler en priorité : ${faibles.map(t => `<a href="${prefix}${t.lien}">${esc(t.nom)}</a>`).join(", ")}.</p>` : ""}
      <div class="essai-actions"><a class="btn btn-gold" href="${prefix}espace-abonnes/#inscription">S'abonner dès 500 FCFA la journée</a><button class="btn btn-ghost" type="button" data-refaire>Refaire un test</button></div>
      <h3>La correction</h3>
      <ol class="test-correction">${questions.map((q, k) => {
        const juste = choix[k] === q.bonne;
        return `<li class="${juste ? "juste" : "faux"}"><p class="test-cq"><span class="qcm-tag">${esc(q.theme)}</span> ${esc(q.q)}</p>
          <p>${juste ? "Bonne réponse" : `Votre réponse : ${esc(q.options[choix[k]])}. Bonne réponse`} : <b>${esc(q.options[q.bonne])}</b>.</p>
          <p class="test-expl">${esc(q.explication)}</p></li>`;
      }).join("")}</ol>`;
    voir("resultat");
  }

  etapes.resultat.addEventListener("click", e => {
    if (!e.target.closest("[data-refaire]")) return;
    voir("debut");
  });

  const form = document.getElementById("testForm");
  const etat = document.getElementById("testEtat");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    if (!d.prenom || !d.prenom.trim()) { etat.textContent = "Indiquez votre prénom."; return; }
    if (!d.email && !d.whatsapp) { etat.textContent = "Indiquez une adresse e-mail ou un numéro WhatsApp."; return; }
    const r = resultat();
    const bouton = form.querySelector("button[type=submit]");
    bouton.disabled = true;
    etat.textContent = "Envoi en cours…";
    let rep;
    try {
      rep = await fetch(URL_FONCTION, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ESPACE_CONFIG.cle },
        body: JSON.stringify({ action: "test", prenom: d.prenom, email: d.email, whatsapp: d.whatsapp, concours, accepte_offres: !!d.accepte_offres, page: location.pathname,
          resultat: { note: r.note, total: r.total, themes: r.themes.map(t => ({ nom: t.nom, bons: t.bons, total: t.total })) } })
      }).then(x => x.json().catch(() => ({ error: "Réponse illisible." })));
    } catch (err) {
      rep = { error: "Connexion impossible. Vérifiez votre réseau et réessayez." };
    }
    bouton.disabled = false;
    if (!rep.ok) { etat.textContent = rep.error || "Envoi impossible pour le moment."; return; }
    etat.textContent = "";
    contactDonne = true;
    afficherResultat(r);
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "test-niveau-resultat " + concours, title: "test-niveau", event: true });
  });
})();
