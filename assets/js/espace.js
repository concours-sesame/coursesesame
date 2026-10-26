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
  // Illustration : un bloc « ![légende](assets/img/blancs/fichier.jpg) », limité aux images du site
  const IMAGE = /^!\[([^\]]*)\]\((assets\/img\/blancs\/[a-z0-9-]+\.(?:jpg|png|webp|svg))\)$/;
  function mettreEnForme(t) {
    return esc(t).split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
      const img = b.match(IMAGE);
      if (img) return `<figure class="cb-figure"><img src="${ROOT}${img[2]}" alt="${img[1]}" loading="lazy"><figcaption>${img[1]}</figcaption></figure>`;
      return /^##\s/.test(b) ? `<h4>${b.replace(/^##\s+/, "")}</h4>` : `<p>${b.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
    }).join("");
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
  async function afficherPages(c, zone, depart, officiel) {
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
    const majQuota = lues => { if (!info.admin && !officiel && !plafondAtteint) quota.textContent = `Pages lues aujourd'hui ${lues} sur ${info.plafond}.`; };
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
    let attenteDefil = 0, dernierMemo = 0;
    // Page lue retenue pour « Reprendre ma lecture » (une écriture par seconde au plus)
    const memoriser = () => { if (memoLecture && Date.now() - dernierMemo > 1000) { dernierMemo = Date.now(); memoLecture(c, pageCourante()); } };
    const suivreDefil = () => { if (attenteDefil) return; attenteDefil = requestAnimationFrame(() => { attenteDefil = 0; if (document.activeElement !== champ) champ.value = pageCourante(); memoriser(); }); };
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
    // Ouverture à une page précise (réponse attendue du grand oral, reprise de la lecture…)
    if (depart > 1) requestAnimationFrame(() => allerA(depart));
    else if (memoLecture) memoLecture(c, 1);
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
    if (e.target.closest && e.target.closest(".ea-blanc-copie") && e.type === "selectstart") return;
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
        <button class="ea-v-favori" type="button" id="eaVFavori" aria-pressed="false" hidden></button>
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
  // Crochets posés par la page de l'espace abonnés : dernière page lue (« Reprendre ma lecture ») et favoris
  let memoLecture = null, favoris = null;
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
    const fav = $("#eaVFavori");
    fav.hidden = !(favoris && c.id && !c.agent && !c.outil && !c.verrou);
    if (!fav.hidden) {
      const maj = () => { const oui = favoris.est(c.id); fav.textContent = oui ? "★ Dans mes favoris" : "☆ Ajouter à mes favoris"; fav.setAttribute("aria-pressed", String(oui)); };
      maj();
      fav.onclick = () => { favoris.basculer(c.id); maj(); };
    }
    const corps = $("#eaVCorps");
    corps.classList.remove("ea-filigrane"); corps.style.backgroundImage = "";
    corps.innerHTML = `<p class="ea-attente">Chargement…</p>`;
    visionneuse.hidden = false;
    document.body.style.overflow = "hidden";
    document.body.classList.add("ea-lecture");
    $(".ea-v-fermer", visionneuse).focus();

    if (c.verrou) {
      const video = c.type === "video" && !etat.videos;
      corps.innerHTML = `<div class="ea-verrou">${icone("i-lock")}<p>${video
        ? "<b>Les vidéos sont réservées aux formules d'une semaine et plus.</b> Votre formule actuelle donne accès aux sujets corrigés, aux fiches de révision et aux QCM."
        : `<b>Les ouvrages complets sont réservés aux formules d'un mois et plus.</b> Votre formule actuelle donne accès à tous les autres contenus : sujets corrigés, fiches de révision${etat.videos ? ", QCM et vidéos" : " et QCM"}.`}</p>
          <a class="btn btn-wa" href="${lienWa(WA_NUM, c.verrou)}" target="_blank" rel="noopener">${icone("i-wa")}${video ? "Passer à une formule d'une semaine" : "Passer à une formule d'un mois"}</a></div>`;
      return;
    }
    if (c.agent) { afficherReponseAgent(c.agent, corps, marque); return; }
    if (c.outil) { c.outil(corps, marque); return; }
    // Ouverture comptée pour les statistiques de l'administration (la base ignore les administrateurs)
    client.rpc("noter_lecture", { p_contenu: c.id }).then(() => {}, () => {});
    const qcm = lireQcm(c);
    if (qcm) { lancerQcm(qcm, corps, marque); poserFiligrane(corps, marque); return; }
    if (c.type === "texte") {
      if (memoLecture) memoLecture(c, 1);
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
      // Textes officiels et jurisprudence : lecture sans plafond et texte complet téléchargeable
      const officiel = /^\s*(Texte officiel|Jurisprudence)/i.test(c.matiere || "");
      corps.innerHTML = `<div class="ea-pdf" aria-live="polite"><p class="ea-attente">Ouverture du document…</p></div>
        <p class="ea-mention">${officiel ? "Texte reproduit d'après sa source officielle, indiquée dans la présentation. Seule la publication au Journal officiel fait foi." : `Document réservé à ${esc(marque)}. Chaque page porte votre nom. Copie et impression désactivées ; quelques pages peuvent être téléchargées chaque mois.`}</p>`;
      try {
        await afficherPages(c, $(".ea-pdf", corps), c.page, officiel);
        if (!visionneuse.hidden) (officiel ? ajouterTexteComplet : ajouterTelechargement)(c, $(".ea-pdf", corps));
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

  /* ---------- Texte officiel : téléchargement du fichier complet ---------- */
  function ajouterTexteComplet(c, zone) {
    const barre = $(".ea-pdf-barre", zone);
    if (!barre) return;
    const bouton = document.createElement("button");
    bouton.type = "button"; bouton.className = "ea-pdf-tele"; bouton.textContent = "Télécharger le texte (PDF)";
    barre.appendChild(bouton);
    bouton.addEventListener("click", async () => {
      bouton.disabled = true;
      try {
        const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, 60);
        if (error || !data) throw new Error("Téléchargement impossible. Réessayez.");
        const rep = await fetch(data.signedUrl);
        if (!rep.ok) throw new Error("Téléchargement impossible. Réessayez.");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(await rep.blob());
        a.download = `${c.titre.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}.pdf`;
        zone.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      } catch (e) {
        toast(e.message);
      }
      bouton.disabled = false;
    });
  }

  /* ---------- Téléchargement de pages (limite mensuelle) ---------- */
  // Sur 30 jours glissants : 20 pages au plus en tout, 5 pages au plus d'un même document. Le PDF est découpé
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
        ? `Vous pouvez télécharger <b>${reste} page${reste > 1 ? "s" : ""}</b> de ce document. Sur 30 jours, ${data.quota} pages au plus pour l'ensemble des ouvrages (${data.utilises} déjà utilisée${data.utilises > 1 ? "s" : ""}) et ${data.par_document} au plus par ouvrage.`
        : `Limite atteinte pour ce document ou pour les 30 derniers jours. ${lib ? `Des pages se libèrent ${esc(lib)}.` : ""}`;
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

  window.Espace = { client, OUVERT, esc, dateFr, auj, joursJusqua, fcfa, WA_NUM, numeroWa, lienWa, TYPES, CONC, nomConcours, icone, messageErreur, erreurFonction, toast, ouvrirContenu, lienSur, etapeCode, formulaireCode, lireQcm, chargerPdfJs, mettreEnForme, poserFiligrane };

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
  let invitationInstall = null; // évènement « beforeinstallprompt » gardé pour le bouton « Installer l'application »
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
    const [p, a, adm, ouv, vid, sus, dem] = await Promise.all([
      client.from("profils").select("prenom, nom, telephone, concours, date_concours, emails_nouveautes, code_parrain").eq("id", uid).maybeSingle(),
      client.rpc("mon_abonnement"),
      client.from("admins").select("user_id").eq("user_id", uid).maybeSingle(),
      client.rpc("acces_ouvrages"),
      client.rpc("acces_videos"),
      client.rpc("ma_suspension"),
      client.from("demandes_activation").select("id, formule, montant, moyen, reference, statut, motif, cree_le").eq("user_id", uid).order("cree_le", { ascending: false }).limit(1)
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
      // Dernière demande d'activation envoyée depuis l'espace (en attente, validée ou refusée)
      demande: (!dem.error && dem.data && dem.data[0]) || null,
      admin: !!adm.data,
      // Ouvrages complets : formules d'un mois et plus seulement (règle appliquée par la base)
      ouvrages: !!adm.data || ouv.data === true,
      // Vidéos : formules d'une semaine et plus seulement (règle appliquée par la base)
      videos: !!adm.data || vid.data === true
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
          <summary><span class="ea-groupe-nom">${RUBRIQUES[r]}</span><span class="ea-groupe-n">${l.length}<span class="sr-only"> ${COMPTES[r][l.length > 1 ? 1 : 0]}</span></span>${r === "ouvrages" ? `<span class="ea-groupe-note">Formules d'un mois et plus</span>` : r === "videos" ? `<span class="ea-groupe-note">Formules d'une semaine et plus</span>` : ""}</summary>
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
        <p class="ea-aide full"><button class="ea-lien" type="button" data-oubli="ouvrir">Mot de passe oublié ?</button></p>
      </form>
      <form class="form ea-form" id="eaOubli" novalidate hidden>
        <p class="ea-aide full">Indiquez l'adresse e-mail de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe.</p>
        <div class="field full"><label for="oEmail">Adresse e-mail</label><input id="oEmail" type="email" autocomplete="email" required></div>
        <p class="ea-msg" role="alert"></p>
        <button class="btn btn-navy" type="submit">Recevoir le lien</button>
        <p class="ea-aide full"><button class="ea-lien" type="button" data-oubli="fermer">Revenir à la connexion</button>. Pas d'e-mail reçu ? <a href="${lienWa(WA_NUM, "Bonjour Les Cours Sésame & SAJ, j'ai oublié le mot de passe de mon compte abonné. Mon adresse e-mail : ")}" target="_blank" rel="noopener">Écrivez-nous sur WhatsApp</a>, nous vous donnons un mot de passe provisoire.</p>
      </form>
      <form class="form ea-form" id="eaInscription" novalidate ${onglet === "inscription" ? "" : "hidden"}>
        <div class="field"><label for="iPrenom">Prénom</label><input id="iPrenom" autocomplete="given-name" maxlength="60" required></div>
        <div class="field"><label for="iNom">Nom</label><input id="iNom" autocomplete="family-name" maxlength="60" required></div>
        <div class="field"><label for="iTel">Téléphone WhatsApp</label><input id="iTel" type="tel" inputmode="tel" autocomplete="tel" placeholder="07 XX XX XX XX" required></div>
        <div class="field"><label for="iConcours">Concours préparé</label><select id="iConcours"><option value="">Choisir…</option>${options}<option value="autre">Autre concours</option></select></div>
        <div class="field"><label for="iDate">Date du concours (facultatif)</label><input id="iDate" type="date" min="${auj()}"></div>
        <div class="field full"><label for="iEmail">Adresse e-mail</label><input id="iEmail" type="email" autocomplete="email" required></div>
        <div class="field full"><label for="iMdp">Mot de passe (8 caractères au moins)</label><input id="iMdp" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field full"><label for="iParrain">Code de parrainage (facultatif)</label><input id="iParrain" type="text" maxlength="12" autocomplete="off" autocapitalize="characters" value="${esc(codeParrainRecu())}"></div>
        <label class="ea-accord full"><input type="checkbox" id="iAccord" required><span>J'accepte que ces informations servent à gérer mon abonnement, comme l'expliquent les <a href="${ROOT}mentions-legales/#espace-abonnes" target="_blank">mentions légales</a>.</span></label>
        <p class="ea-msg" role="alert"></p>
        <button class="btn btn-navy" type="submit">Créer mon compte</button>
      </form>
    </div>`;
  }

  /* ---------- Demande d'activation en ligne ---------- */
  // L'abonné choisit sa formule, règle par Mobile Money et saisit la référence du paiement : la demande arrive dans
  // l'administration, qui vérifie le paiement et active l'accès. La page se met à jour d'elle-même à l'activation.
  const MOYENS_PAIEMENT = ["Orange Money", "MTN MoMo", "Wave", "Moov Money"];
  const tarifsAbo = () => (typeof TARIFS_ABONNEMENT !== "undefined" ? TARIFS_ABONNEMENT : []).filter(t => t.cle);
  const numerosPaiement = () => (typeof NUMEROS_PAIEMENT !== "undefined" ? NUMEROS_PAIEMENT : []).filter(n => n.moyen && n.numero);
  const prixDe = cle => { const t = tarifsAbo().find(x => x.cle === cle); return t ? Number(String(t.prix).replace(/\D/g, "")) || null : null; };
  const nomFormule = cle => { const t = tarifsAbo().find(x => x.cle === cle); return t ? t.duree : cle; };
  const demandeEnAttente = () => etat.demande && etat.demande.statut === "en_attente" ? etat.demande : null;
  function etapesPaiement(renouveler) {
    const nums = numerosPaiement();
    return `<ol class="ea-etapes">
        <li>Choisissez votre formule et réglez-la par Mobile Money (Orange Money, MTN MoMo, Wave ou Moov Money)${nums.length ? `, au numéro de votre opérateur ${nums.map(n => `<b>${esc(n.moyen)} ${esc(n.numero)}</b>`).join(", ")}` : ". Le numéro de paiement vous est donné sur WhatsApp"}.</li>
        <li>Saisissez ci-dessous la référence du paiement, telle qu'elle figure dans le SMS de confirmation, puis envoyez la demande.</li>
        <li>${renouveler ? "La nouvelle période s'ajoute à la suite de l'abonnement en cours" : "Votre accès s'ouvre"} dès la vérification du paiement. Cette page se met à jour d'elle-même.</li>
      </ol>`;
  }
  function formulairePaiement(renouveler) {
    const d = demandeEnAttente();
    return `<form class="form ea-form ea-paiement" id="eaPaiement" novalidate>
        <div class="field"><label for="pFormule">Formule</label><select id="pFormule" name="formule">${tarifsAbo().map(t => `<option value="${esc(t.cle)}"${(d ? d.formule === t.cle : t.cle === "m1") ? " selected" : ""}>${esc(t.duree)}, ${esc(t.prix)} FCFA</option>`).join("")}</select></div>
        <div class="field"><label for="pMoyen">Moyen de paiement</label><select id="pMoyen" name="moyen">${MOYENS_PAIEMENT.map(m => `<option${d && d.moyen === m ? " selected" : ""}>${m}</option>`).join("")}</select></div>
        <div class="field full"><label for="pRef">Référence du paiement</label><input id="pRef" name="reference" maxlength="80" autocomplete="off" value="${d ? esc(d.reference) : ""}"></div>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold" type="submit">${d ? "Mettre à jour ma demande" : renouveler ? "Envoyer ma demande de renouvellement" : "Envoyer ma demande d'activation"}</button>
      </form>`;
  }
  function demandeHTML() {
    const d = etat.demande;
    if (!d) return "";
    if (d.statut === "en_attente") return `<div class="ea-demande" role="status">
        <p><b>Demande envoyée le ${dateFr(d.cree_le)}.</b> ${esc(nomFormule(d.formule))}${d.montant != null ? `, ${fcfa(d.montant)}` : ""}, ${esc(d.moyen)}, référence ${esc(d.reference)}.</p>
        <p>Nous vérifions votre paiement. Votre accès s'ouvrira dès la validation, et cette page se mettra à jour d'elle-même.</p>
        <p class="ea-demande-actions"><button class="btn btn-ghost btn-sm" type="button" data-paiement="modifier">Corriger la demande</button><button class="btn btn-ghost btn-sm" type="button" data-paiement="retirer">Annuler la demande</button></p>
      </div>`;
    if (d.statut === "refusee" && !etat.abo.actif) return `<p class="ea-avis">Votre demande du ${dateFr(d.cree_le)} n'a pas pu être validée${d.motif ? ` (${esc(d.motif)})` : ""}. Vérifiez la référence et envoyez une nouvelle demande, ou écrivez-nous sur WhatsApp.</p>`;
    return "";
  }
  // Bloc complet : demande en cours, ou étapes et formulaire ; à défaut de tarifs publiés, la seule voie WhatsApp
  function paiementHTML(renouveler) {
    if (!tarifsAbo().length) return "";
    return demandeEnAttente()
      ? `${demandeHTML()}<div id="eaPaiementZone" hidden>${formulairePaiement(renouveler)}</div>`
      : `${demandeHTML()}${etapesPaiement(renouveler)}${formulairePaiement(renouveler)}`;
  }
  async function envoyerDemande(f) {
    const msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
    const formule = f.formule.value, moyen = f.moyen.value, reference = f.reference.value.trim();
    if (reference.replace(/[^A-Za-z0-9]/g, "").length < 4) { msg.textContent = "Indiquez la référence complète de votre paiement."; f.reference.focus(); return; }
    bouton.disabled = true; msg.textContent = "";
    const { error } = await client.rpc("demander_activation", { p_formule: formule, p_moyen: moyen, p_reference: reference, p_montant: prixDe(formule) });
    bouton.disabled = false;
    if (error) { msg.textContent = messageErreur(error); return; }
    toast("Demande envoyée. Nous vérifions votre paiement.");
    afficher();
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
          ${!etat.videos ? `<p>Votre formule donne accès à tous les contenus, sauf les vidéos, réservées aux formules d'une semaine et plus, et les ouvrages complets, réservés aux formules d'un mois et plus.</p>` : etat.ouvrages ? "" : `<p>Votre formule donne accès à tous les contenus, sauf les ouvrages complets, réservés aux formules d'un mois et plus.</p>`}</div>
          ${j <= 7 ? `<a class="btn btn-wa" href="${lienWa(WA_NUM, msg("Je souhaite renouveler mon abonnement à l'espace abonnés."))}" target="_blank" rel="noopener">${icone("i-wa")}Renouveler sur WhatsApp</a>` : ""}
        </div>${j <= 7 && tarifsAbo().length ? `<div class="ea-statut ea-statut-attente ea-renouvellement"><span class="eyebrow">Renouveler en ligne</span>${paiementHTML(true)}</div>` : ""}`;
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
        <p class="ea-aide">Les vidéos sont comprises à partir de la formule d'une semaine, les ouvrages complets à partir de la formule d'un mois. Toutes les formules donnent accès aux sujets corrigés, aux fiches de révision et aux QCM.</p>` : ""}
        ${tarifsAbo().length ? paiementHTML(false) : `<ol class="ea-etapes">
          <li>Réglez ${abo.deja_abonne ? "votre renouvellement" : "votre abonnement"} par Mobile Money : Orange Money, MTN MoMo, Wave ou Moov Money. Nous vous indiquons le tarif sur WhatsApp.</li>
          <li>Envoyez-nous le message ci-dessous sur WhatsApp, avec la référence de votre paiement.</li>
          <li>Votre accès s'ouvre dès réception du paiement : rechargez alors cette page.</li>
        </ol>`}
        <p class="ea-aide ea-wa-secours">${tarifsAbo().length ? "Une question sur le paiement ? " : ""}<a class="btn ${tarifsAbo().length ? "btn-ghost btn-sm" : "btn-wa"}" href="${lienWa(WA_NUM, msg(abo.deja_abonne ? "Je souhaite renouveler mon abonnement à l'espace abonnés." : "Je souhaite activer mon abonnement à l'espace abonnés."))}" target="_blank" rel="noopener">${icone("i-wa")}${tarifsAbo().length ? "Écrire sur WhatsApp" : abo.deja_abonne ? "Renouveler sur WhatsApp" : "Activer sur WhatsApp"}</a></p>
      </div>`;
  }

  function compteHTML() {
    const { profil, email, admin } = etat;
    return `<div class="ea-compte">
        <span>Connecté : <b>${esc(profil.prenom)} ${esc(profil.nom)}</b> · ${esc(email)}</span>
        <div class="ea-compte-actions">
          ${admin ? `<a class="btn btn-gold btn-sm" href="${ROOT}espace-abonnes/admin/">Administration</a>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" id="eaInstaller"${invitationInstall ? "" : " hidden"}>Installer l'application</button>
          <button class="btn btn-ghost btn-sm" type="button" id="eaMonCompte" aria-expanded="false" aria-controls="eaPanneau">Mon compte</button>
          <button class="btn btn-ghost btn-sm" type="button" id="eaSortir">Se déconnecter</button>
        </div>
      </div>
      <div class="ea-panneau" id="eaPanneau" hidden>
        <form class="form ea-form" id="eaConcoursForm" novalidate>
          <div class="field full"><label for="mConcours">Concours préparé</label><select id="mConcours">${profil.concours ? "" : `<option value="">Choisir…</option>`}${[...CONC.map(c => [c.id, c.court]), ["autre", "Autre concours"]].map(([v, l]) => `<option value="${v}"${profil.concours === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
          <p class="ea-msg" role="alert"></p>
          <button class="btn btn-ghost btn-sm" type="submit">Enregistrer le concours</button>
        </form>
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
        <form class="form ea-form" id="eaEmails" novalidate>
          <label class="ea-accord full"><input type="checkbox" name="nouveautes"${profil.emails_nouveautes === false ? "" : " checked"}><span>Recevoir par e-mail l'annonce des nouveaux contenus (un e-mail par jour au plus, seulement s'il y a des nouveautés) et un rappel si vous ne passez pas pendant quelques jours (une fois par semaine au plus)</span></label>
          <p class="ea-msg" role="alert"></p>
        </form>
      </div>`;
  }

  let contenus = [], filtre = "tous";
  // Rubriques de la bibliothèque, d'après la matière saisie (« Ouvrage · … », « Fiches · … », « Corrigé · … ») ou le type
  const RUBRIQUES = { ouvrages: "Ouvrages complets", fiches: "Fiches de révision", corriges: "Sujets corrigés", qcm: "QCM", videos: "Vidéos", textes: "Textes officiels", jurisprudence: "Jurisprudence", autres: "Autres contenus" };
  const rubrique = c => /^\s*Texte officiel/i.test(c.matiere || "") ? "textes" : /^\s*Jurisprudence/i.test(c.matiere || "") ? "jurisprudence" : /^Ouvrage/i.test(c.matiere || "") ? "ouvrages" : lireQcm(c) ? "qcm" : /^Fiches/i.test(c.matiere || "") ? "fiches" : /^Corrigé/i.test(c.matiere || "") ? "corriges" : c.type === "video" ? "videos" : "autres";
  const sansAccents = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Affichés avec un cadenas : un ouvrage complet avec une formule de moins d'un mois, une vidéo avec une formule de moins d'une semaine
  const verrouOuvrage = c => !etat.ouvrages && rubrique(c) === "ouvrages";
  const verrouVideo = c => !etat.videos && c.type === "video";
  const verrouille = c => verrouOuvrage(c) || verrouVideo(c);
  const noteVerrou = c => verrouOuvrage(c) ? "Formules d'un mois et plus" : "Formules d'une semaine et plus";
  const msgFormule = c => c && !verrouOuvrage(c) && verrouVideo(c) ? `Bonjour Les Cours Sésame & SAJ,\n\nJe souhaite passer à une formule d'une semaine ou plus pour accéder aux vidéos.\n👤 ${etat.profil.prenom} ${etat.profil.nom}\n📧 ${etat.email}\n📞 ${etat.profil.telephone}\n\nRéférence de mon paiement Mobile Money : ` : `Bonjour Les Cours Sésame & SAJ,\n\nJe souhaite passer à une formule d'un mois ou plus pour accéder aux ouvrages complets.\n👤 ${etat.profil.prenom} ${etat.profil.nom}\n📧 ${etat.email}\n📞 ${etat.profil.telephone}\n\nRéférence de mon paiement Mobile Money : `;
  // Bibliothèque centrée sur le concours de l'abonné : par défaut, les contenus de son concours et les contenus
  // communs à tous les concours ; un bouton montre tout. Favoris, pastille « Nouveau » et reprise de la lecture
  // sont mémorisés sur cet appareil (un compte ne s'utilise que sur un appareil à la fois).
  let portee = null; // "moi" ou "tous" ; null : choix automatique
  const monConcours = () => { const id = etat.profil && etat.profil.concours; return CONC.some(c => c.id === id) ? id : null; };
  const pourMoi = c => !(c.concours && c.concours.length) || c.concours.includes(monConcours());
  const porteeActive = () => !monConcours() ? "tous" : portee || (contenus.some(pourMoi) ? "moi" : "tous");
  const cleAbonne = nom => `ea-${nom}-${etat.uid}`;
  let vuAvant = null; // date de la visite précédente sur cet appareil (contenus « Nouveau »)
  const estNouveau = c => !!vuAvant && !!c.publie_le && new Date(c.publie_le) > vuAvant && new Date(c.publie_le) <= new Date();
  const listeFavoris = () => lu(cleAbonne("favoris"), []);
  const crochetFavoris = {
    est: id => listeFavoris().includes(id),
    basculer: id => {
      const l = listeFavoris(), i = l.indexOf(id);
      if (i >= 0) l.splice(i, 1); else l.unshift(id);
      ecrit(cleAbonne("favoris"), l.slice(0, 300));
      toast(i >= 0 ? "Retiré de vos favoris." : "Ajouté à vos favoris.");
      const b = $(".ea-biblio", racine); if (b) b.outerHTML = bibliothequeHTML();
    }
  };
  function bibliothequeHTML() {
    if (!contenus.length) return `<div class="ea-biblio"><p class="ea-vide">Les premiers contenus exclusifs arrivent très bientôt. Revenez nous voir.</p></div>`;
    const moi = porteeActive() === "moi", base = moi ? contenus.filter(pourMoi) : contenus;
    const favs = new Set(listeFavoris()), nbFavs = base.filter(c => favs.has(c.id)).length;
    const rubs = Object.keys(RUBRIQUES).filter(r => base.some(c => rubrique(c) === r));
    if (filtre !== "tous" && !(filtre === "favoris" ? nbFavs : rubs.includes(filtre))) filtre = "tous";
    const liste = filtre === "tous" ? base : filtre === "favoris" ? base.filter(c => favs.has(c.id)) : base.filter(c => rubrique(c) === filtre);
    const chips = [["tous", "Tous", base.length], ...(nbFavs ? [["favoris", "★ Mes favoris", nbFavs]] : []), ...rubs.map(r => [r, RUBRIQUES[r], base.filter(c => rubrique(c) === r).length])];
    const nomMoi = monConcours() ? nomConcours(monConcours()) : "";
    return `<div class="ea-biblio">
        <div class="ea-biblio-tete"><h3>Vos contenus exclusifs</h3>
          ${monConcours() ? `<div class="ea-portee" role="group" aria-label="Concours">
            <button type="button" data-portee="moi" aria-pressed="${moi}">${esc(nomMoi)}<span class="n">${contenus.filter(pourMoi).length}</span></button>
            <button type="button" data-portee="tous" aria-pressed="${!moi}">Tous les concours<span class="n">${contenus.length}</span></button>
          </div>` : ""}
          ${chips.length > 2 ? `<div class="chips" role="group" aria-label="Filtrer par rubrique">${chips.map(([v, l, n]) => `<button class="chip" type="button" data-filtre="${v}" aria-pressed="${filtre === v}">${l}<span class="n">${n}</span></button>`).join("")}</div>` : ""}
          ${base.length > 8 ? `<label class="ea-cherche"><span class="sr-only">Rechercher un contenu</span><input type="search" id="eaCherche" placeholder="Rechercher : titre, matière, concours…" autocomplete="off"></label>` : ""}
        </div>
        ${["textes", "jurisprudence"].includes(filtre) ? rechercheTextesHTML() : ""}
        <p class="ea-vide" id="eaAucun" hidden>Aucun contenu ne correspond à cette recherche.</p>
        <div class="ea-grille">${liste.map(c => `<button class="ea-carte${verrouille(c) ? " ea-carte-verrou" : ""}" type="button" data-id="${c.id}" data-texte="${esc(sansAccents([c.titre, c.description, c.matiere, (c.concours || []).map(nomConcours).join(" ")].join(" ")))}">
            <span class="ea-carte-marques"><span class="ea-type ea-type-${c.type}">${typeAffiche(c).nom}</span>${estNouveau(c) ? `<span class="ea-nouveau">Nouveau</span>` : ""}${favs.has(c.id) ? `<span class="ea-fav" aria-label="Favori">★</span>` : ""}</span>
            <b>${esc(c.titre)}</b>
            ${c.description ? `<span class="ea-carte-desc">${esc(c.description)}</span>` : ""}
            <small>${[c.matiere ? esc(c.matiere) : "", (c.concours || []).map(nomConcours).join(", "), dateFr(c.publie_le)].filter(Boolean).join(" · ")}</small>
            <span class="ea-carte-go">${verrouille(c) ? icone("i-lock") + noteVerrou(c) : typeAffiche(c).action + icone("i-arrow")}</span>
          </button>`).join("")}</div>
      </div>`;
  }
  // « Reprendre ma lecture » : dernier document ou fiche ouvert sur cet appareil, à la dernière page lue
  const lireReprise = () => { const r = lu(cleAbonne("reprise"), null); const c = r && contenus.find(x => x.id === r.id); return c && !verrouille(c) ? { c, page: Math.max(1, Number(r.page) || 1) } : null; };
  function repriseHTML() {
    const r = lireReprise();
    if (!r) return "";
    return `<button class="ea-reprise" type="button" data-reprise="1">
        <span class="eyebrow">Reprendre ma lecture</span>
        <b>${esc(r.c.titre)}</b>
        <span>${r.c.type === "pdf" && r.page > 1 ? `Page ${r.page}` : typeAffiche(r.c).nom}</span>
      </button>`;
  }

  // Recherche dans le texte des textes officiels et de la jurisprudence (fonction rechercher_textes de la base) :
  // un extrait par page trouvée, puis ouverture du document à cette page
  let rechercheT = "", resultatsT = null;
  const extraitHTML = t => esc(t).replace(/\[\[/g, "<mark>").replace(/\]\]/g, "</mark>");
  function resultatsTextesHTML() {
    if (resultatsT === null) return "";
    if (!resultatsT.length) return `<p class="ea-vide">Aucun passage trouvé. Essayez un autre mot, ou le numéro d'article seul (par exemple « article 461 »).</p>`;
    return `<ol class="ea-textes-res">${resultatsT.map((r, i) => `<li><button type="button" data-texte-res="${i}"><b>${esc(r.titre)}</b><small>Page ${r.page}</small><span>${extraitHTML(r.extrait)}</span></button></li>`).join("")}</ol>`;
  }
  const rechercheTextesHTML = () => `<form class="ea-textes-cherche" id="eaTextesForm" role="search">
      <label for="eaTextesQ">Rechercher dans le texte des lois et des décisions</label>
      <div><input type="search" id="eaTextesQ" value="${esc(rechercheT)}" placeholder="Ex. : détention préventive, article 461, prescription" autocomplete="off"><button class="btn btn-navy btn-sm" type="submit">Chercher</button></div>
      <div id="eaTextesRes" aria-live="polite">${resultatsTextesHTML()}</div>
    </form>`;
  async function chercherTextes(q) {
    rechercheT = q.trim();
    const zone = $("#eaTextesRes");
    if (!rechercheT) { resultatsT = null; if (zone) zone.innerHTML = ""; return; }
    if (zone) zone.innerHTML = `<p class="ea-attente">Recherche…</p>`;
    const { data, error } = await client.rpc("rechercher_textes", { p_texte: rechercheT });
    resultatsT = error ? [] : data || [];
    if (zone) zone.innerHTML = error ? `<p class="ea-erreur">${esc(messageErreur(error))}</p>` : resultatsTextesHTML();
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
    const { fin, erreur } = await appelAgent(d, session, n => { progres.textContent = `Rédaction en cours, ${n.toLocaleString("fr-FR")} mots…`; });
    agentEnCours = false;
    if (erreur) { sortie.hidden = true; bouton.disabled = false; msg.textContent = erreur; return; }
    const e = noterEchange(d, fin);
    agentOuvert = true;
    $("#eaAgent").outerHTML = agentHTML();
    ouvrirEchange(e);
  }
  // Appel de la fonction agent-revision, réponse lue au fil de la rédaction ; renvoie { fin } ou { erreur }
  async function appelAgent(d, session, progres) {
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
          if (o.t) { texte += o.t; progres(texte.split(/\s+/).length); }
          if (o.fin) fin = o.fin;
          if (o.erreur) erreur = o.erreur;
        }
      }
      if (!fin && !erreur) erreur = "La rédaction a été interrompue. Réessayez dans quelques minutes.";
    } catch (e) { erreur = messageErreur(e); }
    return { fin, erreur };
  }
  function noterEchange(d, fin) {
    const e = { id: fin.id, exercice: d.exercice, mode: d.mode, matiere: d.matiere, sujet: d.sujet, reponse: fin.reponse, note: fin.note, sources: fin.sources, tronque: fin.tronque, cree_le: new Date().toISOString() };
    echanges.unshift(e);
    agent.utilises_jour++; agent.utilises_mois++;
    return e;
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
    await chargerEpreuvesBlanches().catch(() => { nbEpreuvesBlanches = null; });
    stats = s.error ? null : s.data;
    oralQuestions = g.error ? [] : g.data;
    await chargerBlancs().catch(() => { blancs = []; });
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

  /* ---------- Concours blanc ---------- */
  // Épreuve à date et heure fixes (table concours_blancs, créée depuis l'administration). Le sujet n'arrive qu'au début ;
  // la copie s'enregistre toutes les 30 secondes et part d'elle-même à la fin. Après la fin, la copie rendue est
  // corrigée et notée par l'agent de révision, telle quelle ; la base retient la note et calcule le rang (anonyme).
  let blancs = [];
  const heureFr = d => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const jourHeure = d => `${dateFr(d)} à ${heureFr(d)}`;
  const dureeTxt = m => m % 60 ? `${Math.floor(m / 60) ? Math.floor(m / 60) + " h " : ""}${m % 60} min` : `${m / 60} h`;
  const restant = ms => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return `${h ? h + " h " : ""}${String(m).padStart(h ? 2 : 1, "0")} min ${String(x).padStart(2, "0")} s`; };
  async function chargerBlancs() { const r = await client.rpc("mes_concours_blancs"); blancs = r.error ? [] : r.data || []; }
  // Épreuve mise en avant : en cours, sinon la prochaine, sinon la plus récente
  function blancEnVue() {
    const t = Date.now();
    return blancs.find(b => new Date(b.debut) <= t && t <= new Date(b.fin)) ||
      [...blancs].filter(b => new Date(b.debut) > t).sort((x, y) => new Date(x.debut) - new Date(y.debut))[0] || blancs[0] || null;
  }
  function carteBlanc() {
    const b = blancEnVue(); if (!b) return "";
    const t = Date.now(), debut = new Date(b.debut), fin = new Date(b.fin);
    const texte = t < debut ? `${esc(b.titre)}, le ${jourHeure(b.debut)}.` : t <= fin ? `${esc(b.titre)} : l'épreuve est en cours, jusqu'à ${heureFr(b.fin)}.` : b.note != null ? `${esc(b.titre)} : ${noteFr(b.note)}/20, rang ${b.rang} sur ${b.notes}.` : `${esc(b.titre)} : épreuve terminée, ${agent && agent.acces && agent.actif ? "faites corriger votre copie" : "lisez le corrigé-type"}.`;
    return `<button class="ea-outil-carte" type="button" data-outil="blanc"><b>Concours blanc</b><span>${texte}</span><small>${EXERCICES[b.exercice] || ""}, ${dureeTxt(b.duree_minutes)}, en conditions réelles</small></button>`;
  }
  function outilBlanc(corps, marque, id) {
    const b = id ? blancs.find(x => x.id === id) : blancEnVue();
    if (!b) { corps.innerHTML = `<p class="ea-vide">Aucun concours blanc pour le moment.</p>`; return; }
    let minuterie = null, sauvegarde = null, envoye = false;
    arretOutil = () => { clearInterval(minuterie); clearInterval(sauvegarde); };
    const autres = blancs.filter(x => x !== b);
    const tete = `<p class="ea-rev-tete"><span>${EXERCICES[b.exercice] || ""}${b.matiere ? ", " + esc(b.matiere) : ""}</span><span>${jourHeure(b.debut)}, ${dureeTxt(b.duree_minutes)}</span></p><h4>${esc(b.titre)}</h4>`;
    const pied = autres.length ? `<h4>Autres épreuves</h4><ul class="ea-oral-liste">${autres.map(x => `<li><button type="button" data-blanc="${x.id}">${esc(x.titre)}, ${dateFr(x.debut)}</button></li>`).join("")}</ul>` : "";
    const t = Date.now(), debut = new Date(b.debut), fin = new Date(b.fin), limite = fin.getTime() + 5 * 60000;
    const sujetHTML = b.sujet ? `<div class="ea-blanc-sujet">${mettreEnForme(b.sujet)}</div>` : "";
    if (t < debut) {
      corps.innerHTML = `<div class="ea-outil">${tete}<p>Le sujet s'affichera ici le <b>${jourHeure(b.debut)}</b>. Vous aurez ${dureeTxt(b.duree_minutes)}, comme au concours : préparez de quoi écrire au brouillon, puis saisissez votre copie dans l'espace prévu. Elle s'enregistre seule et part automatiquement à la fin.</p>
        <p class="ea-blanc-chrono">Début dans <b id="eaBlancChrono">${restant(debut - t)}</b></p>${pied}</div>`;
      minuterie = setInterval(() => { const r = new Date(b.debut) - Date.now(); if (r <= 0) { arretOutil(); chargerBlancs().then(() => outilBlanc(corps, marque, b.id)); return; } const c = $("#eaBlancChrono"); if (c) c.textContent = restant(r); }, 1000);
      corps.onclick = ouvrirAutre;
    } else if (t <= limite && !b.rendue_le) {
      corps.innerHTML = `<div class="ea-outil">${tete}${sujetHTML}
        <p class="ea-blanc-chrono">Temps restant : <b id="eaBlancChrono">${restant(fin - t)}</b></p>
        <label class="ea-blanc-label" for="eaBlancCopie">Votre copie</label>
        <textarea class="ea-blanc-copie" id="eaBlancCopie" rows="18" maxlength="40000" spellcheck="true">${esc(b.copie || "")}</textarea>
        <p class="ea-blanc-etat" id="eaBlancEtat" aria-live="polite">${b.copie ? "Copie reprise là où vous l'aviez laissée." : "La copie s'enregistre toutes les 30 secondes."}</p>
        <div class="ea-outil-boutons"><button class="btn btn-gold" type="button" data-bl="rendre">Rendre ma copie</button></div></div>`;
      const zone = $("#eaBlancCopie"), etatTxt = $("#eaBlancEtat");
      let dernier = zone.value;
      const enregistrer = async rendre => {
        if (envoye) return;
        if (!rendre && zone.value === dernier) return;
        const texte = zone.value;
        const { error } = await client.rpc("enregistrer_copie_blanc", { p_concours: b.id, p_copie: texte, p_rendre: !!rendre });
        if (error) { etatTxt.textContent = messageErreur(error); return; }
        dernier = texte; b.copie = texte;
        etatTxt.textContent = `Enregistrée à ${heureFr(new Date())}.`;
        if (rendre) { envoye = true; clearInterval(minuterie); clearInterval(sauvegarde); b.rendue_le = new Date().toISOString(); toast("Copie rendue."); outilBlanc(corps, marque, b.id); }
      };
      sauvegarde = setInterval(() => enregistrer(false), 30000);
      // Fermeture de la visionneuse pendant l'épreuve : dernier enregistrement
      arretOutil = () => { clearInterval(minuterie); clearInterval(sauvegarde); enregistrer(false); };
      minuterie = setInterval(() => { const r = new Date(b.fin) - Date.now(); const c = $("#eaBlancChrono"); if (c) c.textContent = r > 0 ? restant(r) : "temps écoulé"; if (r <= 0) enregistrer(true); }, 1000);
      corps.onclick = e => { if (e.target.closest("[data-bl=rendre]") && confirm("Rendre votre copie maintenant ? Vous ne pourrez plus la modifier.")) enregistrer(true); else ouvrirAutre(e); };
      return;
    } else {
      const ouvert = agent && agent.acces && (agent.actif || etat.admin);
      const copie = (b.copie || "").trim();
      let resultat;
      if (!copie) resultat = `<p class="ea-vide">Vous n'avez pas rendu de copie pour cette épreuve.</p>`;
      else if (t <= fin) resultat = `<p>Copie rendue. La correction s'ouvre à la fin de l'épreuve, à ${heureFr(b.fin)}.</p>`;
      else if (b.note != null) resultat = `<div class="ea-blanc-note"><b>${noteFr(b.note)}/20</b><span>Rang ${b.rang} sur ${b.notes} ${b.notes > 1 ? "copies notées" : "copie notée"}. Moyenne ${noteFr(b.moyenne)}, meilleure note ${noteFr(b.meilleure)}.</span></div>${echanges.some(x => x.sujet && x.sujet.trim() === (b.sujet || "").trim() && x.note != null) ? `<div class="ea-outil-boutons"><button class="btn btn-ghost" type="button" data-bl="voir">Relire la correction</button></div>` : ""}`;
      else if (copie.length < 200) resultat = `<p>Votre copie est trop courte pour être corrigée par l'agent (200 caractères au moins).</p>`;
      else if (!ouvert) resultat = `<p>${agent && agent.acces ? "La correction notée par l'agent de révision n'est pas encore ouverte." : "La correction notée par l'agent de révision est réservée aux formules d'un mois et plus."} Comparez votre copie au corrigé-type et notez-la vous-même avec sa grille d'auto-évaluation.</p>`;
      else resultat = `<p>L'épreuve est terminée. Faites corriger et noter votre copie, telle que vous l'avez rendue, par l'agent de révision. Votre note entre ensuite dans le classement.</p><div class="ea-outil-boutons"><button class="btn btn-gold" type="button" data-bl="corriger">Faire corriger ma copie</button></div><p class="ea-agent-progres" id="eaBlancProgres"></p>`;
      corps.innerHTML = `<div class="ea-outil">${tete}${sujetHTML}${copie ? `<h4>Votre copie</h4><div class="ea-blanc-rendue">${mettreEnForme(copie)}</div>` : ""}${resultat}<div id="eaBlancCorrige"></div>${pied}</div>`;
      // Corrigé-type de l'épreuve, publié à sa fin (concours_blancs.corrige_id, livré par corrige_blanc)
      let corrige = null;
      if (t > fin) client.rpc("corrige_blanc", { p_concours: b.id }).then(async r => {
        if (r.error || !r.data) return;
        corrige = contenus.find(x => x.id === r.data);
        if (!corrige) { const q = await client.from("contenus").select("id, titre, description, type, fichier, texte, lien, concours, matiere, publie_le").eq("id", r.data).maybeSingle(); corrige = q.data; }
        const z = $("#eaBlancCorrige");
        if (corrige && z) z.innerHTML = `<div class="ea-outil-boutons"><button class="btn btn-navy" type="button" data-bl="corrige">Lire le corrigé-type et sa grille</button></div>`;
      });
      corps.onclick = async e => {
        const a = e.target.closest("[data-bl]");
        if (a && a.dataset.bl === "corrige" && corrige) { arretOutil(); ouvrirContenu(corrige, marque); return; }
        if (a && a.dataset.bl === "voir") { const x = echanges.find(y => y.sujet && y.sujet.trim() === (b.sujet || "").trim() && y.note != null); if (x) ouvrirEchange(x); return; }
        if (a && a.dataset.bl === "corriger") {
          const { data: { session } } = await client.auth.getSession();
          if (!session) { afficher(); return; }
          a.disabled = true; agentEnCours = true;
          const prog = $("#eaBlancProgres");
          prog.textContent = "Correction en cours. Comptez une à deux minutes et gardez la page ouverte.";
          const d = { exercice: b.exercice, mode: "correction", matiere: b.matiere || "", sujet: b.sujet, copie };
          const { fin: f, erreur } = await appelAgent(d, session, n => { prog.textContent = `Correction en cours, ${n.toLocaleString("fr-FR")} mots…`; });
          agentEnCours = false;
          if (erreur) { a.disabled = false; prog.textContent = erreur; return; }
          const ech = noterEchange(d, f);
          const r = await client.rpc("noter_copie_blanc", { p_concours: b.id, p_echange: f.id });
          if (r.error) toast(messageErreur(r.error));
          await chargerBlancs();
          majOutils();
          ouvrirEchange(ech);
          return;
        }
        ouvrirAutre(e);
      };
    }
    function ouvrirAutre(e) { const o = e.target.closest("[data-blanc]"); if (o) { arretOutil(); outilBlanc(corps, marque, Number(o.dataset.blanc)); } }
  }

  // Épreuves blanches en accès libre (page concours-blancs/), au concours de l'abonné : le cycle supérieur par défaut,
  // les autres cycles s'ouvrent depuis la page
  const BLANCS_DU_CONCOURS = { infj: "magistrature", greffe: "greffe_cs", penitentiaire: "penitentiaire_cs", eppjej: "eppjej_cs", ena: "ena_cs" };
  let nbEpreuvesBlanches = null;
  async function chargerEpreuvesBlanches() {
    const id = BLANCS_DU_CONCOURS[etat.profil && etat.profil.concours];
    nbEpreuvesBlanches = null;
    if (!id) return;
    const r = await client.rpc("epreuves_blanches_liste", { p_concours: id });
    nbEpreuvesBlanches = r.error ? null : (r.data || []).length;
  }
  function carteEpreuvesBlanches() {
    const id = BLANCS_DU_CONCOURS[etat.profil && etat.profil.concours];
    const lien = `${ROOT}concours-blancs/${id ? `?concours=${id}` : ""}`;
    const texte = id && nbEpreuvesBlanches ? `${nbEpreuvesBlanches} épreuves blanches ${id === "magistrature" ? "de la magistrature" : `du concours ${esc(nomConcours(etat.profil.concours))}`}, chronométrées.` : "Des séries complètes pour chaque concours, chronométrées.";
    return `<a class="ea-outil-carte" href="${lien}"><b>Épreuves blanches</b><span>${texte}</span><small>Corrigé dès la copie rendue</small></a>`;
  }

  const OUTILS = {
    blanc: ["Concours blanc", outilBlanc],
    revision: ["Révision du jour", outilRevision],
    oral: ["Simulateur de grand oral", outilOral],
    sujet: ["Sujet de la semaine", outilSujet],
    tableau: ["Mon tableau de bord", outilTableau]
  };
  function outilsHTML() {
    const aFaire = seance(null).length, oral = oralQuestions.length, c = sujetSemaine(), j = joursAvant(), s = stats || { serie: 0 };
    const carte = (id, titre, texte, pied) => `<button class="ea-outil-carte" type="button" data-outil="${id}"><b>${titre}</b><span>${texte}</span><small>${pied}</small></button>`;
    return demarrageHTML() + `<div class="ea-outils" id="eaOutils">
        ${carteBlanc()}
        ${carteEpreuvesBlanches()}
        ${toutesQuestions().length ? carte("revision", "Révision du jour", aFaire ? `${aFaire} question${aFaire > 1 ? "s" : ""} de QCM à travailler aujourd'hui.` : "Tout est à jour pour aujourd'hui.", "Méthode des boîtes, quelques minutes par jour") : ""}
        ${oral ? carte("oral", "Grand oral", `${oral} questions du jury, avec chrono et enregistrement.`, "Préparation 1 min, réponse 3 min") : ""}
        ${c ? carte("sujet", "Sujet de la semaine", esc(c.titre), "Nouveau sujet chaque lundi") : ""}
        ${carte("tableau", "Mon tableau de bord", `${s.serie} jour${s.serie > 1 ? "s" : ""} de révision d'affilée${j != null && j >= 0 ? `, J-${j} avant le concours` : ""}.`, "Progression, planning et badges")}
      </div>`;
  }
  // Pour bien commencer : trois premiers gestes, cochés d'après l'usage réel. L'encadré disparaît quand tout est fait
  // ou quand l'abonné le masque (mémorisé sur cet appareil)
  const CLE_DEMARRAGE = "ea-demarrage-masque";
  const demarrageMasque = () => { try { return localStorage.getItem(CLE_DEMARRAGE) === "1"; } catch (e) { return false; } };
  function demarrageHTML() {
    if (!etat.abo.actif || !stats || demarrageMasque()) return "";
    const etapes = [
      [Number(stats.contenus_lus) > 0, "Ouvrir un document de votre bibliothèque", "Un ouvrage, un sujet corrigé ou un texte officiel, plus bas sur cette page.", `<button class="btn btn-ghost btn-sm" type="button" data-demarrage="biblio">Voir la bibliothèque</button>`],
      [Number(stats.qcm_bonnes) + Number(stats.qcm_erreurs) > 0, "Faire votre première révision du jour", "Quelques questions de QCM, qui reviendront ensuite au bon moment.", toutesQuestions().length ? `<button class="btn btn-ghost btn-sm" type="button" data-outil="revision">Commencer</button>` : ""],
      [!!(etat.profil && etat.profil.date_concours), "Indiquer la date de votre concours", "Votre tableau de bord affiche alors le compte à rebours et un planning.", `<button class="btn btn-ghost btn-sm" type="button" data-outil="tableau">Indiquer la date</button>`]
    ];
    const faites = etapes.filter(x => x[0]).length;
    if (faites === etapes.length) return "";
    return `<section class="ea-demarrage" id="eaDemarrage" aria-labelledby="eaDemTitre">
        <div class="ea-demarrage-tete"><h3 id="eaDemTitre">Pour bien commencer</h3><span>${faites} sur ${etapes.length}</span>
          <button class="ea-demarrage-masquer" type="button" data-demarrage="masquer">Masquer</button></div>
        <ol>${etapes.map(([fait, titre, aide, action]) => `<li${fait ? ` class="fait"` : ""}><span class="ea-demarrage-coche" aria-hidden="true">${fait ? "✓" : ""}</span>
          <span><b>${titre}</b>${fait ? `<small>C'est fait.</small>` : `<small>${aide}</small>`}</span>${fait ? "" : action}</li>`).join("")}</ol>
      </section>`;
  }
  // Parrainage : code reçu par lien (espace-abonnes/?parrain=CODE), gardé le temps de la visite ; encadré de l'abonné
  const CLE_PARRAIN = "ea-parrain";
  function codeParrainRecu() {
    const q = new URLSearchParams(location.search).get("parrain");
    try {
      if (q) sessionStorage.setItem(CLE_PARRAIN, q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
      return sessionStorage.getItem(CLE_PARRAIN) || "";
    } catch (e) { return q || ""; }
  }
  let filleuls = null;
  function parrainageHTML() {
    const code = etat.profil && etat.profil.code_parrain;
    if (!code || !etat.abo.actif) return "";
    const lien = `${new URL(ROOT + "espace-abonnes/", location.href).href}?parrain=${code}#inscription`;
    const msg = `Je prépare mes concours avec l'espace abonnés des Cours Sésame et SAJ : ouvrages complets, sujets corrigés, QCM, textes officiels et agent de révision. Inscris-toi avec mon code ${code} :\n${lien}`;
    return `<section class="ea-parrainage"><div><h3>Parrainez un ami</h3>
        <p>Votre code : <b class="ea-code">${esc(code)}</b>. Votre ami l'indique en créant son compte. Dès son premier abonnement payé, <b>7 jours vous sont offerts</b>, ajoutés à la suite de votre abonnement.${filleuls ? ` Déjà ${filleuls} ${filleuls > 1 ? "amis parrainés" : "ami parrainé"}, merci !` : ""}</p></div>
        <a class="btn btn-wa btn-sm" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icone("i-wa")}Inviter sur WhatsApp</a>
      </section>`;
  }
  async function majOutils() {
    try { const r = await client.rpc("mes_statistiques"); if (!r.error) stats = r.data; } catch (e) { /* hors ligne */ }
    const b = $("#eaOutils"), d = $("#eaDemarrage");
    if (d) d.remove();
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
      memoLecture = null; favoris = null; vuAvant = null;
      racine.innerHTML = `<div class="ea-accueil">${formulairesHTML(onglet || (!avisAppareil && location.hash === "#inscription" ? "inscription" : "connexion"))}${await apercuHTML()}</div>`;
      brancherFormulaires();
    } else if (etat.abo.actif || etat.admin) {
      const [{ data, error }] = await Promise.all([
        client.from("contenus").select("id, titre, description, type, fichier, texte, lien, concours, matiere, publie_le").eq("publie", true).order("publie_le", { ascending: false }),
        chargerAgent().catch(() => { agent = null; }),
        chargerOutils().catch(() => { /* outils indisponibles : la bibliothèque reste accessible */ })
      ]);
      contenus = error ? [] : data;
      if (etat.abo.actif) { try { const r = await client.rpc("mes_parrainages"); filleuls = r.error ? null : r.data; } catch (e) { filleuls = null; } }
      // Visite précédente sur cet appareil : relevée une fois par chargement de la page, puis remplacée
      if (vuAvant === null) { const v = lu(cleAbonne("visite"), 0); vuAvant = v ? new Date(v) : false; ecrit(cleAbonne("visite"), Date.now()); }
      memoLecture = (c, page) => { if (c && c.id) ecrit(cleAbonne("reprise"), { id: c.id, page: Number(page) || 1 }); };
      favoris = crochetFavoris;
      racine.innerHTML = compteHTML() + await annoncesHTML() + (etat.abo.actif ? statutHTML() : `<div class="ea-statut ea-statut-ok"><div><span class="eyebrow">Administrateur</span><h3>Vous voyez l'espace tel que vos abonnés le voient.</h3></div></div>`) + repriseHTML() + outilsHTML() + agentHTML() + bibliothequeHTML() + parrainageHTML();
      brancherCompte();
    } else {
      memoLecture = null; favoris = null;
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
      $("#eaOubli").hidden = true;
      history.replaceState(null, "", "#" + o);
      $(o === "connexion" ? "#cEmail" : "#iPrenom").focus();
    }));
    $$("[data-oubli]", racine).forEach(b => b.addEventListener("click", () => {
      const ouvrir = b.dataset.oubli === "ouvrir";
      $("#eaConnexion").hidden = ouvrir;
      $("#eaOubli").hidden = !ouvrir;
      if (ouvrir) { $("#oEmail").value = $("#cEmail").value; $("#oEmail").focus(); } else $("#cEmail").focus();
    }));
    $("#eaOubli").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.currentTarget, msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
      const email = $("#oEmail").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = "Indiquez une adresse e-mail valide."; $("#oEmail").focus(); return; }
      bouton.disabled = true; msg.textContent = "Envoi…";
      const { data, error } = await client.functions.invoke("mot-de-passe-oublie", { body: { email } });
      bouton.disabled = false;
      msg.textContent = error ? await erreurFonction(error) : data.message;
    });
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
      // Retour à la page d'où vient le candidat (corrigé d'un concours blanc)
      let retour = null;
      try { retour = sessionStorage.getItem("sesame-retour"); sessionStorage.removeItem("sesame-retour"); } catch (err) { /* stockage bloqué */ }
      if (retour && /^concours-blancs\/(#epreuve-\d+)?$/.test(retour)) { location.href = ROOT + retour; return; }
      if (!/^#corrige-/.test(location.hash)) history.replaceState(null, "", location.pathname);
      afficher().then(ouvrirDepuisLien);
    });
    $("#eaInscription").addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.currentTarget, msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
      const d = {
        prenom: $("#iPrenom").value.trim(), nom: $("#iNom").value.trim(), telephone: $("#iTel").value.trim(),
        concours: $("#iConcours").value, email: $("#iEmail").value.trim(), motDePasse: $("#iMdp").value, parrain: $("#iParrain").value.trim()
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
      const dateConcours = $("#iDate").value;
      if (!r.error && dateConcours && r.data.user) await client.from("profils").update({ date_concours: dateConcours }).eq("id", r.data.user.id);
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
    $("#eaConcoursForm").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $(".ea-msg", e.currentTarget), v = $("#mConcours").value;
      if (!v) { msg.textContent = "Choisissez un concours."; return; }
      const { error } = await client.from("profils").update({ concours: v }).eq("id", etat.uid);
      if (error) { msg.textContent = messageErreur(error); return; }
      etat.profil.concours = v; portee = null; filtre = "tous";
      toast("Concours enregistré.");
      afficher();
    });
    $("#eaTel").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $(".ea-msg", e.currentTarget), tel = $("#mTel").value.replace(/[^0-9+]/g, "");
      if (!/^\+?[0-9]{8,15}$/.test(tel)) { msg.textContent = "Numéro invalide."; return; }
      const { error } = await client.from("profils").update({ telephone: tel }).eq("id", etat.uid);
      msg.textContent = error ? messageErreur(error) : "Numéro enregistré.";
      if (!error) etat.profil.telephone = tel;
    });
    $("#eaEmails").addEventListener("change", async e => {
      const f = e.currentTarget, oui = f.nouveautes.checked, msg = $(".ea-msg", f);
      const { error } = await client.from("profils").update({ emails_nouveautes: oui }).eq("id", etat.uid);
      if (error) { msg.textContent = messageErreur(error); f.nouveautes.checked = !oui; return; }
      etat.profil.emails_nouveautes = oui;
      msg.textContent = oui ? "Vous recevrez l'annonce des nouveautés." : "Vous ne recevrez plus l'annonce des nouveautés.";
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
    if (e.target.id === "eaTextesForm") { e.preventDefault(); chercherTextes($("#eaTextesQ").value); return; }
    if (e.target.id === "eaPaiement") { e.preventDefault(); envoyerDemande(e.target); return; }
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
  racine.addEventListener("click", async e => {
    const po = e.target.closest("[data-portee]");
    if (po && $(".ea-biblio", racine)) {
      portee = po.dataset.portee; filtre = "tous";
      $(".ea-biblio", racine).outerHTML = bibliothequeHTML();
      return;
    }
    if (e.target.closest("[data-reprise]")) {
      const r = lireReprise();
      if (r) ouvrirContenu(Object.assign({}, r.c, { page: r.page }), etat.admin && !etat.abo.actif ? "Aperçu administrateur" : marqueDe(etat.profil));
      return;
    }
    const pa = e.target.closest("[data-paiement]");
    if (pa) {
      if (pa.dataset.paiement === "modifier") { const z = $("#eaPaiementZone"); if (z) { z.hidden = false; $("#pRef").focus(); } return; }
      if (!confirm("Annuler votre demande d'activation ?")) return;
      const { error } = await client.rpc("retirer_demande_activation");
      if (error) { toast(messageErreur(error)); return; }
      toast("Demande annulée.");
      afficher();
      return;
    }
    if (e.target.closest("#eaInstaller") && invitationInstall) {
      const inv = invitationInstall; invitationInstall = null;
      e.target.closest("#eaInstaller").hidden = true;
      inv.prompt();
      return;
    }
    const ch = e.target.closest("[data-filtre]");
    if (ch && $(".ea-biblio", racine)) {
      filtre = ch.dataset.filtre;
      $(".ea-biblio", racine).outerHTML = bibliothequeHTML();
      return;
    }
    const res = e.target.closest("[data-texte-res]");
    if (res && resultatsT) {
      const r = resultatsT[Number(res.dataset.texteRes)], c = r && contenus.find(x => x.id === r.contenu_id);
      if (c) ouvrirContenu(Object.assign({}, c, { page: r.page }), etat.admin && !etat.abo.actif ? "Aperçu administrateur" : marqueDe(etat.profil));
      return;
    }
    const dem = e.target.closest("[data-demarrage]");
    if (dem) {
      if (dem.dataset.demarrage === "masquer") { try { localStorage.setItem(CLE_DEMARRAGE, "1"); } catch (x) { /* stockage indisponible */ } const d = $("#eaDemarrage"); if (d) d.remove(); }
      else { const b = $(".ea-biblio", racine); if (b) b.scrollIntoView({ behavior: "smooth", block: "start" }); }
      return;
    }
    const outil = e.target.closest("[data-outil]");
    if (outil && OUTILS[outil.dataset.outil]) { ouvrirOutil(outil.dataset.outil); return; }
    const ech = e.target.closest("[data-echange]");
    if (ech) { const x = echanges.find(y => String(y.id) === ech.dataset.echange); if (x) ouvrirEchange(x); return; }
    const carte = e.target.closest(".ea-carte");
    if (carte && etat.session) {
      const c = contenus.find(x => String(x.id) === carte.dataset.id);
      if (c) ouvrirContenu(verrouille(c) ? Object.assign({}, c, { verrou: msgFormule(c) }) : c, etat.admin && !etat.abo.actif ? "Aperçu administrateur" : marqueDe(etat.profil));
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
  // Lien « ne plus recevoir l'annonce des nouveautés » des e-mails : fonctionne sans connexion
  const desinscription = new URLSearchParams(location.search).get("desinscription");
  if (desinscription) {
    history.replaceState(null, "", location.pathname + location.hash);
    fetch(`${CONF.url}/functions/v1/emails`, { method: "POST", headers: { "Content-Type": "application/json", apikey: CONF.cle }, body: JSON.stringify({ action: "desinscrire", jeton: desinscription }) })
      .then(r => r.json()).then(r => toast(r.ok ? "C'est noté. Vous ne recevrez plus l'annonce des nouveautés ni les rappels par e-mail." : (r.error || "Lien invalide.")))
      .catch(() => toast("La désinscription n'a pas abouti. Réessayez plus tard."));
  }
  // Installation du site comme une application (Android, ordinateur) : bouton dans la barre du compte
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); invitationInstall = e; const b = $("#eaInstaller"); if (b) b.hidden = false; });
  window.addEventListener("appinstalled", () => { invitationInstall = null; const b = $("#eaInstaller"); if (b) b.hidden = true; toast("Application installée."); });

  // Lien « choisir un nouveau mot de passe » des e-mails (fonction mot-de-passe-oublie) : espace-abonnes/?reinit=<jeton>
  async function reinitialiser(jeton) {
    racine.innerHTML = `<div class="ea-auth"><p class="ea-attente">Vérification du lien…</p></div>`;
    await client.auth.signOut({ scope: "local" }).catch(() => {});
    const { error } = await client.auth.verifyOtp({ token_hash: jeton, type: "recovery" });
    if (error) {
      racine.innerHTML = `<div class="ea-carte-info"><h3>Ce lien n'est plus valable.</h3><p>Il a peut-être déjà servi ou expiré. Demandez-en un nouveau depuis le formulaire de connexion, rubrique « Mot de passe oublié ? ».</p><button class="btn btn-navy" type="button" id="eaRetourConnexion">Revenir à la connexion</button></div>`;
      $("#eaRetourConnexion").addEventListener("click", () => afficher("connexion"));
      return false;
    }
    await client.rpc("prendre_appareil");
    return new Promise(tenir => {
      racine.innerHTML = `<div class="ea-auth"><form class="form ea-form" id="eaNouveauMdp" novalidate>
          <h3 class="full">Choisissez votre nouveau mot de passe</h3>
          <div class="field full"><label for="nMdp">Nouveau mot de passe (8 caractères au moins)</label><input id="nMdp" type="password" autocomplete="new-password" minlength="8" required></div>
          <p class="ea-msg" role="alert"></p>
          <button class="btn btn-navy" type="submit">Enregistrer et ouvrir mon espace</button>
        </form></div>`;
      const f = $("#eaNouveauMdp"), msg = $(".ea-msg", f);
      $("#nMdp").focus();
      f.addEventListener("submit", async e => {
        e.preventDefault();
        const mdp = $("#nMdp").value;
        if (mdp.length < 8) { msg.textContent = "8 caractères au moins."; return; }
        $("button[type=submit]", f).disabled = true;
        const { error: err } = await client.auth.updateUser({ password: mdp });
        $("button[type=submit]", f).disabled = false;
        if (err) { msg.textContent = messageErreur(err); return; }
        toast("Mot de passe changé.");
        tenir();
      });
    });
  }
  const jetonReinit = new URLSearchParams(location.search).get("reinit");
  if (jetonReinit) {
    history.replaceState(null, "", location.pathname);
    reinitialiser(jetonReinit).then(ok => { if (ok !== false) afficher(); });
  } else afficher().then(() => { versFormulaire(); ouvrirDepuisLien(); });
})();
