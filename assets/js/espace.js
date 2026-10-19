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

  /* ---------- Lecture des PDF, page par page, en images signées par le serveur ---------- */
  // Le fichier d'origine n'est jamais envoyé au navigateur. La fonction « pages » renvoie chaque page sous forme
  // d'image, avec le nom, le téléphone, l'e-mail, la date et l'heure de l'abonné fondus dans les pixels. Une page
  // n'est demandée qu'à l'approche de l'écran ; chaque page différente lue dans la journée compte dans le plafond
  // de lecture (300 par jour). Zoom de 100 à 300 % : au-delà de 175 %, la page est redemandée en plus grand.
  // pdf.js reste chargé par l'administration pour préparer le texte destiné à l'agent de révision.
  const PDFJS = ROOT + "assets/vendor/pdfjs-3.11.174/";
  const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
  let nettoyerPdf = null;
  async function chargerPdfJs() {
    await chargerScript(PDFJS + "pdf.min.js");
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
    return lib;
  }
  // Appel de la fonction « pages » avec la session de l'abonné ; une erreur porte le message du serveur
  async function appelPages(corps, signal) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error("Connexion requise. Reconnectez-vous.");
    const rep = await fetch(`${CONF.url}/functions/v1/pages`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: CONF.cle },
      body: JSON.stringify(corps)
    });
    if (!rep.ok || /json/.test(rep.headers.get("Content-Type") || "") && corps.action !== "info" && corps.action !== "reserver") {
      const r = await rep.json().catch(() => ({}));
      const e = new Error(r.error || "Le document n'a pas pu être chargé. Réessayez.");
      e.statut = rep.status;
      throw e;
    }
    return rep;
  }
  async function afficherPages(c, zone, depart) {
    const info = await (await appelPages({ action: "info", contenu: c.id })).json();
    zone.innerHTML = "";
    if (visionneuse) visionneuse.classList.add("ea-v-pdf");
    const boite = zone.closest(".ea-v-boite");
    const total = info.pages;
    const arret = new AbortController();
    const urls = [];
    let zoom = 1, plafondAtteint = false;

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
    const quota = document.createElement("p");
    quota.className = "ea-pdf-quota";
    const majQuota = lues => { if (!info.admin && !plafondAtteint) quota.textContent = `Pages lues aujourd'hui ${lues} sur ${info.plafond}.`; };
    majQuota(info.lues);
    const pages = document.createElement("div");
    pages.className = "ea-pdf-pages";
    zone.append(barre, quota, pages);
    const champ = $("input", barre), affZoom = $(".ea-pdf-zoom span", barre);

    // Chargement d'une page : deux demandes à la fois au plus, dans l'ordre d'arrivée à l'écran
    const file = [];
    let actives = 0;
    const suivante = () => {
      while (actives < 2 && file.length && !plafondAtteint) {
        const img = file.shift();
        if (!img.dataset.attente) continue;
        actives++;
        charger(img).finally(() => { actives--; suivante(); });
      }
    };
    const demander = (img, echelle) => {
      if (plafondAtteint || img.dataset.attente || +(img.dataset.echelle || 0) >= echelle) return;
      img.dataset.attente = String(echelle);
      file.push(img);
      suivante();
    };
    const charger = async img => {
      const n = +img.dataset.page, echelle = +img.dataset.attente;
      try {
        const rep = await appelPages({ action: "lire", contenu: c.id, page: n, echelle }, arret.signal);
        const restantes = +rep.headers.get("X-Restantes");
        const points = (rep.headers.get("X-Points") || "").split("x").map(Number);
        const url = URL.createObjectURL(await rep.blob());
        urls.push(url);
        if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
        img.dataset.url = url;
        img.src = url;
        img.dataset.echelle = String(echelle);
        img.classList.remove("ea-page-vide");
        if (points[0] && points[1]) img.style.aspectRatio = `${points[0]} / ${points[1]}`;
        if (n === 1 && points[0]) $$(".ea-page-vide", pages).forEach(x => { x.style.aspectRatio = `${points[0]} / ${points[1]}`; });
        if (restantes >= 0) majQuota(info.plafond - restantes);
      } catch (e) {
        if (arret.signal.aborted) return;
        if (e.statut === 429) {
          plafondAtteint = true;
          quota.textContent = e.message;
          quota.classList.add("ea-pdf-quota-fin");
          toast(e.message);
        }
        img.dataset.erreur = e.message;
      } finally {
        delete img.dataset.attente;
      }
    };

    const observateur = "IntersectionObserver" in window ? new IntersectionObserver(entrees => {
      entrees.forEach(e => { if (e.isIntersecting) demander(e.target, zoom > 1.75 ? 3 : 2); });
    }, { root: boite, rootMargin: "400px 0px" }) : null;
    const images = [];
    for (let n = 1; n <= total; n++) {
      const img = document.createElement("img");
      img.className = "ea-page ea-page-vide";
      img.dataset.page = n;
      img.alt = `Page ${n} sur ${total}`;
      img.draggable = false;
      img.style.aspectRatio = "595 / 842";
      pages.appendChild(img);
      images.push(img);
      if (observateur) observateur.observe(img); else if (n <= 3) demander(img, 2);
    }

    // Page affichée : la première dont le bas dépasse le haut de la zone de lecture
    const pageCourante = () => {
      const haut = boite.getBoundingClientRect().top + barre.offsetHeight + 8;
      let bas = 0, haut2 = images.length - 1;
      while (bas < haut2) { const m = (bas + haut2) >> 1; if (images[m].getBoundingClientRect().bottom < haut) bas = m + 1; else haut2 = m; }
      return bas + 1;
    };
    let attenteDefil = 0;
    const suivreDefil = () => { if (attenteDefil) return; attenteDefil = requestAnimationFrame(() => { attenteDefil = 0; if (document.activeElement !== champ) champ.value = pageCourante(); }); };
    boite.addEventListener("scroll", suivreDefil, { passive: true });
    const allerA = n => {
      n = Math.min(total, Math.max(1, Math.round(+n || 1)));
      champ.value = n;
      boite.scrollTop += images[n - 1].getBoundingClientRect().top - boite.getBoundingClientRect().top - barre.offsetHeight - 6;
    };
    champ.addEventListener("change", () => allerA(champ.value));
    champ.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); allerA(champ.value); } });

    // Zoom : la page lue reste à l'écran ; au-delà de 175 %, les pages visibles sont redemandées en plus grand
    const zoomer = z => {
      z = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(1, z));
      if (z === zoom) return;
      const n = pageCourante();
      zoom = z;
      pages.classList.toggle("ea-pdf-agrandi", zoom > 1);
      images.forEach(i => { i.style.width = zoom * 100 + "%"; });
      affZoom.textContent = Math.round(zoom * 100) + " %";
      allerA(n);
      if (observateur) { observateur.disconnect(); images.forEach(i => observateur.observe(i)); }
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
    nettoyerPdf = () => {
      arret.abort();
      boite.removeEventListener("scroll", suivreDefil);
      if (observateur) observateur.disconnect();
      urls.forEach(u => URL.revokeObjectURL(u));
      if (visionneuse) visionneuse.classList.remove("ea-v-pdf");
    };
    // Ouverture à une page précise (réponse attendue du grand oral, par exemple)
    if (depart > 1) requestAnimationFrame(() => allerA(depart));
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
  let visionneuse, retourFocus, minuterieMarque;
  function fermerVisionneuse() {
    if (!visionneuse || visionneuse.hidden) return;
    const v = $("video", visionneuse);
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
    clearInterval(minuterieMarque);
    clearInterval(minuterieQcm);
    const cv = $("#eaVCorps"); if (cv) { cv.onclick = null; cv.onchange = null; cv.onsubmit = null; }
    if (arretOutil) { arretOutil(); arretOutil = null; }
    if (nettoyerPdf) { nettoyerPdf(); nettoyerPdf = null; }
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
    const t = c.agent ? { nom: "Agent de révision" } : c.outil ? { nom: "Révision" } : typeAffiche(c);
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
    if (c.outil) { c.outil(corps, marque); return; }
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
    if (c.type === "pdf") {
      corps.innerHTML = `<div class="ea-pdf" aria-live="polite"><p class="ea-attente">Ouverture du document…</p></div>
        <p class="ea-mention">Document réservé à ${esc(marque)}. Chaque page porte votre nom. Copie et impression désactivées ; quelques pages peuvent être téléchargées chaque semaine.</p>`;
      try {
        await afficherPages(c, $(".ea-pdf", corps), c.page);
        if (!visionneuse.hidden) ajouterTelechargement(c, $(".ea-pdf", corps));
      } catch (e) {
        $(".ea-pdf", corps).innerHTML = `<p class="ea-erreur">${esc(e && e.message ? e.message : "Le document n'a pas pu être ouvert. Réessayez.")}</p>`;
        if (e && e.statut === 403 && surRefus) surRefus();
      }
      return;
    }
    const duree = 4 * 3600;
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
  }

  /* ---------- Téléchargement de pages (limite hebdomadaire) ---------- */
  // Sur 7 jours glissants : 5 % du total des pages des PDF, 15 pages au plus d'un même document. Le PDF est découpé
  // et filigrané au nom de l'abonné par la fonction « telechargement » ; la base tient le décompte.
  function ajouterTelechargement(c, zone) {
    const barre = $(".ea-pdf-barre", zone);
    if (!barre) return;
    const champPage = $("input", barre);
    const total = Number(champPage.max) || 1;
    const bouton = document.createElement("button");
    bouton.type = "button"; bouton.className = "ea-pdf-tele"; bouton.textContent = "Télécharger des pages";
    const panneau = document.createElement("form");
    panneau.className = "ea-tele"; panneau.hidden = true; panneau.noValidate = true;
    panneau.innerHTML = `<p class="ea-tele-etat">Calcul de votre limite…</p>
      <div class="ea-tele-ligne"><label>Pages <input name="pages" autocomplete="off" inputmode="numeric" placeholder="Exemple 3-7, 12"></label>
        <button class="btn btn-gold btn-sm" type="submit">Télécharger</button></div>
      <p class="ea-msg" role="alert"></p>
      <small>Votre nom, votre téléphone, votre e-mail, la date et l'heure sont imprimés sur chaque page. Usage strictement personnel ; toute diffusion est interdite et identifiable.</small>`;
    barre.appendChild(bouton);
    barre.after(panneau);
    const etatTxt = $(".ea-tele-etat", panneau), msg = $(".ea-msg", panneau), champ = panneau.pages, envoi = $("button", panneau);
    let reste = 0;
    const majEtat = async () => {
      const { data, error } = await client.rpc("mes_telechargements");
      if (error || !data) { etatTxt.textContent = "Limite indisponible pour le moment."; return; }
      const doc = Number((data.documents || {})[c.id] || 0);
      reste = Math.max(0, Math.min(data.quota - data.utilises, data.par_document - doc));
      const lib = data.liberation ? new Date(data.liberation).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
      etatTxt.innerHTML = reste
        ? `Vous pouvez télécharger <b>${reste} page${reste > 1 ? "s" : ""}</b> de ce document. Sur 7 jours, ${data.quota} pages au plus en tout (${data.utilises} déjà utilisée${data.utilises > 1 ? "s" : ""}) et ${data.par_document} au plus par document.`
        : `Limite atteinte pour ce document ou pour la semaine. ${lib ? `Des pages se libèrent ${esc(lib)}.` : ""}`;
      champ.disabled = envoi.disabled = !reste;
    };
    bouton.addEventListener("click", () => {
      panneau.hidden = !panneau.hidden;
      if (panneau.hidden) return;
      if (!champ.value) champ.value = String(Math.min(total, Number(champPage.value) || 1));
      msg.textContent = "";
      majEtat();
    });
    // Réservation des pages (décomptées tout de suite), puis chaque page demandée une à une au serveur, qui la renvoie
    // en image signée ; le navigateur les rassemble en un seul PDF. Une réservation interrompue (réseau coupé) se
    // reprend sans nouveau décompte pendant 30 minutes, en relançant les mêmes pages.
    let enCours = null;
    panneau.addEventListener("submit", async e => {
      e.preventDefault();
      const pages = champ.value.trim();
      if (!/^[\d\s,;-]+$/.test(pages)) { msg.textContent = "Indiquez des numéros de page, par exemple 3-7, 12."; champ.focus(); return; }
      envoi.disabled = true; msg.textContent = "Réservation des pages…";
      try {
        if (!enCours || enCours.texte !== pages || Date.now() - enCours.debut > 29 * 60000) {
          const r = await (await appelPages({ action: "reserver", contenu: c.id, pages })).json();
          if (r.error) throw new Error(r.error);
          enCours = { texte: pages, debut: Date.now(), reservation: r.reservation, liste: r.pages, faites: new Map() };
        }
        await chargerScript(ROOT + "assets/vendor/pdf-lib-1.17.1/pdf-lib.min.js");
        for (const n of enCours.liste) {
          if (enCours.faites.has(n)) continue;
          msg.textContent = `Préparation de la page ${n} (${enCours.faites.size + 1} sur ${enCours.liste.length})…`;
          let octets = null;
          for (let essai = 0; essai < 2 && !octets; essai++) {
            try { octets = await (await appelPages({ action: "telecharger", reservation: enCours.reservation, page: n })).arrayBuffer(); }
            catch (err) { if (essai || (err.statut && err.statut < 500)) throw err; }
          }
          enCours.faites.set(n, octets);
        }
        const doc = await PDFLib.PDFDocument.create();
        for (const n of enCours.liste) {
          const une = await PDFLib.PDFDocument.load(enCours.faites.get(n));
          (await doc.copyPages(une, [0])).forEach(pg => doc.addPage(pg));
        }
        doc.setTitle(`${c.titre} (pages ${pages.replace(/\s+/g, "")})`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([await doc.save()], { type: "application/pdf" }));
        a.download = `${c.titre.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)} (p. ${pages.replace(/\s+/g, "").replace(/,/g, ", ")}).pdf`;
        panneau.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        const nb = enCours.liste.length;
        msg.textContent = `${nb} page${nb > 1 ? "s" : ""} téléchargée${nb > 1 ? "s" : ""}.`;
        enCours = null;
      } catch (err) {
        msg.textContent = (err && err.message ? err.message : "Téléchargement impossible.") +
          (enCours && enCours.faites.size < enCours.liste.length ? " Les pages réservées restent disponibles 30 minutes. Relancez le téléchargement des mêmes pages, elles ne seront pas décomptées une seconde fois." : "");
      }
      await majEtat();
    });
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
      client.from("profils").select("prenom, nom, telephone, concours, date_concours").eq("id", uid).maybeSingle(),
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

  /* ---------- Outils de révision : révision du jour, grand oral, sujet de la semaine, tableau de bord ---------- */
  // Tous s'appuient sur les contenus déjà publiés. Ils s'ouvrent dans la visionneuse, donc avec le filigrane,
  // le voile et la copie bloquée des autres contenus.
  // Révision du jour : les questions des QCM de l'espace reviennent selon la méthode des boîtes. Une réponse juste
  // fait passer la question dans la boîte suivante (retour dans 1, 3, 7, 15 puis 30 jours), une erreur la renvoie
  // au lendemain. La progression est enregistrée dans la table qcm_progres.
  const INTERVALLES = [1, 1, 3, 7, 15, 30];
  const SEANCE = 20, NOUVELLES = 10, MAITRISE = 3;
  let progres = new Map(), stats = null, oralQuestions = [], arretOutil = null;
  const cleQ = (cid, i) => cid + ":" + i;
  const dansJours = n => { const d = new Date(auj() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const matiereQcm = c => (c.matiere || "").replace(/^QCM\s*·\s*/i, "") || "QCM";
  const toutesQuestions = () => contenus.filter(c => lireQcm(c)).flatMap(c => lireQcm(c).questions.map((q, i) => ({ c, i, q, matiere: matiereQcm(c) })));
  const matieresQcm = () => [...new Set(toutesQuestions().map(x => x.matiere))];
  const lu = (cle, def) => { try { return JSON.parse(localStorage.getItem(cle)) || def; } catch (e) { return def; } };
  const ecrit = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  async function chargerOutils() {
    const [p, s, g] = await Promise.all([
      client.from("qcm_progres").select("contenu_id, question, boite, prochaine, bonnes, erreurs").eq("user_id", etat.uid),
      client.rpc("mes_statistiques"),
      client.from("grand_oral").select("id, contenu_id, page, numero, theme, question").order("numero")
    ]);
    progres = new Map((p.error ? [] : p.data).map(x => [cleQ(x.contenu_id, x.question), x]));
    stats = s.error ? null : s.data;
    oralQuestions = g.error ? [] : g.data;
  }
  const aRevoir = x => { const p = progres.get(cleQ(x.c.id, x.i)); return !!p && p.prochaine <= auj(); };
  const nouvelle = x => !progres.has(cleQ(x.c.id, x.i));
  // Séance : d'abord les questions à revoir (les plus anciennes en premier), puis des nouvelles, en alternant les matières
  function seance(matiere) {
    const toutes = toutesQuestions().filter(x => !matiere || x.matiere === matiere);
    const revoir = toutes.filter(aRevoir).sort((a, b) => (progres.get(cleQ(a.c.id, a.i)).prochaine < progres.get(cleQ(b.c.id, b.i)).prochaine ? -1 : 1)).slice(0, SEANCE);
    const parMatiere = {};
    toutes.filter(nouvelle).forEach(x => (parMatiere[x.matiere] = parMatiere[x.matiere] || []).push(x));
    const nouv = [], files = Object.values(parMatiere);
    while (nouv.length < Math.min(NOUVELLES, SEANCE - revoir.length) && files.some(f => f.length)) files.forEach(f => { if (f.length && nouv.length < Math.min(NOUVELLES, SEANCE - revoir.length)) nouv.push(f.shift()); });
    return [...revoir, ...nouv];
  }
  const maitrise = matiere => {
    const qs = toutesQuestions().filter(x => x.matiere === matiere);
    const ok = qs.filter(x => { const p = progres.get(cleQ(x.c.id, x.i)); return p && p.boite >= MAITRISE; }).length;
    return { total: qs.length, ok, pct: qs.length ? Math.round(ok * 100 / qs.length) : 0 };
  };
  async function enregistrerReponse(x, juste) {
    const k = cleQ(x.c.id, x.i), avant = progres.get(k) || { boite: 0, bonnes: 0, erreurs: 0 };
    const boite = juste ? Math.min(5, (progres.has(k) ? avant.boite : 0) + 1) : 0;
    const ligne = { user_id: etat.uid, contenu_id: x.c.id, question: x.i, boite, prochaine: dansJours(INTERVALLES[boite]),
      bonnes: avant.bonnes + (juste ? 1 : 0), erreurs: avant.erreurs + (juste ? 0 : 1), maj_le: new Date().toISOString() };
    progres.set(k, ligne);
    const { error } = await client.from("qcm_progres").upsert(ligne);
    if (error && !enregistrerReponse.averti) { enregistrerReponse.averti = true; toast(etat.admin ? "Compte administrateur : la progression n'est pas enregistrée." : "Progression non enregistrée. Vérifiez votre connexion."); }
  }

  function outilRevision(corps, marque) {
    let matiere = "", liste = [], n = 0, justes = 0;
    const accueil = () => {
      const ms = matieresQcm();
      const compte = m => seance(m).length;
      corps.innerHTML = `<div class="ea-outil">
          <p>Les questions des QCM de l'espace reviennent au bon moment : une question réussie s'espace (1, 3, 7, 15 puis 30 jours), une question manquée revient dès demain. Quelques minutes par jour suffisent.</p>
          <div class="chips" role="group" aria-label="Matière">${[["", "Toutes les matières"], ...ms.map(m => [m, m])].map(([v, l]) => `<button class="chip" type="button" data-rmat="${esc(v)}" aria-pressed="${matiere === v}">${esc(l)}<span class="n">${compte(v || null)}</span></button>`).join("")}</div>
          <div class="ea-maitrise">${ms.map(m => { const x = maitrise(m); return `<div><span>${esc(m)}</span><span class="ea-barre"><i style="width:${x.pct}%"></i></span><b>${x.ok}/${x.total}</b></div>`; }).join("")}</div>
          <p class="ea-aide">Une question est « maîtrisée » après trois bonnes réponses espacées.</p>
          ${compte(matiere || null) ? `<button class="btn btn-gold" type="button" data-raction="commencer">Commencer, ${compte(matiere || null)} questions</button>` : `<p class="ea-outil-fait"><b>Tout est à jour pour aujourd'hui.</b> Revenez demain pour la suite.</p>`}
        </div>`;
      poserFiligrane(corps, marque);
    };
    const question = () => {
      const x = liste[n], L = "ABCDEFGH";
      corps.innerHTML = `<div class="ea-outil ea-rev">
          <p class="ea-rev-tete"><span>Question ${n + 1} sur ${liste.length}</span><span>${esc(x.matiere)}${nouvelle(x) ? " · nouvelle" : ""}</span></p>
          <p class="ea-rev-q">${esc(x.q.q)}</p>
          <div class="ea-rev-options">${(x.q.options || []).map((o, j) => `<button type="button" class="ea-rev-opt" data-ropt="${j}"><b>${L[j]}</b><span>${esc(o)}</span></button>`).join("")}</div>
          <div class="ea-rev-retour" hidden></div>
        </div>`;
      poserFiligrane(corps, marque);
    };
    const repondre = j => {
      const x = liste[n], juste = j === x.q.bonne;
      if (juste) justes++;
      $$(".ea-rev-opt", corps).forEach((b, k) => { b.disabled = true; if (k === x.q.bonne) b.classList.add("ea-ok"); else if (k === j) b.classList.add("ea-ko"); });
      const r = $(".ea-rev-retour", corps);
      r.hidden = false;
      r.innerHTML = `<p class="${juste ? "ea-ok-t" : "ea-ko-t"}"><b>${juste ? "Bonne réponse." : "Ce n'est pas la bonne réponse."}</b> ${juste ? `Elle reviendra dans ${INTERVALLES[Math.min(5, ((progres.get(cleQ(x.c.id, x.i)) || {}).boite || 0) + 1)]} jours.` : "Elle reviendra demain."}</p>
        ${x.q.explication ? `<p>${esc(x.q.explication)}</p>` : ""}${x.q.reference ? `<p class="ea-aide">Référence : ${esc(x.q.reference)}</p>` : ""}
        <button class="btn btn-navy" type="button" data-raction="suivante">${n + 1 < liste.length ? "Question suivante" : "Voir le bilan"}</button>`;
      enregistrerReponse(x, juste);
    };
    const bilan = () => {
      corps.innerHTML = `<div class="ea-outil">
          <p class="ea-outil-fait"><b>${justes} bonne${justes > 1 ? "s" : ""} réponse${justes > 1 ? "s" : ""} sur ${liste.length}.</b> ${justes === liste.length ? "Sans faute." : "Les questions manquées reviendront demain."}</p>
          <div class="ea-maitrise">${matieresQcm().map(m => { const x = maitrise(m); return `<div><span>${esc(m)}</span><span class="ea-barre"><i style="width:${x.pct}%"></i></span><b>${x.ok}/${x.total}</b></div>`; }).join("")}</div>
          <button class="btn btn-ghost" type="button" data-raction="accueil">Revenir à la révision</button>
        </div>`;
      poserFiligrane(corps, marque);
      majOutils();
    };
    corps.onclick = e => {
      const m = e.target.closest("[data-rmat]");
      if (m) { matiere = m.dataset.rmat; accueil(); return; }
      const o = e.target.closest("[data-ropt]");
      if (o && !o.disabled) { repondre(+o.dataset.ropt); return; }
      const a = e.target.closest("[data-raction]");
      if (!a) return;
      if (a.dataset.raction === "commencer") { liste = seance(matiere || null); n = 0; justes = 0; question(); }
      if (a.dataset.raction === "suivante") { n++; if (n < liste.length) question(); else bilan(); }
      if (a.dataset.raction === "accueil") accueil();
    };
    accueil();
  }

  // Grand oral : question tirée parmi les séries publiées, préparation chronométrée (1 minute), réponse à voix haute
  // (3 minutes, comme le conseille la série), enregistrement facultatif qui reste sur l'appareil, puis grille
  // d'auto-évaluation et réponse attendue, ouverte à la bonne page.
  const GRILLE_ORAL = ["J'ai ouvert par une phrase qui donne la solution.", "J'ai cité les articles exacts.", "J'ai déroulé les fondements avec ordre.", "Je suis resté dans les trois minutes.", "J'ai anticipé la relance probable du jury."];
  const duree = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  function outilOral(corps, marque) {
    let minuterie = null, enregistreur = null, flux = null, audio = null, q = null;
    const faites = () => lu("ea-oral-faites", []);
    const arreter = () => {
      clearInterval(minuterie); minuterie = null;
      if (enregistreur && enregistreur.state !== "inactive") enregistreur.stop();
      if (flux) flux.getTracks().forEach(t => t.stop());
      flux = null;
    };
    arretOutil = () => { arreter(); if (audio) URL.revokeObjectURL(audio); };
    const peutEnregistrer = !!(navigator.mediaDevices && window.MediaRecorder);
    const liste = () => {
      arreter();
      const f = faites();
      corps.innerHTML = `<div class="ea-outil">
          <p>Le jury pose une question, vous avez une minute pour vous préparer, puis trois minutes pour répondre à voix haute. Ouvrez par la solution, puis déroulez-en les fondements, article à l'appui.</p>
          ${peutEnregistrer ? `<label class="ea-accord"><input type="checkbox" id="eaOralMicro"${lu("ea-oral-micro", false) ? " checked" : ""}><span>M'enregistrer pour me réécouter (l'enregistrement reste sur cet appareil)</span></label>` : ""}
          <button class="btn btn-gold" type="button" data-oaction="hasard">Tirer une question au hasard</button>
          <ol class="ea-oral-liste">${oralQuestions.map(x => `<li><button type="button" data-oq="${x.id}"><small>${esc(x.theme || "")}${f.includes(x.id) ? " · travaillée" : ""}</small>${esc(x.question)}</button></li>`).join("")}</ol>
        </div>`;
      poserFiligrane(corps, marque);
    };
    const chrono = (secondes, fin) => {
      let reste = secondes;
      const aff = $(".ea-chrono", corps);
      aff.textContent = duree(reste);
      clearInterval(minuterie);
      minuterie = setInterval(() => { reste--; aff.textContent = duree(Math.max(0, reste)); if (reste <= 10) aff.classList.add("ea-chrono-fin"); if (reste <= 0) { clearInterval(minuterie); fin(); } }, 1000);
    };
    const ecran = (etape, bouton) => {
      corps.innerHTML = `<div class="ea-outil ea-oral">
          <p class="ea-rev-tete"><span>${esc(q.theme || "Grand oral")}</span><span>${etape}</span></p>
          <p class="ea-oral-q">${esc(q.question)}</p>
          <p class="ea-chrono" aria-live="off"></p>
          ${bouton}
        </div>`;
      poserFiligrane(corps, marque);
    };
    const preparer = () => { ecran("Préparation", `<button class="btn btn-gold" type="button" data-oaction="repondre">Je suis prêt, je réponds</button>`); chrono(60, repondre); };
    const repondre = async () => {
      ecran("Réponse à voix haute", `<button class="btn btn-navy" type="button" data-oaction="terminer">J'ai terminé</button>`);
      chrono(180, terminer);
      if (lu("ea-oral-micro", false) && peutEnregistrer) {
        try {
          flux = await navigator.mediaDevices.getUserMedia({ audio: true });
          const morceaux = [];
          enregistreur = new MediaRecorder(flux);
          enregistreur.ondataavailable = e => morceaux.push(e.data);
          enregistreur.onstop = () => { if (audio) URL.revokeObjectURL(audio); audio = URL.createObjectURL(new Blob(morceaux, { type: enregistreur.mimeType })); const a = $("#eaOralAudio", corps); if (a) a.src = audio; };
          enregistreur.start();
          $(".ea-chrono", corps).insertAdjacentHTML("afterend", `<p class="ea-aide">Enregistrement en cours.</p>`);
        } catch (e) { toast("Micro indisponible : la réponse n'est pas enregistrée."); }
      }
    };
    const terminer = () => {
      arreter();
      ecrit("ea-oral-faites", [...new Set([...faites(), q.id])]);
      corps.innerHTML = `<div class="ea-outil ea-oral">
          <p class="ea-oral-q">${esc(q.question)}</p>
          ${lu("ea-oral-micro", false) && peutEnregistrer ? `<audio id="eaOralAudio" controls${audio ? ` src="${audio}"` : ""}></audio>` : ""}
          <fieldset class="ea-oral-grille"><legend>Votre auto-évaluation</legend>${GRILLE_ORAL.map((g, i) => `<label><input type="checkbox" data-og="${i}"> ${esc(g)}</label>`).join("")}</fieldset>
          <p class="ea-aide" id="eaOralScore"></p>
          <div class="ea-outil-boutons">
            <button class="btn btn-gold" type="button" data-oaction="corrige">Voir la réponse attendue</button>
            <button class="btn btn-ghost" type="button" data-oaction="hasard">Autre question</button>
            <button class="btn btn-ghost" type="button" data-oaction="liste">Toutes les questions</button>
          </div>
        </div>`;
      poserFiligrane(corps, marque);
      majOutils();
    };
    corps.onchange = e => {
      if (e.target.id === "eaOralMicro") ecrit("ea-oral-micro", e.target.checked);
      if (e.target.dataset.og !== undefined) { const n = $$("[data-og]:checked", corps).length; $("#eaOralScore", corps).textContent = `${n} point${n > 1 ? "s" : ""} sur ${GRILLE_ORAL.length}. ${n === GRILLE_ORAL.length ? "Réponse de niveau grand oral." : "Comparez avec la réponse attendue pour combler l'écart."}`; }
    };
    corps.onclick = e => {
      const b = e.target.closest("[data-oq], [data-oaction]");
      if (!b) return;
      if (b.dataset.oq) { q = oralQuestions.find(x => String(x.id) === b.dataset.oq); preparer(); return; }
      const a = b.dataset.oaction;
      if (a === "hasard") { const f = faites(), restantes = oralQuestions.filter(x => !f.includes(x.id)); const pool = restantes.length ? restantes : oralQuestions; q = pool[Math.floor(Math.random() * pool.length)]; preparer(); }
      if (a === "repondre") repondre();
      if (a === "terminer") terminer();
      if (a === "liste") liste();
      if (a === "corrige") { const c = contenus.find(x => x.id === q.contenu_id); if (c) ouvrirContenu(Object.assign({}, c, { page: q.page }), marque); }
    };
    if (!oralQuestions.length) { corps.innerHTML = `<p class="ea-vide">Les questions du grand oral arrivent bientôt.</p>`; return; }
    liste();
  }

  // Sujet de la semaine : un des sujets corrigés de l'espace, le même pour tous, qui change chaque lundi
  const corriges = () => contenus.filter(c => rubrique(c) === "corriges").sort((a, b) => a.id - b.id);
  const lundi = (decalage = 0) => { const d = new Date(auj() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7 * decalage); return d; };
  const numeroSemaine = (decalage = 0) => Math.floor(lundi(decalage).getTime() / (7 * 864e5));
  const sujetSemaine = (decalage = 0) => { const l = corriges(); return l.length ? l[((numeroSemaine(decalage) % l.length) + l.length) % l.length] : null; };
  const intituleSujet = c => c.titre.replace(/^(Cas pratique|Dissertation|Commentaire|SOG)( OHADA)? corrigée?s?\s*(de l'|du |de la )?/i, "").replace(/^:\s*/, "").replace(/^\w/, x => x.toUpperCase());
  const exerciceDe = c => /cas pratique/i.test(c.titre) ? "cas_pratique" : /commentaire/i.test(c.titre) ? "commentaire" : "dissertation";
  function outilSujet(corps, marque) {
    const c = sujetSemaine();
    const fin = lundi(); fin.setUTCDate(fin.getUTCDate() + 6);
    const avant = [1, 2, 3].map(k => sujetSemaine(-k)).filter((x, i, t) => x && x !== c && t.indexOf(x) === i);
    corps.innerHTML = `<div class="ea-outil">
        <p class="ea-rev-tete"><span>Du ${dateFr(lundi().toISOString())} au ${dateFr(fin.toISOString())}</span><span>${esc((c.matiere || "").replace(/^Corrigé\s*·\s*/i, ""))}</span></p>
        <p class="ea-oral-q">${esc(c.titre)}</p>
        <p>Traitez ce sujet en conditions réelles, sans ouvrir le corrigé : trois heures pour une dissertation ou un cas pratique, comme au concours. Comparez ensuite votre copie au corrigé${agent && agent.acces && (agent.actif || etat.admin) ? ", ou faites-la corriger et noter par l'agent de révision" : ""}.</p>
        <div class="ea-outil-boutons">
          <button class="btn btn-gold" type="button" data-saction="corrige">Ouvrir le corrigé</button>
          ${agent && agent.acces && (agent.actif || etat.admin) ? `<button class="btn btn-navy" type="button" data-saction="agent">Faire corriger ma copie</button>` : ""}
        </div>
        ${avant.length ? `<h4>Les semaines précédentes</h4><ul class="ea-oral-liste">${avant.map(x => `<li><button type="button" data-sid="${x.id}">${esc(x.titre)}</button></li>`).join("")}</ul>` : ""}
      </div>`;
    poserFiligrane(corps, marque);
    corps.onclick = e => {
      const s = e.target.closest("[data-sid]");
      if (s) { const x = contenus.find(y => String(y.id) === s.dataset.sid); if (x) ouvrirContenu(x, marque); return; }
      const a = e.target.closest("[data-saction]");
      if (!a) return;
      if (a.dataset.saction === "corrige") ouvrirContenu(c, marque);
      if (a.dataset.saction === "agent") {
        fermerVisionneuse();
        const d = $("#eaAgent"), f = $("#eaAgentForm");
        if (!d || !f) return;
        d.open = true; agentOuvert = true;
        f.exercice.value = exerciceDe(c);
        $("[name=mode][value=correction]", f).checked = true;
        $("#aCopieChamp").hidden = false;
        f.matiere.value = (c.matiere || "").replace(/^Corrigé\s*·\s*/i, "");
        f.sujet.value = intituleSujet(c);
        d.scrollIntoView({ behavior: "smooth", block: "start" });
        f.copie.focus({ preventScroll: true });
      }
    };
  }

  // Tableau de bord : compte à rebours du concours, série de jours, lectures, maîtrise des QCM, notes, badges
  const PLANNING = () => contenus.find(c => /^Planning de révision/i.test(c.titre));
  const joursAvant = () => etat.profil.date_concours ? joursJusqua(etat.profil.date_concours) : null;
  function badges() {
    const s = stats || { serie: 0, contenus_lus: 0, qcm_bonnes: 0 };
    const notes = echanges.filter(e => e.note != null).map(e => Number(e.note));
    const oral = lu("ea-oral-faites", []).length;
    const maitrisee = matieresQcm().some(m => maitrise(m).pct >= 80);
    return [
      ["Premiers pas", "Ouvrir un premier contenu", s.contenus_lus >= 1],
      ["Lecteur assidu", "Ouvrir dix contenus différents", s.contenus_lus >= 10],
      ["Une semaine", "Réviser sept jours d'affilée", s.serie >= 7],
      ["Un mois", "Réviser trente jours d'affilée", s.serie >= 30],
      ["Cinquante bonnes réponses", "Réussir cinquante questions de QCM", s.qcm_bonnes >= 50],
      ["Matière maîtrisée", "Maîtriser 80 % des questions d'une matière", maitrisee],
      ["Face au jury", "Travailler cinq questions du grand oral", oral >= 5],
      ["Première copie", "Faire corriger une copie par l'agent", notes.length >= 1],
      ["Au-dessus de la moyenne", "Obtenir plus de 12 sur 20 à une copie", notes.some(n => n > 12)]
    ];
  }
  function outilTableau(corps, marque) {
    const s = stats || { jours: [], serie: 0, contenus_lus: 0, qcm_bonnes: 0, qcm_erreurs: 0 };
    const j = joursAvant(), p = PLANNING();
    const semaine = j != null && j >= 0 && j < 84 ? 12 - Math.floor(j / 7) : null;
    const actifs = new Set(s.jours || []);
    const cases = Array.from({ length: 56 }, (_, k) => dansJours(k - 55));
    const notes = echanges.filter(e => e.note != null).slice(0, 6);
    const reste = etat.abo.actif && etat.abo.fin ? joursJusqua(etat.abo.fin) : null;
    corps.innerHTML = `<div class="ea-outil ea-tableau">
        <form class="ea-tb-concours" id="eaConcours">
          <label for="eaDateConcours">Date de mon concours</label>
          <input id="eaDateConcours" type="date" value="${esc(etat.profil.date_concours || "")}" min="${auj()}">
          <button class="btn btn-ghost btn-sm" type="submit">Enregistrer</button>
        </form>
        <div class="ea-tb-chiffres">
          <div><b>${j == null ? "–" : j < 0 ? "Passé" : "J-" + j}</b><span>avant le concours</span></div>
          <div><b>${s.serie}</b><span>jour${s.serie > 1 ? "s" : ""} de révision d'affilée</span></div>
          <div><b>${s.contenus_lus}</b><span>contenu${s.contenus_lus > 1 ? "s" : ""} ouvert${s.contenus_lus > 1 ? "s" : ""} sur ${contenus.length}</span></div>
          <div><b>${reste == null ? "–" : reste}</b><span>jour${reste > 1 ? "s" : ""} d'abonnement restant${reste > 1 ? "s" : ""}</span></div>
        </div>
        ${semaine && p ? `<p class="ea-outil-fait">Vous êtes dans la <b>semaine ${semaine} sur 12</b> du planning de révision. <button class="btn btn-ghost btn-sm" type="button" data-taction="planning">Ouvrir le planning</button></p>` : ""}
        <h4>Les huit dernières semaines</h4>
        <div class="ea-calendrier" aria-label="Jours de révision des huit dernières semaines">${cases.map(d => `<i class="${actifs.has(d) ? "ea-actif" : ""}" title="${dateFr(d)}"></i>`).join("")}</div>
        <h4>Maîtrise des QCM</h4>
        <div class="ea-maitrise">${matieresQcm().map(m => { const x = maitrise(m); return `<div><span>${esc(m)}</span><span class="ea-barre"><i style="width:${x.pct}%"></i></span><b>${x.pct} %</b></div>`; }).join("")}</div>
        ${notes.length ? `<h4>Vos dernières notes (agent de révision)</h4><p>${notes.map(e => `<span class="ea-tb-note">${noteFr(e.note)}/20</span>`).join(" ")}</p>` : ""}
        <h4>Vos badges</h4>
        <div class="ea-badges">${badges().map(([t, d, ok]) => `<div class="${ok ? "ea-badge-ok" : ""}"><b>${ok ? "★" : "☆"} ${t}</b><span>${d}</span></div>`).join("")}</div>
      </div>`;
    poserFiligrane(corps, marque);
    corps.onclick = e => { const a = e.target.closest("[data-taction]"); if (a && a.dataset.taction === "planning" && p) ouvrirContenu(p, marque); };
    corps.onsubmit = async e => {
      e.preventDefault();
      const v = $("#eaDateConcours", corps).value || null;
      const { error } = await client.from("profils").update({ date_concours: v }).eq("id", etat.uid);
      if (error) { toast(messageErreur(error)); return; }
      etat.profil.date_concours = v;
      toast(v ? "Date du concours enregistrée." : "Date du concours effacée.");
      outilTableau(corps, marque);
      majOutils();
    };
  }

  const OUTILS = {
    revision: ["Révision du jour", outilRevision],
    oral: ["Simulateur de grand oral", outilOral],
    sujet: ["Sujet de la semaine", outilSujet],
    tableau: ["Mon tableau de bord", outilTableau]
  };
  function outilsHTML() {
    const aFaire = seance(null).length, oral = oralQuestions.length, c = sujetSemaine(), j = joursAvant(), s = stats || { serie: 0 };
    const carte = (id, titre, texte, pied) => `<button class="ea-outil-carte" type="button" data-outil="${id}"><b>${titre}</b><span>${texte}</span><small>${pied}</small></button>`;
    return `<div class="ea-outils" id="eaOutils">
        ${toutesQuestions().length ? carte("revision", "Révision du jour", aFaire ? `${aFaire} question${aFaire > 1 ? "s" : ""} de QCM à travailler aujourd'hui.` : "Tout est à jour pour aujourd'hui.", "Méthode des boîtes, quelques minutes par jour") : ""}
        ${oral ? carte("oral", "Grand oral", `${oral} questions du jury, avec chrono et enregistrement.`, "Préparation 1 min, réponse 3 min") : ""}
        ${c ? carte("sujet", "Sujet de la semaine", esc(c.titre), "Nouveau sujet chaque lundi") : ""}
        ${carte("tableau", "Mon tableau de bord", `${s.serie} jour${s.serie > 1 ? "s" : ""} de révision d'affilée${j != null && j >= 0 ? `, J-${j} avant le concours` : ""}.`, "Progression, planning et badges")}
      </div>`;
  }
  async function majOutils() {
    try { const r = await client.rpc("mes_statistiques"); if (!r.error) stats = r.data; } catch (e) { /* hors ligne */ }
    const b = $("#eaOutils");
    if (b) b.outerHTML = outilsHTML();
  }
  const ouvrirOutil = id => ouvrirContenu({ outil: OUTILS[id][1], titre: OUTILS[id][0], type: "texte" }, marqueLecteur());

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
        chargerAgent().catch(() => { agent = null; }),
        chargerOutils().catch(() => { /* outils indisponibles : la bibliothèque reste accessible */ })
      ]);
      contenus = error ? [] : data;
      racine.innerHTML = compteHTML() + await annoncesHTML() + (etat.abo.actif ? statutHTML() : `<div class="ea-statut ea-statut-ok"><div><span class="eyebrow">Administrateur</span><h3>Vous voyez l'espace tel que vos abonnés le voient.</h3></div></div>`) + outilsHTML() + agentHTML() + bibliothequeHTML();
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
    const outil = e.target.closest("[data-outil]");
    if (outil && OUTILS[outil.dataset.outil]) { ouvrirOutil(outil.dataset.outil); return; }
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
