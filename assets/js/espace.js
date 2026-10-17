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

  /* ---------- Filigrane au nom du lecteur ---------- */
  // Signature complète du lecteur (nom, téléphone, e-mail), fixée par la page de l'espace abonnés.
  // Elle est répétée sur toute la surface des documents, fiches et QCM, avec la date et l'heure de lecture :
  // une capture d'écran, même recadrée, montre de quel compte elle vient.
  let signatureLecteur = "";
  const horodatage = () => new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const texteFiligrane = marque => `${signatureLecteur || marque} · ${horodatage()}`;
  // Calque transparent répété (image SVG) posé sur un contenu en texte : fiche, QCM, lien
  function poserFiligrane(zone, marque) {
    const t = texteFiligrane(marque).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
    // Une signature entière par motif (760 x 360), pour qu'elle ne soit jamais coupée par le bord du motif
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="360"><text x="380" y="180" text-anchor="middle" transform="rotate(-24 380 180)" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="rgba(15,42,92,0.10)">${t}</text></svg>`;
    zone.classList.add("ea-filigrane");
    zone.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }

  /* ---------- Lecture des PDF dans la page, sans téléchargement ni copie ---------- */
  // Chaque page est dessinée en image (pas de texte sélectionnable), avec le nom de l'abonné incrusté.
  // Le document s'ouvre en grand format, avec zoom (boutons, Ctrl + molette) et navigation par page. Chaque page
  // est dessinée à la densité de l'écran (au moins 1,5 point d'image par point affiché) pour un texte net, dans
  // la limite d'une surface d'image que les téléphones savent tenir en mémoire.
  const PDFJS = ROOT + "assets/vendor/pdfjs-3.11.174/";
  const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
  const PIXELS_MAX = 12e6;
  let nettoyerPdf = null;
  async function chargerPdfJs() {
    await chargerScript(PDFJS + "pdf.min.js");
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
    return lib;
  }
  async function afficherPdf(octets, zone, marque) {
    const lib = await chargerPdfJs();
    const doc = await lib.getDocument({ data: octets, isEvalSupported: false, enableXfa: false }).promise;
    zone.innerHTML = "";
    if (visionneuse) visionneuse.classList.add("ea-v-pdf");
    const boite = zone.closest(".ea-v-boite");
    const mention = `Réservé à ${marque} · Les Cours Sésame et SAJ · Reproduction interdite`;
    const tuile = texteFiligrane(marque);
    const total = doc.numPages;
    let zoom = 1;

    const barre = document.createElement("div");
    barre.className = "ea-pdf-barre";
    barre.innerHTML = `<div class="ea-pdf-nav">
        <button type="button" data-pdf="prec" aria-label="Page précédente">‹</button>
        <label>Page <input type="number" min="1" max="${total}" inputmode="numeric" value="1" aria-label="Numéro de page"> / ${total}</label>
        <button type="button" data-pdf="suiv" aria-label="Page suivante">›</button>
      </div>
      <div class="ea-pdf-zoom">
        <button type="button" data-pdf="moins" aria-label="Réduire">−</button>
        <span aria-live="polite">100 %</span>
        <button type="button" data-pdf="plus" aria-label="Agrandir">+</button>
        <button type="button" data-pdf="ajuster">Pleine largeur</button>
      </div>`;
    const pages = document.createElement("div");
    pages.className = "ea-pdf-pages";
    zone.append(barre, pages);
    const champ = $("input", barre), affZoom = $(".ea-pdf-zoom span", barre);
    const largeurUtile = () => { const st = getComputedStyle(pages); return Math.max(240, pages.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight)); };
    let largeurDessin = largeurUtile();

    const annuler = c => { if (c._tache) { c._tache.cancel(); c._tache = null; } };
    const vider = c => { annuler(c); delete c.dataset.fait; if (c.width > 1) { c.width = 1; c.height = 1; } };
    const dessiner = async (n, canvas) => {
      annuler(canvas);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const affiche = largeurDessin * zoom;
      const densite = Math.max(Math.min(window.devicePixelRatio || 1, 3), 1.5);
      let echelle = (affiche * densite) / base.width;
      const aire = base.width * base.height * echelle * echelle;
      if (aire > PIXELS_MAX) echelle *= Math.sqrt(PIXELS_MAX / aire);
      const vue = page.getViewport({ scale: echelle });
      // Dessin hors écran, puis copie d'un coup : l'ancienne image reste affichée pendant le calcul
      const tampon = document.createElement("canvas");
      tampon.width = Math.floor(vue.width); tampon.height = Math.floor(vue.height);
      const ctx = tampon.getContext("2d");
      const tache = page.render({ canvasContext: ctx, viewport: vue });
      canvas._tache = tache;
      try { await tache.promise; } catch (e) { return; } finally { if (canvas._tache === tache) canvas._tache = null; }
      // Nom de l'abonné en diagonale et mention en bas de page, incrustés dans l'image
      const w = tampon.width, h = tampon.height, angle = -Math.atan2(h, w);
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.rotate(angle);
      ctx.font = `800 ${Math.round(Math.min(w, h) / 14)}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(15,42,92,.10)";
      ctx.fillText(marque, 0, 0);
      // Même signature, en petit et répétée sur toute la page, avec l'e-mail, la date et l'heure de lecture
      const corps = Math.max(11, Math.round(w / 64));
      ctx.font = `700 ${corps}px sans-serif`;
      ctx.fillStyle = "rgba(15,42,92,.06)";
      const pasX = ctx.measureText(tuile).width + corps * 4, pasY = corps * 7, diag = Math.hypot(w, h);
      for (let y = -diag / 2, rang = 0; y < diag / 2; y += pasY, rang++) {
        for (let x = -diag / 2 - (rang % 2) * pasX / 2; x < diag / 2; x += pasX) ctx.fillText(tuile, x, y);
      }
      ctx.restore();
      ctx.font = `600 ${Math.max(10, Math.round(w / 95))}px sans-serif`;
      ctx.fillStyle = "rgba(60,60,75,.85)";
      ctx.fillText(mention, Math.round(w * 0.02), h - Math.round(h * 0.012));
      page.cleanup();
      if (!canvas.dataset.fait) return; // page sortie de l'écran entre-temps
      canvas.width = w; canvas.height = h;
      canvas.style.aspectRatio = `${w} / ${h}`;
      canvas.getContext("2d").drawImage(tampon, 0, 0);
      tampon.width = 0; tampon.height = 0;
    };

    // Ouvrages de plusieurs centaines de pages : chaque page garde sa place, n'est dessinée qu'à l'approche
    // et libérée une fois loin de l'écran, pour ne pas saturer la mémoire d'un téléphone.
    const p1 = (await doc.getPage(1)).getViewport({ scale: 1 });
    const observateur = "IntersectionObserver" in window ? new IntersectionObserver(entrees => {
      entrees.forEach(e => {
        const c = e.target;
        if (!e.isIntersecting) { vider(c); return; }
        if (c.dataset.fait) return;
        c.dataset.fait = "1";
        dessiner(+c.dataset.page, c).catch(() => { delete c.dataset.fait; });
      });
    }, { root: boite, rootMargin: "1200px 0px" }) : null;
    const toiles = [];
    for (let n = 1; n <= total; n++) {
      const canvas = document.createElement("canvas");
      canvas.className = "ea-page";
      canvas.dataset.page = n;
      canvas.width = 1; canvas.height = 1;
      canvas.style.aspectRatio = `${p1.width} / ${p1.height}`;
      canvas.setAttribute("aria-label", `Page ${n} sur ${total}`);
      pages.appendChild(canvas);
      toiles.push(canvas);
      if (observateur) observateur.observe(canvas); else if (n <= 30) { canvas.dataset.fait = "1"; await dessiner(n, canvas); }
    }

    // Page affichée : la première dont le bas dépasse le haut de la zone de lecture
    const pageCourante = () => {
      const haut = boite.getBoundingClientRect().top + barre.offsetHeight + 8;
      let bas = 0, haut2 = toiles.length - 1;
      while (bas < haut2) { const m = (bas + haut2) >> 1; if (toiles[m].getBoundingClientRect().bottom < haut) bas = m + 1; else haut2 = m; }
      return bas + 1;
    };
    let attenteDefil = 0;
    const suivreDefil = () => { if (attenteDefil) return; attenteDefil = requestAnimationFrame(() => { attenteDefil = 0; if (document.activeElement !== champ) champ.value = pageCourante(); }); };
    boite.addEventListener("scroll", suivreDefil, { passive: true });
    const allerA = n => {
      n = Math.min(total, Math.max(1, Math.round(+n || 1)));
      champ.value = n;
      boite.scrollTop += toiles[n - 1].getBoundingClientRect().top - boite.getBoundingClientRect().top - barre.offsetHeight - 6;
    };
    champ.addEventListener("change", () => allerA(champ.value));
    champ.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); allerA(champ.value); } });

    // Zoom : la page lue reste à l'écran ; les pages visibles sont redessinées à la nouvelle taille
    const redessiner = () => {
      toiles.forEach(c => { annuler(c); delete c.dataset.fait; });
      if (observateur) { observateur.disconnect(); toiles.forEach(c => observateur.observe(c)); }
    };
    const zoomer = z => {
      z = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(1, z));
      if (z === zoom) return;
      const n = pageCourante();
      zoom = z;
      pages.classList.toggle("ea-pdf-agrandi", zoom > 1);
      toiles.forEach(c => { c.style.width = zoom * 100 + "%"; });
      affZoom.textContent = Math.round(zoom * 100) + " %";
      allerA(n);
      redessiner();
    };
    const pas = sens => { const i = ZOOMS.findIndex(x => x >= zoom - 1e-6); zoomer(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + sens))]); };
    barre.addEventListener("click", e => {
      const b = e.target.closest("[data-pdf]");
      if (!b) return;
      const a = b.dataset.pdf;
      if (a === "prec") allerA(pageCourante() - 1);
      if (a === "suiv") allerA(pageCourante() + 1);
      if (a === "plus") pas(1);
      if (a === "moins") pas(-1);
      if (a === "ajuster") zoomer(1);
    });
    pages.addEventListener("wheel", e => { if (!e.ctrlKey) return; e.preventDefault(); pas(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    // Fenêtre redimensionnée ou téléphone tourné : pages redessinées à la nouvelle largeur
    let attenteTaille = 0;
    const surTaille = () => {
      clearTimeout(attenteTaille);
      attenteTaille = setTimeout(() => {
        const l = largeurUtile();
        if (Math.abs(l - largeurDessin) < 40) return;
        const n = pageCourante();
        largeurDessin = l;
        allerA(n);
        redessiner();
      }, 250);
    };
    window.addEventListener("resize", surTaille);
    nettoyerPdf = () => {
      window.removeEventListener("resize", surTaille);
      boite.removeEventListener("scroll", suivreDefil);
      if (observateur) observateur.disconnect();
      toiles.forEach(annuler);
      if (visionneuse) visionneuse.classList.remove("ea-v-pdf");
    };
    return doc;
  }

  /* ---------- Protections pendant la lecture ---------- */
  // Aucun site ne peut empêcher une capture d'écran faite par le téléphone ou l'ordinateur. Ces mesures la
  // découragent et la rendent traçable : filigrane au nom du lecteur (plus haut), contenu voilé dès que la page
  // n'est plus au premier plan, clic droit, sélection, copie, glisser, impression et raccourcis désactivés.
  const lectureOuverte = () => visionneuse && !visionneuse.hidden;
  let dernierAvis = 0;
  const avisProtege = () => { if (Date.now() - dernierAvis > 4000) { dernierAvis = Date.now(); toast("Contenu protégé : copie, impression et capture ne sont pas autorisées."); } };
  const bloquer = e => {
    if (!lectureOuverte() || !visionneuse.contains(e.target)) return;
    e.preventDefault();
    if (e.type === "contextmenu" || e.type === "copy" || e.type === "cut") avisProtege();
  };
  ["contextmenu", "copy", "cut", "selectstart", "dragstart"].forEach(t => document.addEventListener(t, bloquer, true));
  // Voile : dès que la page perd le premier plan (outil de capture, autre application, autre onglet)
  const voiler = oui => document.body.classList.toggle("ea-voile", !!oui && lectureOuverte());
  window.addEventListener("blur", () => voiler(true));
  window.addEventListener("focus", () => voiler(false));
  document.addEventListener("visibilitychange", () => voiler(document.hidden));
  window.addEventListener("pagehide", () => voiler(true));
  document.addEventListener("keydown", e => {
    if (!lectureOuverte()) return;
    const k = (e.key || "").toLowerCase(), mod = e.ctrlKey || e.metaKey;
    const outils = k === "f12" || (mod && e.shiftKey && ["i", "j", "c", "k"].includes(k)) || (e.metaKey && e.altKey && ["i", "j", "c", "u"].includes(k));
    if ((mod && ["s", "p", "c", "x", "a", "u"].includes(k)) || outils) { e.preventDefault(); e.stopPropagation(); avisProtege(); return; }
    // Touche Impr. écran (ordinateur) : contenu voilé un instant et presse-papiers vidé
    if (k === "printscreen" || e.key === "PrintScreen") { voiler(true); setTimeout(() => voiler(!document.hasFocus()), 1500); }
  }, true);
  document.addEventListener("keyup", e => {
    if (!lectureOuverte() || e.key !== "PrintScreen") return;
    voiler(true); avisProtege();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText("Contenu protégé · Les Cours Sésame et SAJ").catch(() => {});
    setTimeout(() => voiler(!document.hasFocus()), 1500);
  }, true);
  window.addEventListener("beforeprint", () => { if (lectureOuverte()) avisProtege(); });

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
    if (nettoyerPdf) { nettoyerPdf(); nettoyerPdf = null; }
    if (docOuvert) { docOuvert.destroy(); docOuvert = null; }
    $("#eaVCorps").innerHTML = "";
    visionneuse.hidden = true;
    document.body.style.overflow = "";
    document.body.classList.remove("ea-lecture", "ea-voile");
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
    const t = c.agent ? { nom: "Agent de révision" } : typeAffiche(c);
    $("#eaVType").className = "ea-type ea-type-" + c.type;
    $("#eaVType").textContent = t.nom;
    $("#eaVTitre").textContent = c.titre;
    $("#eaVDesc").textContent = c.description || "";
    $("#eaVDesc").hidden = !c.description;
    const corps = $("#eaVCorps");
    corps.classList.remove("ea-filigrane"); corps.style.backgroundImage = "";
    corps.innerHTML = `<p class="ea-attente">Chargement…</p>`;
    visionneuse.hidden = false;
    document.body.style.overflow = "hidden";
    document.body.classList.add("ea-lecture");
    $(".ea-v-fermer", visionneuse).focus();

    if (c.verrou) {
      corps.innerHTML = `<div class="ea-verrou">${icone("i-lock")}<p><b>Les ouvrages complets sont réservés aux formules d'un mois et plus.</b> Votre formule actuelle donne accès à tous les autres contenus : sujets corrigés, fiches de révision et QCM.</p>
          <a class="btn btn-wa" href="${lienWa(WA_NUM, c.verrou)}" target="_blank" rel="noopener">${icone("i-wa")}Passer à une formule d'un mois</a></div>`;
      return;
    }
    if (c.agent) { afficherReponseAgent(c.agent, corps, marque); return; }
    // Ouverture comptée pour les statistiques de l'administration (la base ignore les administrateurs)
    client.rpc("noter_lecture", { p_contenu: c.id }).then(() => {}, () => {});
    const qcm = lireQcm(c);
    if (qcm) { lancerQcm(qcm, corps, marque); poserFiligrane(corps, marque); return; }
    if (c.type === "texte") {
      corps.innerHTML = `<div class="ea-fiche">${mettreEnForme(c.texte || "")}</div><p class="ea-mention">Fiche réservée à ${esc(marque)}. Reproduction et diffusion interdites.</p>`;
      poserFiligrane(corps, marque);
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
        // Le code peut venir du téléphone habituel ou d'une clé de secours : on l'essaie sur chaque facteur validé
        const { data: l } = await client.auth.mfa.listFactors();
        const valides = ((l && l.totp) || []).filter(x => x.status === "verified");
        let error = valides.length ? null : new Error("Aucune application d'authentification n'est associée à ce compte.");
        for (const facteur of valides) {
          ({ error } = await client.auth.mfa.challengeAndVerify({ factorId: facteur.id, code }));
          if (!error) break;
        }
        bouton.disabled = false;
        if (error) { msg.textContent = /invalid|expired|code/i.test(error.message || "") ? "Code incorrect ou expiré. Saisissez le code affiché en ce moment." : messageErreur(error); champ.select(); return; }
        tenir();
      });
    });
  }

  window.Espace = { client, OUVERT, esc, dateFr, auj, joursJusqua, fcfa, WA_NUM, numeroWa, lienWa, TYPES, CONC, nomConcours, icone, messageErreur, erreurFonction, toast, ouvrirContenu, lienSur, etapeCode, formulaireCode, lireQcm, chargerPdfJs };

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
    if (!error && data === false) { await ecarterAppareil(); afficher("connexion"); return; }
    // Abonnement suspendu, coupé ou activé entre-temps : la page se met à jour d'elle-même
    const [a, s] = await Promise.all([client.rpc("mon_abonnement"), client.rpc("ma_suspension")]);
    if (a.error || s.error || !etat.abo) return;
    const actif = !!(a.data && a.data[0] && a.data[0].actif);
    if (actif !== !!etat.abo.actif || (s.data || null) !== (etat.suspendu || null)) { fermerVisionneuse(); afficher(); }
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
    const [p, a, adm, ouv, sus] = await Promise.all([
      client.from("profils").select("prenom, nom, telephone, concours").eq("id", uid).maybeSingle(),
      client.rpc("mon_abonnement"),
      client.from("admins").select("user_id").eq("user_id", uid).maybeSingle(),
      client.rpc("acces_ouvrages"),
      client.rpc("ma_suspension")
    ]);
    if (p.error || a.error) throw p.error || a.error;
    const profil = p.data || { prenom: "", nom: "", telephone: "" };
    // Signature du filigrane des documents : nom, téléphone et e-mail du lecteur
    signatureLecteur = `${profil.prenom} ${profil.nom} · ${profil.telephone} · ${session.user.email}`;
    return {
      session, uid, email: session.user.email,
      profil,
      abo: (a.data && a.data[0]) || { actif: false, fin: null, deja_abonne: false },
      // Date de début de la suspension en cours (accès coupé, jours restants gardés)
      suspendu: (!sus.error && sus.data) || null,
      admin: !!adm.data,
      // Ouvrages complets : formules d'un mois et plus seulement (règle appliquée par la base)
      ouvrages: !!adm.data || ouv.data === true
    };
  }

  // Aperçu public : tous les titres publiés, rangés par rubrique comme dans la bibliothèque.
  // Les volumes d'un même ouvrage (« …, volume 2 : … ») n'y font qu'une ligne.
  const ORDRE_APERCU = ["ouvrages", "corriges", "fiches", "qcm", "videos", "autres"];
  const COMPTES = { ouvrages: ["ouvrage complet", "ouvrages complets"], corriges: ["sujet corrigé", "sujets corrigés"], fiches: ["recueil de fiches", "recueils de fiches"], qcm: ["QCM", "QCM"], videos: ["vidéo", "vidéos"], autres: ["autre contenu", "autres contenus"] };
  const RE_VOLUME = /,\s*volume\s+\d+\s*:.*$/i;
  async function apercuHTML() {
    const { data, error } = await client.rpc("apercu_contenus");
    if (error) return "";
    if (!data.length) return `<div class="ea-apercu"><h3>Au programme</h3><p class="ea-vide">Les premiers contenus exclusifs sont en préparation. Créez votre compte dès maintenant pour y accéder dès leur publication.</p></div>`;
    // L'aperçu ne transmet pas le texte des contenus : un QCM s'y reconnaît à sa matière
    const rubriqueApercu = c => /^QCM/i.test(c.matiere || "") ? "qcm" : rubrique(c);
    const lignes = r => {
      const parTitre = new Map();
      for (const c of data.filter(x => rubriqueApercu(x) === r)) {
        const titre = r === "ouvrages" ? c.titre.replace(RE_VOLUME, "") : c.titre;
        if (!parTitre.has(titre)) parTitre.set(titre, { titre, items: [], concours: [] });
        const l = parTitre.get(titre);
        l.items.push(c);
        (c.concours || []).forEach(x => { if (!l.concours.includes(x)) l.concours.push(x); });
      }
      return [...parTitre.values()];
    };
    const groupes = ORDRE_APERCU.map(r => [r, lignes(r)]).filter(([, l]) => l.length);
    const cadenas = `<span class="ea-cadenas" aria-label="Réservé aux abonnés"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>`;
    const detail = l => [l.items.length > 1 ? `${l.items.length} volumes` : (l.items[0].matiere || "").replace(/^[^·]*·\s*/, ""), l.concours.map(nomConcours).join(", ")].filter(Boolean).map(esc).join(" · ");
    return `<div class="ea-apercu">
        <h3>Au programme</h3>
        <p class="ea-apercu-intro">Tous les contenus de l'espace, à lire dès l'ouverture de votre accès. Touchez une rubrique pour voir les titres.</p>
        ${groupes.map(([r, l]) => `<details class="ea-groupe">
          <summary><span class="ea-groupe-nom">${RUBRIQUES[r]}</span><span class="ea-groupe-n">${l.length}<span class="sr-only"> ${COMPTES[r][l.length > 1 ? 1 : 0]}</span></span>${r === "ouvrages" ? `<span class="ea-groupe-note">Formules d'un mois et plus</span>` : ""}</summary>
          <ul class="ea-liste">${l.map(x => `<li class="ea-item">${cadenas}<span><b>${esc(x.titre)}</b><small>${detail(x)}</small></span></li>`).join("")}</ul>
        </details>`).join("")}
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
          ${j <= 7 ? `<p>${j <= 0 ? "C'est le dernier jour." : `Plus que ${j} jour${j > 1 ? "s" : ""}.`} Pensez à renouveler votre abonnement pour garder l'accès.</p>` : ""}
          ${etat.ouvrages ? "" : `<p>Votre formule donne accès à tous les contenus, sauf les ouvrages complets, réservés aux formules d'un mois et plus.</p>`}</div>
          ${j <= 7 ? `<a class="btn btn-wa" href="${lienWa(WA_NUM, msg("Je souhaite renouveler mon abonnement à l'espace abonnés."))}" target="_blank" rel="noopener">${icone("i-wa")}Renouveler</a>` : ""}
        </div>`;
    }
    if (etat.suspendu) {
      const reste = abo.fin ? Math.max(0, Math.round((versDate(abo.fin) - versDate(etat.suspendu)) / 864e5) + 1) : 0;
      return `<div class="ea-statut ea-statut-attente">
          <span class="eyebrow">Abonnement suspendu</span>
          <h3>Votre abonnement est suspendu depuis le ${dateFr(etat.suspendu)}.</h3>
          <p>L'accès aux contenus est fermé pendant la suspension.${reste ? ` Vos ${reste} jour${reste > 1 ? "s" : ""} d'abonnement restant${reste > 1 ? "s" : ""} sont conservé${reste > 1 ? "s" : ""} : ils reprendront le jour de la réactivation.` : ""}</p>
          <a class="btn btn-wa" href="${lienWa(WA_NUM, msg("Mon abonnement à l'espace abonnés est suspendu. Je souhaite en savoir plus.").replace(/\n\nRéférence de mon paiement Mobile Money : $/, ""))}" target="_blank" rel="noopener">${icone("i-wa")}Nous écrire sur WhatsApp</a>
        </div>`;
    }
    const tarifs = typeof TARIFS_ABONNEMENT !== "undefined" ? TARIFS_ABONNEMENT : [];
    return `<div class="ea-statut ea-statut-attente">
        <span class="eyebrow">${abo.deja_abonne ? "Abonnement terminé" : "Activation en attente"}</span>
        <h3>${abo.deja_abonne ? `Votre abonnement a pris fin le ${dateFr(abo.fin)}.` : `Bienvenue, ${esc(profil.prenom)}. Votre compte est prêt.`}</h3>
        ${tarifs.length ? `<p class="ea-tarifs">${tarifs.map(t => `<span><b>${esc(t.prix)} FCFA</b> ${esc(t.duree)}</span>`).join("")}</p>
        <p class="ea-aide">Les ouvrages complets sont compris à partir de la formule d'un mois. Les formules plus courtes donnent accès à tout le reste : sujets corrigés, fiches de révision et QCM.</p>` : ""}
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
  // Rubriques de la bibliothèque, d'après la matière saisie (« Ouvrage · … », « Fiches · … », « Corrigé · … ») ou le type
  const RUBRIQUES = { ouvrages: "Ouvrages complets", fiches: "Fiches de révision", corriges: "Sujets corrigés", qcm: "QCM", videos: "Vidéos", autres: "Autres contenus" };
  const rubrique = c => /^Ouvrage/i.test(c.matiere || "") ? "ouvrages" : lireQcm(c) ? "qcm" : /^Fiches/i.test(c.matiere || "") ? "fiches" : /^Corrigé/i.test(c.matiere || "") ? "corriges" : c.type === "video" ? "videos" : "autres";
  const sansAccents = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Ouvrage complet affiché avec un cadenas : formule de moins d'un mois
  const verrouille = c => !etat.ouvrages && rubrique(c) === "ouvrages";
  const msgFormule = () => `Bonjour Les Cours Sésame & SAJ,\n\nJe souhaite passer à une formule d'un mois ou plus pour accéder aux ouvrages complets.\n👤 ${etat.profil.prenom} ${etat.profil.nom}\n📧 ${etat.email}\n📞 ${etat.profil.telephone}\n\nRéférence de mon paiement Mobile Money : `;
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
        <div class="ea-grille">${liste.map(c => `<button class="ea-carte${verrouille(c) ? " ea-carte-verrou" : ""}" type="button" data-id="${c.id}" data-texte="${esc(sansAccents([c.titre, c.description, c.matiere, (c.concours || []).map(nomConcours).join(" ")].join(" ")))}">
            <span class="ea-type ea-type-${c.type}">${typeAffiche(c).nom}</span>
            <b>${esc(c.titre)}</b>
            ${c.description ? `<span class="ea-carte-desc">${esc(c.description)}</span>` : ""}
            <small>${[c.matiere ? esc(c.matiere) : "", (c.concours || []).map(nomConcours).join(", "), dateFr(c.publie_le)].filter(Boolean).join(" · ")}</small>
            <span class="ea-carte-go">${verrouille(c) ? icone("i-lock") + "Formules d'un mois et plus" : typeAffiche(c).action + icone("i-arrow")}</span>
          </button>`).join("")}</div>
      </div>`;
  }

  // Annonces en cours, publiées depuis l'administration (lisibles par tout compte connecté)
  async function annoncesHTML() {
    const { data, error } = await client.from("annonces").select("id, texte, lien").order("debut", { ascending: false });
    if (error || !data || !data.length) return "";
    return `<div class="ea-annonces" role="status">${data.map(a => `<p>${icone("i-book")}<span>${esc(a.texte)}${a.lien && lienSur(a.lien) ? ` <a href="${esc(a.lien)}" target="_blank" rel="noopener noreferrer">En savoir plus</a>` : ""}</span></p>`).join("")}</div>`;
  }

  /* ---------- Agent de révision ---------- */
  // Rédaction intégrale ou correction notée sur 20 d'un cas pratique, d'une dissertation ou d'un commentaire d'article,
  // par la fonction Supabase « agent-revision », à partir des ouvrages de l'espace abonnés et de la méthode de l'éditeur.
  // Réservé aux formules d'un mois et plus, dans la limite d'un quota. Pendant la rédaction, seule la progression
  // s'affiche ; la réponse s'ouvre ensuite dans la visionneuse protégée (filigrane, voile, copie bloquée).
  const EXERCICES = { cas_pratique: "Cas pratique", dissertation: "Dissertation juridique", commentaire: "Commentaire d'article" };
  const MATIERES_AGENT = ["Droit civil", "Droit pénal", "Procédure pénale", "Droit administratif", "Droit commercial OHADA", "Organisation judiciaire", "Droits de l'enfant"];
  let agent = null, echanges = [], agentOuvert = false, agentEnCours = false;
  const noteFr = n => String(Math.round(Number(n) * 2) / 2).replace(".", ",");
  async function chargerAgent() {
    const [a, h] = await Promise.all([
      client.rpc("mon_agent"),
      client.from("agent_echanges").select("id, exercice, mode, matiere, sujet, reponse, note, sources, cree_le").eq("user_id", etat.uid).eq("statut", "termine").order("cree_le", { ascending: false }).limit(10)
    ]);
    agent = a.error ? null : (a.data && a.data[0]) || null;
    echanges = h.error ? [] : h.data;
  }
  const titreEchange = e => `${EXERCICES[e.exercice] || "Exercice"}, ${e.mode === "correction" ? "correction de votre copie" : "corrigé rédigé"}`;
  function agentHTML() {
    if (!agent || (!agent.actif && !etat.admin)) return "";
    const reste = Math.max(0, Math.min(agent.quota_jour - agent.utilises_jour, agent.quota_mois - agent.utilises_mois));
    const formulaire = `<form class="form ea-form ea-agent-form" id="eaAgentForm" novalidate>
        <div class="field"><label for="aExercice">Exercice</label><select id="aExercice" name="exercice">${Object.entries(EXERCICES).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
        <div class="field"><label for="aMatiere">Matière (facultatif)</label><input id="aMatiere" name="matiere" list="aMatieres" maxlength="80"><datalist id="aMatieres">${MATIERES_AGENT.map(m => `<option value="${esc(m)}">`).join("")}</datalist></div>
        <fieldset class="full ea-agent-mode"><legend>Votre demande</legend>
          <label><input type="radio" name="mode" value="redaction" checked> Rédiger le corrigé intégral</label>
          <label><input type="radio" name="mode" value="correction"> Corriger ma copie et la noter sur 20</label>
        </fieldset>
        <div class="field full"><label for="aSujet">Sujet</label><textarea id="aSujet" name="sujet" rows="6" maxlength="12000" placeholder="Collez l'énoncé complet : les faits et les questions du cas pratique, le sujet de dissertation, ou l'article à commenter avec son texte."></textarea></div>
        <div class="field full" id="aCopieChamp" hidden><label for="aCopie">Votre copie</label><textarea id="aCopie" name="copie" rows="12" maxlength="40000" placeholder="Collez votre copie complète, telle que vous l'avez rédigée."></textarea></div>
        <p class="ea-aide full">${etat.admin ? "Administrateur, sans limite de demandes." : `${reste} demande${reste > 1 ? "s" : ""} possible${reste > 1 ? "s" : ""} aujourd'hui (${agent.quota_jour} par jour, ${agent.quota_mois} par mois).`} N'écrivez aucun renseignement personnel dans le sujet ni dans la copie : ils sont transmis au service d'intelligence artificielle qui rédige la réponse. L'agent est une aide à la révision ; sa note est indicative.</p>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold" type="submit"${!etat.admin && !reste ? " disabled" : ""}>Lancer la rédaction</button>
      </form>
      <div class="ea-agent-sortie" id="eaAgentSortie" aria-live="polite" hidden></div>`;
    return `<details class="ea-agent" id="eaAgent"${agentOuvert ? " open" : ""}>
        <summary><span class="eyebrow">Agent de révision</span><b>Un corrigé rédigé ou votre copie corrigée et notée sur 20</b><span>Cas pratique, dissertation ou commentaire d'article, à partir des ouvrages de l'espace abonnés et de la méthode des Cours Sésame et SAJ.</span></summary>
        ${!agent.acces ? `<div class="ea-agent-verrou"><p>L'agent de révision est compris dans les formules d'un mois et plus.</p><a class="btn btn-wa" href="${lienWa(WA_NUM, msgFormule())}" target="_blank" rel="noopener">${icone("i-wa")}Passer à une formule d'un mois</a></div>` : formulaire}
        ${echanges.length ? `<div class="ea-agent-histo"><h4>Vos dernières demandes</h4>${echanges.map(e => `<button type="button" class="ea-agent-ligne" data-echange="${e.id}"><b>${titreEchange(e)}${e.note != null ? ` · ${noteFr(e.note)}/20` : ""}</b><small>${dateFr(e.cree_le)} · ${esc(e.sujet.slice(0, 110))}${e.sujet.length > 110 ? "…" : ""}</small></button>`).join("")}</div>` : ""}
      </details>`;
  }
  function afficherReponseAgent(e, corps, marque) {
    const vues = new Set();
    const sources = (e.sources || []).filter(x => { const k = x.titre + "|" + x.page; if (vues.has(k)) return false; vues.add(k); return true; });
    corps.innerHTML = `${e.note != null ? `<p class="ea-agent-note"><b>${noteFr(e.note)}/20</b><span>Note indicative, qui ne préjuge pas de la note d'un jury.</span></p>` : ""}
      <div class="ea-fiche">${mettreEnForme(e.reponse || "")}</div>
      ${sources.length ? `<div class="ea-agent-sources"><h4>Passages des ouvrages consultés</h4><ul>${sources.map(x => `<li>${esc(x.titre)}, page ${x.page}</li>`).join("")}</ul></div>` : ""}
      ${e.tronque ? `<p class="ea-aide">La réponse a atteint sa longueur maximale et peut s'arrêter avant la fin.</p>` : ""}
      <p class="ea-mention">Réponse de l'agent de révision, réservée à ${esc(marque)}. Aide à la révision, sans valeur de corrigé officiel : vérifiez les références avant de les apprendre. Reproduction et diffusion interdites.</p>`;
    poserFiligrane(corps, marque);
  }
  const marqueLecteur = () => etat.admin && !etat.abo.actif ? "Aperçu administrateur" : marqueDe(etat.profil);
  const ouvrirEchange = e => ouvrirContenu({ agent: e, type: "texte", titre: titreEchange(e), description: e.sujet.length > 220 ? e.sujet.slice(0, 220) + "…" : e.sujet }, marqueLecteur());
  async function lancerAgent(f) {
    const msg = $(".ea-msg", f), bouton = $("button[type=submit]", f), sortie = $("#eaAgentSortie");
    const d = { exercice: f.exercice.value, mode: $("[name=mode]:checked", f).value, matiere: f.matiere.value.trim(), sujet: f.sujet.value.trim(), copie: f.copie.value.trim() };
    if (d.sujet.length < 10) { msg.textContent = "Collez le sujet complet."; f.sujet.focus(); return; }
    if (d.mode === "correction" && d.copie.length < 200) { msg.textContent = "Collez votre copie complète (200 caractères au moins)."; f.copie.focus(); return; }
    if (d.mode !== "correction") d.copie = "";
    const { data: { session } } = await client.auth.getSession();
    if (!session) { afficher(); return; }
    bouton.disabled = true; msg.textContent = ""; agentEnCours = true;
    sortie.hidden = false;
    sortie.innerHTML = `<p class="ea-attente">Recherche dans les ouvrages puis rédaction. Comptez une à deux minutes et gardez la page ouverte.</p><p class="ea-agent-progres"></p>`;
    const progres = $(".ea-agent-progres", sortie);
    let texte = "", fin = null, erreur = null;
    try {
      const rep = await fetch(`${CONF.url}/functions/v1/agent-revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: CONF.cle },
        body: JSON.stringify(d)
      });
      if (!rep.ok || !rep.body) { let j = {}; try { j = await rep.json(); } catch (e) { /* réponse vide */ } throw new Error(j.error || "L'agent de révision n'a pas pu répondre. Réessayez dans quelques minutes."); }
      const lecteur = rep.body.getReader(), dec = new TextDecoder();
      let tampon = "";
      for (;;) {
        const { value, done } = await lecteur.read();
        if (done) break;
        tampon += dec.decode(value, { stream: true });
        let i;
        while ((i = tampon.indexOf("\n")) >= 0) {
          const l = tampon.slice(0, i).trim();
          tampon = tampon.slice(i + 1);
          if (!l) continue;
          let o;
          try { o = JSON.parse(l); } catch (e) { continue; }
          if (o.t) { texte += o.t; const n = texte.split(/\s+/).length; progres.textContent = `Rédaction en cours, ${n.toLocaleString("fr-FR")} mots…`; }
          if (o.fin) fin = o.fin;
          if (o.erreur) erreur = o.erreur;
        }
      }
      if (!fin && !erreur) erreur = "La rédaction a été interrompue. Réessayez dans quelques minutes.";
    } catch (e) { erreur = messageErreur(e); }
    agentEnCours = false;
    if (erreur) { sortie.hidden = true; bouton.disabled = false; msg.textContent = erreur; return; }
    const e = { id: fin.id, exercice: d.exercice, mode: d.mode, matiere: d.matiere, sujet: d.sujet, reponse: fin.reponse, note: fin.note, sources: fin.sources, tronque: fin.tronque, cree_le: new Date().toISOString() };
    echanges.unshift(e);
    agent.utilises_jour++; agent.utilises_mois++;
    agentOuvert = true;
    $("#eaAgent").outerHTML = agentHTML();
    ouvrirEchange(e);
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
      const [{ data, error }] = await Promise.all([
        client.from("contenus").select("id, titre, description, type, fichier, texte, lien, concours, matiere, publie_le").eq("publie", true).order("publie_le", { ascending: false }),
        chargerAgent().catch(() => { agent = null; })
      ]);
      contenus = error ? [] : data;
      racine.innerHTML = compteHTML() + await annoncesHTML() + (etat.abo.actif ? statutHTML() : `<div class="ea-statut ea-statut-ok"><div><span class="eyebrow">Administrateur</span><h3>Vous voyez l'espace tel que vos abonnés le voient.</h3></div></div>`) + agentHTML() + bibliothequeHTML();
      brancherCompte();
    } else {
      racine.innerHTML = compteHTML() + await annoncesHTML() + `<div class="ea-accueil ea-accueil-inscrit">${statutHTML()}${await apercuHTML()}</div>`;
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

  // Agent de révision : envoi de la demande, champ de la copie selon le type de demande, bloc ouvert ou fermé
  racine.addEventListener("submit", e => {
    if (e.target.id !== "eaAgentForm") return;
    e.preventDefault();
    if (!agentEnCours) lancerAgent(e.target);
  });
  racine.addEventListener("change", e => {
    if (e.target.name === "mode" && e.target.closest("#eaAgentForm")) $("#aCopieChamp").hidden = e.target.value !== "correction";
  });
  racine.addEventListener("toggle", e => { if (e.target.id === "eaAgent") agentOuvert = e.target.open; }, true);
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
    const ech = e.target.closest("[data-echange]");
    if (ech) { const x = echanges.find(y => String(y.id) === ech.dataset.echange); if (x) ouvrirEchange(x); return; }
    const carte = e.target.closest(".ea-carte");
    if (carte && etat.session) {
      const c = contenus.find(x => String(x.id) === carte.dataset.id);
      if (c) ouvrirContenu(verrouille(c) ? Object.assign({}, c, { verrou: msgFormule() }) : c, etat.admin && !etat.abo.actif ? "Aperçu administrateur" : marqueDe(etat.profil));
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
