/* Espace abonnés des Cours Sésame et SAJ : connexion, inscription, état de l'abonnement
   et bibliothèque des contenus exclusifs, avec mention au nom de l'abonné sur les vidéos et documents.
   Les données et les règles d'accès sont dans Supabase (supabase/migrations) ; la configuration dans
   espace-config.js. Ce fichier expose aussi des outils communs (window.Espace) pour la page d'administration. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROOT = document.body.dataset.root || "";
  const CONF = typeof ESPACE_CONFIG !== "undefined" ? ESPACE_CONFIG : {};
  const OUVERT = !!(CONF.url && CONF.cle && window.supabase);
  const client = OUVERT ? window.supabase.createClient(CONF.url, CONF.cle, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "sesame-espace-abonnes" }
  }) : null;

  /* ---------- Outils ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const versDate = d => new Date(String(d).length === 10 ? d + "T00:00:00Z" : d);
  const dateFr = d => (d ? DATE.format(versDate(d)) : "");
  // Date du jour à Abidjan (UTC toute l'année), au format AAAA-MM-JJ
  const auj = () => new Date().toISOString().slice(0, 10);
  const joursJusqua = d => Math.round((versDate(d) - versDate(auj())) / 864e5);
  // Espaces insécables : « 15 000 FCFA » ne se coupe jamais en fin de ligne
  const fcfa = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0FCFA";
  const WA_NUM = typeof WA !== "undefined" ? WA : "2250160860537";
  // Numéro ivoirien à 10 chiffres : indicatif 225 ajouté pour WhatsApp
  const numeroWa = tel => { let d = String(tel || "").replace(/\D/g, ""); if (d.length === 10) d = "225" + d; return d; };
  const lienWa = (num, msg) => `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  // Un QCM est enregistré comme un contenu « texte » dont le texte est un objet JSON { "qcm": { "duree": minutes, "questions": [...] } }
  const lireQcm = c => { if (c.type !== "texte" || !/^\s*\{/.test(c.texte || "")) return null; try { const o = JSON.parse(c.texte); return o && o.qcm && Array.isArray(o.qcm.questions) ? o.qcm : null; } catch (e) { return null; } };
  const typeAffiche = c => lireQcm(c) ? { nom: "QCM", pluriel: "QCM", action: "S'entraîner" } : (TYPES[c.type] || TYPES.texte);
  const TYPES = {
    video: { nom: "Vidéo", pluriel: "Vidéos", action: "Regarder" },
    pdf: { nom: "Document", pluriel: "Documents", action: "Ouvrir le document" },
    texte: { nom: "Fiche", pluriel: "Fiches", action: "Lire la fiche" },
    lien: { nom: "Lien", pluriel: "Liens", action: "Ouvrir le lien" }
  };
  const CONC = (window.SESAME && window.SESAME.CONCOURS) || [];
  const nomConcours = id => (CONC.find(c => c.id === id) || {}).court || (id === "autre" ? "Autre concours" : id);
  const icone = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

  function messageErreur(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || "");
    if (/Invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
    if (/Email not confirmed/i.test(m)) return "Ce compte n'est pas encore confirmé. Écrivez-nous sur WhatsApp.";
    if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Patientez quelques minutes, puis réessayez.";
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "Connexion impossible. Vérifiez votre accès à Internet, puis réessayez.";
    if (/same.*password|different from the old/i.test(m)) return "Choisissez un mot de passe différent de l'actuel.";
    if (/password/i.test(m) && /(least|short|weak|characters)/i.test(m)) return "Mot de passe trop court ou trop simple (8 caractères au moins).";
    if (/JWT|session|not authenticated/i.test(m)) return "Votre session a expiré. Reconnectez-vous.";
    return m || "Une erreur est survenue. Réessayez.";
  }
  // Message d'erreur renvoyé par une fonction Supabase (corps JSON { error })
  async function erreurFonction(error) {
    try { const j = await error.context.json(); return j.error || messageErreur(error); } catch (e) { return messageErreur(error); }
  }
  let toastTimer;
  function toast(texte) {
    const t = $("#toast");
    if (!t) return;
    $("#toastText").textContent = texte;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }
  function chargerScript(src) {
    return new Promise((ok, ko) => {
      if ([...document.scripts].some(s => s.src.endsWith(src))) return ok();
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => ko(new Error("Chargement impossible : " + src));
      document.head.appendChild(s);
    });
  }
  // Mise en forme d'une fiche : paragraphes, intertitres (« ## »), gras (**…**). Tout est échappé avant.
  function mettreEnForme(t) {
    return esc(t).split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b =>
      /^##\s/.test(b) ? `<h4>${b.replace(/^##\s+/, "")}</h4>` : `<p>${b.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
  }
  const lienSur = u => /^https?:\/\//i.test(String(u || ""));

  /* ---------- Lecture des PDF dans la page, sans téléchargement ni copie ---------- */
  // Chaque page est dessinée en image (pas de texte sélectionnable), avec le nom de l'abonné incrusté.
  const PDFJS = ROOT + "assets/vendor/pdfjs-3.11.174/";
  async function afficherPdf(octets, zone, marque) {
    await chargerScript(PDFJS + "pdf.min.js");
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
    const doc = await lib.getDocument({ data: octets, isEvalSupported: false, enableXfa: false }).promise;
    zone.innerHTML = "";
    const mention = `Réservé à ${marque} · Les Cours Sésame et SAJ · Reproduction interdite`;
    const dessiner = async (n, canvas) => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const largeur = Math.min(zone.clientWidth || 800, 1100);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const vue = page.getViewport({ scale: (largeur / base.width) * ratio });
      canvas.width = Math.floor(vue.width); canvas.height = Math.floor(vue.height);
      canvas.style.aspectRatio = `${vue.width} / ${vue.height}`;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vue }).promise;
      // Nom de l'abonné en diagonale et mention en bas de page, incrustés dans l'image
      const w = canvas.width, h = canvas.height, angle = -Math.atan2(h, w);
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.rotate(angle);
      ctx.font = `800 ${Math.round(Math.min(w, h) / 14)}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(15,42,92,.13)";
      ctx.fillText(marque, 0, 0);
      ctx.restore();
      ctx.font = `600 ${Math.max(10, Math.round(w / 95))}px sans-serif`;
      ctx.fillStyle = "rgba(60,60,75,.85)";
      ctx.fillText(mention, Math.round(w * 0.02), h - Math.round(h * 0.012));
      page.cleanup();
    };
    // Ouvrages de plusieurs centaines de pages : chaque page garde sa place, n'est dessinée qu'à l'approche
    // et libérée une fois loin de l'écran, pour ne pas saturer la mémoire d'un téléphone.
    const p1 = (await doc.getPage(1)).getViewport({ scale: 1 });
    const total = doc.numPages;
    if (total > 3) {
      const barre = document.createElement("div");
      barre.className = "ea-pdf-barre";
      barre.innerHTML = `<span>${total} pages</span><label>Aller à la page <input type="number" min="1" max="${total}" inputmode="numeric" value="1"></label>`;
      zone.appendChild(barre);
      const champ = $("input", barre);
      const aller = () => { const n = Math.min(total, Math.max(1, Math.round(+champ.value || 1))); champ.value = n; const c = zone.querySelector(`canvas[data-page="${n}"]`); if (c) c.scrollIntoView({ block: "start" }); };
      champ.addEventListener("change", aller);
      champ.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); aller(); } });
    }
    const vider = c => { if (c.dataset.fait) { c.width = 1; c.height = 1; delete c.dataset.fait; } };
    const observateur = "IntersectionObserver" in window ? new IntersectionObserver(entrees => {
      entrees.forEach(e => {
        const c = e.target;
        if (!e.isIntersecting) { vider(c); return; }
        if (c.dataset.fait) return;
        c.dataset.fait = "1";
        dessiner(+c.dataset.page, c).catch(() => { delete c.dataset.fait; });
      });
    }, { root: zone.closest(".ea-v-boite"), rootMargin: "1500px 0px" }) : null;
    for (let n = 1; n <= total; n++) {
      const canvas = document.createElement("canvas");
      canvas.className = "ea-page";
      canvas.dataset.page = n;
      canvas.width = 1; canvas.height = 1;
      canvas.style.aspectRatio = `${p1.width} / ${p1.height}`;
      canvas.setAttribute("aria-label", `Page ${n} sur ${total}`);
      zone.appendChild(canvas);
      if (observateur) observateur.observe(canvas); else if (n <= 30) await dessiner(n, canvas);
    }
    return doc;
  }

  // Protections pendant la lecture : pas de clic droit, de sélection, de copie, d'enregistrement ni d'impression
  const bloquer = e => { if (visionneuse && !visionneuse.hidden && visionneuse.contains(e.target)) e.preventDefault(); };
  ["contextmenu", "copy", "cut", "selectstart", "dragstart"].forEach(t => document.addEventListener(t, bloquer, true));
  document.addEventListener("keydown", e => {
    if (!visionneuse || visionneuse.hidden) return;
    const k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["s", "p", "c", "x", "a", "u"].includes(k)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---------- QCM chronométré ---------- */
  let minuterieQcm;
  function lancerQcm(qcm, corps, marque) {
    const melanger = t => { const a = t.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const duree = Math.max(1, Math.round(qcm.duree || qcm.questions.length));
    const accueil = () => {
      clearInterval(minuterieQcm);
      corps.innerHTML = `<div class="qz-accueil"><p><b>${qcm.questions.length} questions</b> · ${duree} minutes</p>
          <p>Une seule bonne réponse par question. À la fin du temps, vos réponses sont corrigées automatiquement, avec l'explication et la référence de chaque question.</p>
          <button class="btn btn-gold" type="button" data-qz="go">Commencer le QCM</button></div>
        <p class="ea-mention">QCM réservé à ${esc(marque)}. Reproduction et diffusion interdites.</p>`;
    };
    let ordre = [], fin = 0;
    const corriger = () => {
      clearInterval(minuterieQcm);
      let bons = 0;
      ordre.forEach((q, i) => {
        const bloc = $(`[data-qi="${i}"]`, corps), choix = $(`input[name="qz${i}"]:checked`, corps);
        const rep = choix ? +choix.value : -1, ok = rep === q.bonne;
        if (ok) bons++;
        bloc.classList.add(ok ? "qz-ok" : "qz-ko");
        $$("input", bloc).forEach(x => { x.disabled = true; });
        $$("label", bloc).forEach((l, k) => { if (k === q.bonne) l.classList.add("qz-bonne"); else if (k === rep) l.classList.add("qz-fausse"); });
        bloc.insertAdjacentHTML("beforeend", `<div class="qz-expli"><b>${ok ? "Bonne réponse." : rep < 0 ? "Sans réponse." : "Réponse inexacte."}</b> ${esc(q.explication || "")}${q.reference ? `<small>${esc(q.reference)}</small>` : ""}</div>`);
      });
      const bas = $(".ea-v-actions", corps); if (bas) bas.remove();
      const pct = Math.round((100 * bons) / ordre.length);
      $(".qz-barre", corps).innerHTML = `<span class="qz-score">Score : ${bons} / ${ordre.length} (${pct} %)</span><span>${pct >= 80 ? "Excellent niveau." : pct >= 60 ? "Bon niveau, continuez." : "Revoyez les points corrigés ci-dessous."}</span><button class="btn btn-gold btn-sm" type="button" data-qz="go">Recommencer</button>`;
      $(".qz-barre", corps).scrollIntoView({ block: "start" });
    };
    const demarrer = () => {
      ordre = melanger(qcm.questions);
      fin = Date.now() + duree * 60000;
      corps.innerHTML = `<div class="qz-barre"><span class="qz-temps" aria-live="off"></span><span>${ordre.length} questions</span><button class="btn btn-gold btn-sm" type="button" data-qz="fin">Valider mes réponses</button></div>
        <ol class="qz-liste">${ordre.map((q, i) => `<li class="qz-q" data-qi="${i}"><p>${esc(q.q)}</p>${q.options.map((o, k) => `<label><input type="radio" name="qz${i}" value="${k}"> <span>${esc(o)}</span></label>`).join("")}</li>`).join("")}</ol>
        <div class="ea-v-actions"><button class="btn btn-navy" type="button" data-qz="fin">Valider mes réponses</button></div>
        <p class="ea-mention">QCM réservé à ${esc(marque)}. Reproduction et diffusion interdites.</p>`;
      const tic = () => {
        const r = Math.max(0, fin - Date.now()), m = Math.floor(r / 60000), sec = Math.floor((r % 60000) / 1000);
        const t = $(".qz-temps", corps); if (t) t.textContent = `Temps restant ${m}:${String(sec).padStart(2, "0")}`;
        if (r <= 0) corriger();
      };
      tic(); minuterieQcm = setInterval(tic, 1000);
    };
    corps.onclick = e => {
      const b = e.target.closest("[data-qz]");
      if (!b) return;
      if (b.dataset.qz === "go") demarrer();
      else if (b.dataset.qz === "fin" && $(".qz-temps", corps)) corriger();
    };
    accueil();
  }

  /* ---------- Visionneuse des contenus ---------- */
  let visionneuse, retourFocus, minuterieMarque, docOuvert;
  function fermerVisionneuse() {
    if (!visionneuse || visionneuse.hidden) return;
    const v = $("video", visionneuse);
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
    clearInterval(minuterieMarque);
    clearInterval(minuterieQcm);
    const cv = $("#eaVCorps"); if (cv) cv.onclick = null;
    if (docOuvert) { docOuvert.destroy(); docOuvert = null; }
    $("#eaVCorps").innerHTML = "";
    visionneuse.hidden = true;
    document.body.style.overflow = "";
    document.body.classList.remove("ea-lecture");
    if (retourFocus) retourFocus.focus();
  }
  function creerVisionneuse() {
    visionneuse = document.createElement("div");
    visionneuse.className = "ea-visionneuse";
    visionneuse.hidden = true;
    visionneuse.innerHTML = `<div class="ea-v-boite" role="dialog" aria-modal="true" aria-labelledby="eaVTitre">
        <button class="ea-v-fermer" type="button" aria-label="Fermer">${icone("i-x")}</button>
        <span class="ea-type" id="eaVType"></span>
        <h3 id="eaVTitre"></h3>
        <p class="ea-v-desc" id="eaVDesc"></p>
        <div class="ea-v-corps" id="eaVCorps"></div>
      </div>`;
    document.body.appendChild(visionneuse);
    $(".ea-v-fermer", visionneuse).addEventListener("click", fermerVisionneuse);
    visionneuse.addEventListener("click", e => { if (e.target === visionneuse) fermerVisionneuse(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") fermerVisionneuse(); });
  }
  // Appelée quand un fichier est refusé (page de l'espace abonnés : contrôle de l'appareil)
  let surRefus = null;
  // marque : texte affiché sur la vidéo et porté sur les documents (nom et téléphone de l'abonné)
  async function ouvrirContenu(c, marque) {
    if (!visionneuse) creerVisionneuse();
    retourFocus = document.activeElement;
    const t = typeAffiche(c);
    $("#eaVType").className = "ea-type ea-type-" + c.type;
    $("#eaVType").textContent = t.nom;
    $("#eaVTitre").textContent = c.titre;
    $("#eaVDesc").textContent = c.description || "";
    $("#eaVDesc").hidden = !c.description;
    const corps = $("#eaVCorps");
    corps.innerHTML = `<p class="ea-attente">Chargement…</p>`;
    visionneuse.hidden = false;
    document.body.style.overflow = "hidden";
    document.body.classList.add("ea-lecture");
    $(".ea-v-fermer", visionneuse).focus();

    const qcm = lireQcm(c);
    if (qcm) { lancerQcm(qcm, corps, marque); return; }
    if (c.type === "texte") {
      corps.innerHTML = `<div class="ea-fiche">${mettreEnForme(c.texte || "")}</div><p class="ea-mention">Fiche réservée à ${esc(marque)}. Reproduction et diffusion interdites.</p>`;
      return;
    }
    if (c.type === "lien") {
      corps.innerHTML = lienSur(c.lien)
        ? `<a class="btn btn-gold" href="${esc(c.lien)}" target="_blank" rel="noopener noreferrer">${t.action}${icone("i-arrow")}</a><p class="ea-mention">Lien réservé aux abonnés : merci de ne pas le partager.</p>`
        : `<p class="ea-erreur">Ce lien n'est pas valide.</p>`;
      return;
    }
    const duree = c.type === "video" ? 4 * 3600 : 60;
    const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, duree);
    if (error || !data) { corps.innerHTML = `<p class="ea-erreur">Ce contenu n'est pas accessible. Si votre abonnement est actif, rechargez la page.</p>`; if (surRefus) surRefus(); return; }

    if (c.type === "video") {
      corps.innerHTML = `<div class="ea-lecteur">
          <video controls playsinline preload="metadata" controlslist="nodownload nofullscreen" disablepictureinpicture src="${esc(data.signedUrl)}"></video>
          <span class="ea-marque" aria-hidden="true">${esc(marque)}</span>
          <button class="ea-plein" type="button" aria-label="Plein écran"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
        </div><p class="ea-mention">Vidéo réservée à ${esc(marque)}. Merci de ne pas la diffuser.</p>`;
      const lecteur = $(".ea-lecteur", corps), video = $("video", corps), m = $(".ea-marque", corps);
      video.addEventListener("contextmenu", e => e.preventDefault());
      // La mention change de place régulièrement, pour rester visible sur une capture
      const deplacer = () => { m.style.left = 6 + Math.random() * 52 + "%"; m.style.top = 8 + Math.random() * 74 + "%"; };
      deplacer();
      minuterieMarque = setInterval(deplacer, 12000);
      $(".ea-plein", corps).addEventListener("click", () => {
        if (document.fullscreenElement) return document.exitFullscreen();
        if (lecteur.requestFullscreen) lecteur.requestFullscreen().catch(() => {});
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      });
      video.play().catch(() => {});
      return;
    }
    // Document PDF : lu dans la page, à son nom, sans téléchargement possible
    corps.innerHTML = `<div class="ea-pdf" aria-live="polite"><p class="ea-attente">Ouverture du document…</p></div>
      <p class="ea-mention">Document réservé à ${esc(marque)}. Lecture en ligne seulement : téléchargement, copie et impression désactivés.</p>`;
    try {
      const r = await fetch(data.signedUrl);
      if (!r.ok) throw new Error("Lecture impossible");
      const octets = new Uint8Array(await r.arrayBuffer());
      if (visionneuse.hidden) return;
      docOuvert = await afficherPdf(octets, $(".ea-pdf", corps), marque);
    } catch (e) {
      $(".ea-pdf", corps).innerHTML = `<p class="ea-erreur">Le document n'a pas pu être ouvert. Réessayez.</p>`;
    }
  }

  /* ---------- Validation en deux étapes (administrateurs) ---------- */
  // Après le mot de passe, un administrateur qui a activé la validation en deux étapes saisit le code à 6 chiffres
  // de son application d'authentification ; sans ce code, la base lui refuse les droits d'administrateur.
  // Renvoie "code" si ce code est attendu, "ok" si la session est déjà validée, "aucun" si rien n'est activé.
  async function etapeCode() {
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return "ok";
    if (data.currentLevel === "aal2") return "ok";
    return data.nextLevel === "aal2" ? "code" : "aucun";
  }
  // Affiche le formulaire du code dans « zone » ; la promesse est tenue quand le code est accepté
  function formulaireCode(zone) {
    return new Promise(tenir => {
      zone.innerHTML = `<div class="ea-auth"><form class="form ea-form" id="eaCode" novalidate>
          <h3 class="full">Validation en deux étapes</h3>
          <p class="ea-aide full">Ouvrez votre application d'authentification et saisissez le code à 6 chiffres affiché pour « Les Cours Sésame et SAJ ».</p>
          <div class="field full"><label for="eaCodeChiffres">Code à 6 chiffres</label><input id="eaCodeChiffres" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
          <p class="ea-msg" role="alert"></p>
          <button class="btn btn-navy" type="submit">Valider</button>
          <button class="btn btn-ghost" type="button" data-code="sortir">Se déconnecter</button>
        </form></div>`;
      const f = $("#eaCode", zone), msg = $(".ea-msg", f), champ = $("#eaCodeChiffres", f);
      champ.focus();
      $("[data-code=sortir]", f).addEventListener("click", () => client.auth.signOut());
      f.addEventListener("submit", async e => {
        e.preventDefault();
        e.stopPropagation();
        const code = champ.value.replace(/\D/g, "");
        if (code.length !== 6) { msg.textContent = "Le code compte 6 chiffres."; return; }
        const bouton = $("button[type=submit]", f);
        bouton.disabled = true;
        const { data: l } = await client.auth.mfa.listFactors();
        const facteur = ((l && l.totp) || []).find(x => x.status === "verified");
        const { error } = facteur ? await client.auth.mfa.challengeAndVerify({ factorId: facteur.id, code }) : { error: new Error("Aucune application d'authentification n'est associée à ce compte.") };
        bouton.disabled = false;
        if (error) { msg.textContent = /invalid|expired|code/i.test(error.message || "") ? "Code incorrect ou expiré. Saisissez le code affiché en ce moment." : messageErreur(error); champ.select(); return; }
        tenir();
      });
    });
  }

  window.Espace = { client, OUVERT, esc, dateFr, auj, joursJusqua, fcfa, WA_NUM, numeroWa, lienWa, TYPES, CONC, nomConcours, icone, messageErreur, erreurFonction, toast, ouvrirContenu, lienSur, etapeCode, formulaireCode };

  /* =====================================================================
     Page de l'espace abonnés
     ===================================================================== */
  const racine = $("#espace");
  if (!racine) return;
  const marqueDe = p => `${p.prenom} ${p.nom} · ${p.telephone}`;
  let etat = {};
  // Un compte ne s'utilise que sur un appareil à la fois (voir supabase/migrations/…_un_appareil_a_la_fois.sql) :
  // une connexion sur un autre appareil déconnecte celui-ci, avec un message au retour sur le formulaire.
  let avisAppareil = false;
  async function ecarterAppareil() {
    avisAppareil = true;
    etat = { session: null };
    fermerVisionneuse();
    await client.auth.signOut({ scope: "local" });
  }
  async function controlerAppareil() {
    if (!etat.session || etat.admin || etat.codeAttendu || document.hidden) return;
    const { data, error } = await client.rpc("verifier_appareil");
    if (!error && data === false) { await ecarterAppareil(); afficher("connexion"); }
  }

  if (!OUVERT) {
    racine.innerHTML = `<div class="ea-carte-info"><h3>L'espace abonnés ouvre bientôt.</h3><p>Écrivez-nous sur WhatsApp pour être prévenu de son ouverture.</p><a class="btn btn-wa" href="${lienWa(WA_NUM, "Bonjour Les Cours Sésame & SAJ, je souhaite être prévenu de l'ouverture de l'espace abonnés.")}" target="_blank" rel="noopener">${icone("i-wa")}Écrire sur WhatsApp</a></div>`;
    return;
  }

  async function chargerEtat() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { session: null };
    // Administrateur avec validation en deux étapes : le code d'abord (sinon la base ne le reconnaît pas comme tel)
    const ad = await client.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (ad.data && await etapeCode() === "code") return { session, codeAttendu: true };
    const v = await client.rpc("verifier_appareil");
    if (v.error) throw v.error;
    if (v.data === false) { await ecarterAppareil(); return { session: null }; }
    const uid = session.user.id;
    const [p, a, adm] = await Promise.all([
      client.from("profils").select("prenom, nom, telephone, concours").eq("id", uid).maybeSingle(),
      client.rpc("mon_abonnement"),
      client.from("admins").select("user_id").eq("user_id", uid).maybeSingle()
    ]);
    if (p.error || a.error) throw p.error || a.error;
    return {
      session, uid, email: session.user.email,
      profil: p.data || { prenom: "", nom: "", telephone: "" },
      abo: (a.data && a.data[0]) || { actif: false, fin: null, deja_abonne: false },
      admin: !!adm.data
    };
  }

  async function apercuHTML() {
    const { data, error } = await client.rpc("apercu_contenus");
    if (error) return "";
    if (!data.length) return `<div class="ea-apercu"><h3>Au programme</h3><p class="ea-vide">Les premiers contenus exclusifs sont en préparation. Créez votre compte dès maintenant pour y accéder dès leur publication.</p></div>`;
    const parType = Object.keys(TYPES).map(t => [t, data.filter(c => c.type === t).length]).filter(x => x[1]);
    return `<div class="ea-apercu">
        <h3>Au programme</h3>
        <p class="ea-compte-types">${parType.map(([t, n]) => `<span class="ea-type ea-type-${t}">${n} ${n > 1 ? TYPES[t].pluriel.toLowerCase() : TYPES[t].nom.toLowerCase()}</span>`).join("")}</p>
        <ul class="ea-liste">${data.slice(0, 12).map(c => `<li class="ea-item">
          <span class="ea-cadenas" aria-label="Réservé aux abonnés"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>
          <span><b>${esc(c.titre)}</b><small>${TYPES[c.type].nom}${c.matiere ? " · " + esc(c.matiere) : ""}${(c.concours || []).length ? " · " + c.concours.map(nomConcours).join(", ") : ""}</small></span>
        </li>`).join("")}</ul>
        ${data.length > 12 ? `<p class="ea-vide">Et ${data.length - 12} autre${data.length - 12 > 1 ? "s" : ""} contenu${data.length - 12 > 1 ? "s" : ""}.</p>` : ""}
      </div>`;
  }

  function formulairesHTML(onglet) {
    const options = CONC.map(c => `<option value="${c.id}">${esc(c.court)}</option>`).join("");
    return `<div class="ea-auth">
      <div class="ea-onglets" role="tablist" aria-label="Accès à l'espace">
        <button type="button" role="tab" data-onglet="connexion" aria-selected="${onglet !== "inscription"}">Se connecter</button>
        <button type="button" role="tab" data-onglet="inscription" aria-selected="${onglet === "inscription"}">Créer un compte</button>
      </div>
      <form class="form ea-form" id="eaConnexion" novalidate ${onglet === "inscription" ? "hidden" : ""}>
        ${avisAppareil ? `<p class="ea-avis">Votre compte vient d'être ouvert sur un autre appareil. Un compte ne s'utilise que sur un appareil à la fois : reconnectez-vous pour continuer ici, l'autre appareil sera déconnecté.</p>` : ""}
        <div class="field full"><label for="cEmail">Adresse e-mail</label><input id="cEmail" type="email" autocomplete="email" required></div>
        <div class="field full"><label for="cMdp">Mot de passe</label><input id="cMdp" type="password" autocomplete="current-password" required></div>
        <p class="ea-msg" role="alert"></p>
        <button class="btn btn-navy" type="submit">Se connecter</button>
        <p class="ea-aide full">Mot de passe oublié ? <a href="${lienWa(WA_NUM, "Bonjour Les Cours Sésame & SAJ, j'ai oublié le mot de passe de mon compte abonné. Mon adresse e-mail : ")}" target="_blank" rel="noopener">Écrivez-nous sur WhatsApp</a> : nous vous donnons un mot de passe provisoire.</p>
      </form>
      <form class="form ea-form" id="eaInscription" novalidate ${onglet === "inscription" ? "" : "hidden"}>
        <div class="field"><label for="iPrenom">Prénom</label><input id="iPrenom" autocomplete="given-name" maxlength="60" required></div>
        <div class="field"><label for="iNom">Nom</label><input id="iNom" autocomplete="family-name" maxlength="60" required></div>
        <div class="field"><label for="iTel">Téléphone WhatsApp</label><input id="iTel" type="tel" inputmode="tel" autocomplete="tel" placeholder="07 XX XX XX XX" required></div>
        <div class="field"><label for="iConcours">Concours préparé</label><select id="iConcours"><option value="">Choisir…</option>${options}<option value="autre">Autre concours</option></select></div>
        <div class="field full"><label for="iEmail">Adresse e-mail</label><input id="iEmail" type="email" autocomplete="email" required></div>
        <div class="field full"><label for="iMdp">Mot de passe (8 caractères au moins)</label><input id="iMdp" type="password" autocomplete="new-password" minlength="8" required></div>
        <label class="ea-accord full"><input type="checkbox" id="iAccord" required><span>J'accepte que ces informations servent à gérer mon abonnement, comme l'expliquent les <a href="${ROOT}mentions-legales/#espace-abonnes" target="_blank">mentions légales</a>.</span></label>
        <p class="ea-msg" role="alert"></p>
        <button class="btn btn-navy" type="submit">Créer mon compte</button>
      </form>
    </div>`;
  }

  function statutHTML() {
    const { profil, abo, email } = etat;
    const msg = (debut) => `Bonjour Les Cours Sésame & SAJ,\n\n${debut}\n👤 ${profil.prenom} ${profil.nom}\n📧 ${email}\n📞 ${profil.telephone}\n\nRéférence de mon paiement Mobile Money : `;
    if (abo.actif) {
      const j = joursJusqua(abo.fin);
      return `<div class="ea-statut ea-statut-ok">
          <div><span class="eyebrow">Abonnement actif</span>
          <h3>Votre accès est ouvert jusqu'au ${dateFr(abo.fin)}.</h3>
          ${j <= 7 ? `<p>${j <= 0 ? "C'est le dernier jour." : `Plus que ${j} jour${j > 1 ? "s" : ""}.`} Pensez à renouveler votre abonnement pour garder l'accès.</p>` : ""}</div>
          ${j <= 7 ? `<a class="btn btn-wa" href="${lienWa(WA_NUM, msg("Je souhaite renouveler mon abonnement à l'espace abonnés."))}" target="_blank" rel="noopener">${icone("i-wa")}Renouveler</a>` : ""}
        </div>`;
    }
    const tarifs = typeof TARIFS_ABONNEMENT !== "undefined" ? TARIFS_ABONNEMENT : [];
    return `<div class="ea-statut ea-statut-attente">
        <span class="eyebrow">${abo.deja_abonne ? "Abonnement terminé" : "Activation en attente"}</span>
        <h3>${abo.deja_abonne ? `Votre abonnement a pris fin le ${dateFr(abo.fin)}.` : `Bienvenue, ${esc(profil.prenom)}. Votre compte est prêt.`}</h3>
        ${tarifs.length ? `<p class="ea-tarifs">${tarifs.map(t => `<span><b>${esc(t.prix)} FCFA</b> ${esc(t.duree)}</span>`).join("")}</p>` : ""}
        <ol class="ea-etapes">
          <li>Réglez ${abo.deja_abonne ? "votre renouvellement" : "votre abonnement"} par Mobile Money : Orange Money, MTN MoMo, Wave ou Moov Money.${tarifs.length ? "" : " Nous vous indiquons le tarif sur WhatsApp."}</li>
          <li>Envoyez-nous le message ci-dessous sur WhatsApp, avec la référence de votre paiement.</li>
          <li>Votre accès s'ouvre dès réception du paiement : rechargez alors cette page.</li>
        </ol>
        <a class="btn btn-wa" href="${lienWa(WA_NUM, msg(abo.deja_abonne ? "Je souhaite renouveler mon abonnement à l'espace abonnés." : "Je souhaite activer mon abonnement à l'espace abonnés."))}" target="_blank" rel="noopener">${icone("i-wa")}${abo.deja_abonne ? "Renouveler sur WhatsApp" : "Activer sur WhatsApp"}</a>
      </div>`;
  }

  function compteHTML() {
    const { profil, email, admin } = etat;
    return `<div class="ea-compte">
        <span>Connecté : <b>${esc(profil.prenom)} ${esc(profil.nom)}</b> · ${esc(email)}</span>
        <div class="ea-compte-actions">
          ${admin ? `<a class="btn btn-gold btn-sm" href="${ROOT}espace-abonnes/admin/">Administration</a>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" id="eaMonCompte" aria-expanded="false" aria-controls="eaPanneau">Mon compte</button>
          <button class="btn btn-ghost btn-sm" type="button" id="eaSortir">Se déconnecter</button>
        </div>
      </div>
      <div class="ea-panneau" id="eaPanneau" hidden>
        <form class="form ea-form" id="eaTel" novalidate>
          <div class="field full"><label for="mTel">Téléphone WhatsApp</label><input id="mTel" type="tel" inputmode="tel" value="${esc(profil.telephone)}" required></div>
          <p class="ea-msg" role="alert"></p>
          <button class="btn btn-ghost btn-sm" type="submit">Enregistrer le numéro</button>
        </form>
        <form class="form ea-form" id="eaMdp" novalidate>
          <div class="field full"><label for="mMdp">Nouveau mot de passe (8 caractères au moins)</label><input id="mMdp" type="password" autocomplete="new-password" minlength="8" required></div>
          <p class="ea-msg" role="alert"></p>
          <button class="btn btn-ghost btn-sm" type="submit">Changer le mot de passe</button>
        </form>
      </div>`;
  }

  let contenus = [], filtre = "tous";
  // Rubriques de la bibliothèque, d'après la matière saisie (« Ouvrage · … », « Corrigé · … ») ou le type
  const RUBRIQUES = { ouvrages: "Ouvrages complets", corriges: "Sujets corrigés", qcm: "QCM", videos: "Vidéos", autres: "Autres contenus" };
  const rubrique = c => /^Ouvrage/i.test(c.matiere || "") ? "ouvrages" : lireQcm(c) ? "qcm" : /^Corrigé/i.test(c.matiere || "") ? "corriges" : c.type === "video" ? "videos" : "autres";
  const sansAccents = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function bibliothequeHTML() {
    if (!contenus.length) return `<div class="ea-biblio"><p class="ea-vide">Les premiers contenus exclusifs arrivent très bientôt. Revenez nous voir.</p></div>`;
    const rubs = Object.keys(RUBRIQUES).filter(r => contenus.some(c => rubrique(c) === r));
    const liste = filtre === "tous" ? contenus : contenus.filter(c => rubrique(c) === filtre);
    return `<div class="ea-biblio">
        <div class="ea-biblio-tete"><h3>Vos contenus exclusifs</h3>
          ${rubs.length > 1 ? `<div class="chips" role="group" aria-label="Filtrer par rubrique">${[["tous", "Tous", contenus.length], ...rubs.map(r => [r, RUBRIQUES[r], contenus.filter(c => rubrique(c) === r).length])].map(([v, l, n]) => `<button class="chip" type="button" data-filtre="${v}" aria-pressed="${filtre === v}">${l}<span class="n">${n}</span></button>`).join("")}</div>` : ""}
          ${contenus.length > 8 ? `<label class="ea-cherche"><span class="sr-only">Rechercher un contenu</span><input type="search" id="eaCherche" placeholder="Rechercher : titre, matière, concours…" autocomplete="off"></label>` : ""}
        </div>
        <p class="ea-vide" id="eaAucun" hidden>Aucun contenu ne correspond à cette recherche.</p>
        <div class="ea-grille">${liste.map(c => `<button class="ea-carte" type="button" data-id="${c.id}" data-texte="${esc(sansAccents([c.titre, c.description, c.matiere, (c.concours || []).map(nomConcours).join(" ")].join(" ")))}">
            <span class="ea-type ea-type-${c.type}">${typeAffiche(c).nom}</span>
            <b>${esc(c.titre)}</b>
            ${c.description ? `<span class="ea-carte-desc">${esc(c.description)}</span>` : ""}
            <small>${[c.matiere ? esc(c.matiere) : "", (c.concours || []).map(nomConcours).join(", "), dateFr(c.publie_le)].filter(Boolean).join(" · ")}</small>
            <span class="ea-carte-go">${typeAffiche(c).action}${icone("i-arrow")}</span>
          </button>`).join("")}</div>
      </div>`;
  }

  async function afficher(onglet) {
    racine.setAttribute("aria-busy", "true");
    try {
      etat = await chargerEtat();
    } catch (e) {
      racine.innerHTML = `<div class="ea-carte-info"><h3>L'espace abonnés est momentanément indisponible.</h3><p>${esc(messageErreur(e))}</p><button class="btn btn-navy" type="button" id="eaReessayer">Réessayer</button></div>`;
      $("#eaReessayer").addEventListener("click", () => afficher());
      racine.removeAttribute("aria-busy");
      return;
    }
    if (etat.codeAttendu) {
      racine.removeAttribute("aria-busy");
      await formulaireCode(racine);
      return afficher();
    }
    if (!etat.session) {
      racine.innerHTML = `<div class="ea-accueil">${formulairesHTML(onglet || (!avisAppareil && location.hash === "#inscription" ? "inscription" : "connexion"))}${await apercuHTML()}</div>`;
      brancherFormulaires();
    } else if (etat.abo.actif || etat.admin) {
      const { data, error } = await client.from("contenus").select("id, titre, description, type, fichier, texte, lien, concours, matiere, publie_le").eq("publie", true).order("publie_le", { ascending: false });
      contenus = error ? [] : data;
      racine.innerHTML = compteHTML() + (etat.abo.actif ? statutHTML() : `<div class="ea-statut ea-statut-ok"><div><span class="eyebrow">Administrateur</span><h3>Vous voyez l'espace tel que vos abonnés le voient.</h3></div></div>`) + bibliothequeHTML();
      brancherCompte();
    } else {
      racine.innerHTML = compteHTML() + `<div class="ea-accueil ea-accueil-inscrit">${statutHTML()}${await apercuHTML()}</div>`;
      brancherCompte();
    }
    racine.removeAttribute("aria-busy");
  }

  function brancherFormulaires() {
    $$(".ea-onglets [data-onglet]", racine).forEach(b => b.addEventListener("click", () => {
      const o = b.dataset.onglet;
      $$(".ea-onglets [data-onglet]", racine).forEach(x => x.setAttribute("aria-selected", x === b));
      $("#eaConnexion").hidden = o !== "connexion";
      $("#eaInscription").hidden = o !== "inscription";
      history.replaceState(null, "", "#" + o);
      $(o === "connexion" ? "#cEmail" : "#iPrenom").focus();
    }));
    $("#eaConnexion").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.currentTarget, msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
      const email = $("#cEmail").value.trim(), password = $("#cMdp").value;
      if (!email || !password) { msg.textContent = "Indiquez votre e-mail et votre mot de passe."; return; }
      bouton.disabled = true; msg.textContent = "";
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (!error) await client.rpc("prendre_appareil");
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      avisAppareil = false;
      if (!/^#corrige-/.test(location.hash)) history.replaceState(null, "", location.pathname);
      afficher().then(ouvrirDepuisLien);
    });
    $("#eaInscription").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.currentTarget, msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
      const d = {
        prenom: $("#iPrenom").value.trim(), nom: $("#iNom").value.trim(), telephone: $("#iTel").value.trim(),
        concours: $("#iConcours").value, email: $("#iEmail").value.trim(), motDePasse: $("#iMdp").value
      };
      const manque = [["#iPrenom", d.prenom], ["#iNom", d.nom], ["#iTel", d.telephone], ["#iEmail", d.email], ["#iMdp", d.motDePasse]].find(x => !x[1]);
      if (manque) { msg.textContent = "Merci de remplir tous les champs."; $(manque[0]).focus(); return; }
      if (d.motDePasse.length < 8) { msg.textContent = "Le mot de passe doit compter au moins 8 caractères."; $("#iMdp").focus(); return; }
      if (!$("#iAccord").checked) { msg.textContent = "Merci de cocher la case d'accord."; $("#iAccord").focus(); return; }
      bouton.disabled = true; msg.textContent = "Création du compte…";
      const { error } = await client.functions.invoke("inscription", { body: d });
      if (error) { bouton.disabled = false; msg.textContent = await erreurFonction(error); return; }
      const r = await client.auth.signInWithPassword({ email: d.email, password: d.motDePasse });
      if (!r.error) await client.rpc("prendre_appareil");
      bouton.disabled = false;
      if (r.error) { msg.textContent = messageErreur(r.error); return; }
      history.replaceState(null, "", location.pathname);
      toast("Compte créé. Bienvenue !");
      afficher();
    });
  }

  function brancherCompte() {
    $("#eaSortir").addEventListener("click", async () => { await client.auth.signOut(); toast("Vous êtes déconnecté."); afficher(); });
    $("#eaMonCompte").addEventListener("click", e => {
      const p = $("#eaPanneau"); p.hidden = !p.hidden; e.currentTarget.setAttribute("aria-expanded", !p.hidden);
    });
    $("#eaTel").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $(".ea-msg", e.currentTarget), tel = $("#mTel").value.replace(/[^0-9+]/g, "");
      if (!/^\+?[0-9]{8,15}$/.test(tel)) { msg.textContent = "Numéro invalide."; return; }
      const { error } = await client.from("profils").update({ telephone: tel }).eq("id", etat.uid);
      msg.textContent = error ? messageErreur(error) : "Numéro enregistré.";
      if (!error) etat.profil.telephone = tel;
    });
    $("#eaMdp").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $(".ea-msg", e.currentTarget), mdp = $("#mMdp").value;
      if (mdp.length < 8) { msg.textContent = "8 caractères au moins."; return; }
      const { error } = await client.auth.updateUser({ password: mdp });
      msg.textContent = error ? messageErreur(error) : "Mot de passe changé.";
      if (!error) $("#mMdp").value = "";
    });
  }

  // Recherche dans la bibliothèque
  racine.addEventListener("input", e => {
    if (e.target.id !== "eaCherche") return;
    const mots = sansAccents(e.target.value).split(/\s+/).filter(Boolean);
    let n = 0;
    $$(".ea-grille .ea-carte", racine).forEach(c => { const ok = mots.every(m => c.dataset.texte.includes(m)); c.hidden = !ok; if (ok) n++; });
    $("#eaAucun").hidden = n > 0;
  });
  // Lien direct vers un contenu depuis le site public : espace-abonnes/#corrige-<adresse du sujet>
  function ouvrirDepuisLien() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!/^corrige-[a-z0-9-]+$/.test(h) || !etat.session || !(etat.abo.actif || etat.admin)) return;
    const c = contenus.find(x => (x.fichier || "").includes("-" + h + ".pdf"));
    if (c) ouvrirContenu(c, etat.abo.actif ? marqueDe(etat.profil) : "Aperçu administrateur");
  }

  // Bibliothèque : filtres et ouverture des contenus (un seul écouteur pour toute la page)
  racine.addEventListener("click", e => {
    const ch = e.target.closest("[data-filtre]");
    if (ch && $(".ea-biblio", racine)) {
      filtre = ch.dataset.filtre;
      $(".ea-biblio", racine).outerHTML = bibliothequeHTML();
      return;
    }
    const carte = e.target.closest(".ea-carte");
    if (carte && etat.session) {
      const c = contenus.find(x => String(x.id) === carte.dataset.id);
      if (c) ouvrirContenu(c, etat.admin && !etat.abo.actif ? "Aperçu administrateur" : marqueDe(etat.profil));
    }
  });

  // Déconnexion depuis un autre onglet ou session expirée
  client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && etat.session) afficher(); });
  // Boutons « Créer mon compte » et « Se connecter » de la page : bon onglet, puis défilement jusqu'au formulaire
  const versFormulaire = () => {
    const o = location.hash.slice(1);
    if (o !== "connexion" && o !== "inscription") return;
    const b = !etat.session && $(`.ea-onglets [data-onglet="${o}"]`, racine);
    if (b && b.getAttribute("aria-selected") !== "true") b.click();
    racine.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  window.addEventListener("hashchange", () => { versFormulaire(); ouvrirDepuisLien(); });
  // Contrôle de l'appareil toutes les minutes et au retour sur la page
  surRefus = controlerAppareil;
  setInterval(controlerAppareil, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) controlerAppareil(); });
  afficher().then(() => { versFormulaire(); ouvrirDepuisLien(); });
})();
