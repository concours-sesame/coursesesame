/* Les Cours Sésame & SAJ : interactions du site.
   Les contenus (ouvrages, avis, FAQ, méthode, corrigés) sont dans data.js. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const WA_URL = "https://wa.me/" + WA;
  const CART_KEY = "sesame-cart-v1";
  const PROMO_MIN = 3;

  // Concours, dans l'ordre d'affichage
  const CONCOURS = [
    { id: "infj", court: "Magistrature", long: "INFJ Magistrature" },
    { id: "greffe", court: "Greffe", long: "INFJ Greffe" },
    { id: "penitentiaire", court: "Pénitentiaire", long: "INFJ Pénitentiaire" },
    { id: "eppjej", court: "EPPJEJ", long: "INFJ EPPJEJ" },
    { id: "ena", court: "ENA", long: "École Nationale d'Administration" }
  ];
  const byCat = id => OUVRAGES.filter(o => o.categorie === id);

  const parsePrice = p => parseInt(String(p).replace(/\s/g, ""), 10) || 0;
  const fmt = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const svg = (id, attrs = "") => `<svg ${attrs}><use href="#${id}"/></svg>`;

  function openWhatsApp(text) {
    const url = WA_URL + "?text=" + encodeURIComponent(text);
    const w = window.open(url, "_blank", "noopener");
    if (!w) location.href = url;
  }

  /* ---------- Couverture d'ouvrage (modèle de la charte) ---------- */
  function coverParts(titre) {
    const t = titre.replace(/\s+—\s+Édition \d{4}/, "").replace(/ aux Concours Administratifs$/i, "");
    const rules = [
      [/^Le Résumé (?:de |d'|des )(.+)$/i, "Le Résumé"],
      [/^Les Annales des Anciens Sujets Corrigés(?: de)? (.+)$/i, "Annales corrigées"],
      [/^Le Guide Méthodologique (.+)$/i, "Guide méthodologique"],
      [/^Le Sésame de (.+)$/i, "Le Sésame"],
      [/^La (Logique)$/i, "Entraînement"]
    ];
    for (const [re, serie] of rules) {
      const m = t.match(re);
      if (m) return { serie, sujet: m[1] };
    }
    return { serie: "", sujet: t };
  }

  function coverHTML(o) {
    const c = coverParts(o.titre);
    return `<div class="cover">
      <div class="cover-top">${svg("logo", 'class="mark" aria-hidden="true"')}<span class="cb">Les Cours<br>Sésame et SAJ<i></i></span></div>
      <div class="cover-band">${c.serie ? `<span class="cover-series">${c.serie}</span>` : ""}<span class="cover-title">${c.sujet}</span><span class="orn">${svg("i-star")}</span></div>
      <div class="cover-foot">${o.concours}</div>
    </div>`;
  }

  /* ---------- Bandeau défilant ---------- */
  function renderTicker() {
    const words = ["INFJ Magistrature", "Greffe", "Pénitentiaire", "EPPJEJ", "ENA", "Savoirs", "Méthode", "Réussite"];
    const one = words.map(w => `<span class="ticker-item">${w}${svg("i-star")}</span>`).join("");
    $("#ticker").innerHTML = one + one;
  }

  /* ---------- Choix du concours ---------- */
  function renderConcours() {
    $("#concoursGrid").innerHTML = CONCOURS.map((c, i) => {
      const n = byCat(c.id).length;
      return `<button class="concours-card reveal reveal-d${i % 5}" data-cat="${c.id}">
        <span class="cc-num">0${i + 1}</span>
        <span class="cc-name">${c.court}</span>
        <span class="cc-sub">${c.long}</span>
        <span class="cc-go">${n} ouvrage${n > 1 ? "s" : ""}${svg("i-arrow")}</span>
      </button>`;
    }).join("");
    $$("#concoursGrid .concours-card").forEach(b => b.addEventListener("click", () => {
      setCat(b.dataset.cat);
      $("#catalogue").scrollIntoView({ behavior: "smooth" });
    }));
  }

  /* ---------- Catalogue ---------- */
  const state = { cat: "tous", q: "", sort: "default" };

  function renderChips() {
    const all = [{ id: "tous", court: "Tous" }, ...CONCOURS];
    $("#chips").innerHTML = all.map(c => {
      const n = c.id === "tous" ? OUVRAGES.length : byCat(c.id).length;
      return `<button class="chip" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${c.court}<span class="n">${n}</span></button>`;
    }).join("");
    $$("#chips .chip").forEach(b => b.addEventListener("click", () => setCat(b.dataset.cat)));
  }

  function setCat(cat) {
    state.cat = cat;
    $$("#chips .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.cat === cat));
    renderBooks();
  }

  function bookHTML(o) {
    const idx = OUVRAGES.indexOf(o);
    const inCart = cart.includes(idx);
    return `<article class="book">
      <button class="book-cover-btn" data-open="${idx}" aria-label="Voir le détail : ${o.titre.replace(/"/g, "&quot;")}">${coverHTML(o)}</button>
      <div class="book-meta">
        <span class="book-concours">${o.concours}</span>
        <h3 class="book-title">${o.titre}</h3>
        <span class="book-niveau">Niveaux ${o.niveau}</span>
        <div class="book-buy">
          <span class="price">${o.prix}<small>FCFA</small></span>
          <button class="add-btn${inCart ? " in" : ""}" data-add="${idx}">${inCart ? svg("i-check") + "Ajouté" : svg("i-plus") + "Panier"}</button>
        </div>
      </div>
    </article>`;
  }

  function renderBooks() {
    let list = OUVRAGES.slice();
    if (state.cat !== "tous") list = list.filter(o => o.categorie === state.cat);
    if (state.q) {
      const q = norm(state.q);
      list = list.filter(o => norm(o.titre + " " + o.desc + " " + o.concours).includes(q));
    }
    if (state.sort === "price-asc") list.sort((a, b) => parsePrice(a.prix) - parsePrice(b.prix));
    if (state.sort === "price-desc") list.sort((a, b) => parsePrice(b.prix) - parsePrice(a.prix));
    if (state.sort === "alpha") list.sort((a, b) => a.titre.localeCompare(b.titre, "fr"));

    const box = $("#books");
    const label = state.cat === "tous" ? "tous concours" : CONCOURS.find(c => c.id === state.cat).long;
    $("#resultInfo").textContent = `${list.length} ouvrage${list.length > 1 ? "s" : ""} · ${label}`;

    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>Aucun ouvrage trouvé</b>Essayez un autre mot, ou <a href="${WA_URL}" target="_blank" rel="noopener">demandez-nous sur WhatsApp</a>.</div>`;
      return;
    }
    // Sans recherche ni tri, « Tous » est rangé par concours
    if (state.cat === "tous" && !state.q && state.sort === "default") {
      box.innerHTML = CONCOURS.map(c => {
        const items = list.filter(o => o.categorie === c.id);
        return `<h3 class="group-title">${c.court}<small>${items.length} ouvrages</small></h3><div class="books">${items.map(bookHTML).join("")}</div>`;
      }).join("");
    } else {
      box.innerHTML = `<div class="books">${list.map(bookHTML).join("")}</div>`;
    }
  }

  $("#books").addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) return toggleCart(+add.dataset.add);
    const open = e.target.closest("[data-open]");
    if (open) openModal(+open.dataset.open);
  });
  let searchTimer;
  $("#search").addEventListener("input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); renderBooks(); }, 120);
  });
  $("#sort").addEventListener("change", e => { state.sort = e.target.value; renderBooks(); });

  /* ---------- Panier ---------- */
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
  cart = cart.filter(i => Number.isInteger(i) && OUVRAGES[i]);
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };

  function totals() {
    const sub = cart.reduce((s, i) => s + parsePrice(OUVRAGES[i].prix), 0);
    const promo = cart.length >= PROMO_MIN;
    const disc = promo ? Math.round(sub * 0.1) : 0;
    return { sub, promo, disc, total: sub - disc };
  }

  function toggleCart(idx) {
    const at = cart.indexOf(idx);
    if (at > -1) cart.splice(at, 1);
    else {
      cart.push(idx);
      const left = PROMO_MIN - cart.length;
      toast(left > 0 ? `Ajouté. Encore ${left} pour -10 %` : cart.length === PROMO_MIN ? "Remise de 10 % débloquée !" : "Ajouté au panier");
      const cc = $("#cartCount");
      cc.classList.remove("bump"); void cc.offsetWidth; cc.classList.add("bump");
    }
    saveCart();
    updateCart();
    renderBooks();
    if (modalIdx === idx) syncModalBtn();
  }

  function updateCart() {
    const t = totals();
    const n = cart.length;
    const cc = $("#cartCount");
    cc.textContent = n;
    cc.classList.toggle("show", n > 0);

    $("#cartBody").innerHTML = n ? cart.map(i => {
      const o = OUVRAGES[i];
      return `<div class="c-item"><span class="c-mini"></span><div><b>${o.titre}</b><small>${o.concours}</small><span class="c-price">${o.prix} FCFA</span></div><button class="c-remove" data-remove="${i}" aria-label="Retirer ${o.titre.replace(/"/g, "&quot;")}">${svg("i-x")}</button></div>`;
    }).join("") : `<div class="c-empty"><b>Votre panier est vide</b>Ajoutez des ouvrages depuis le catalogue.</div>`;

    const meter = $("#promoMeter");
    meter.classList.toggle("ok", t.promo);
    meter.innerHTML = (t.promo ? "Remise de 10 % appliquée" : `Encore ${PROMO_MIN - n} ouvrage${PROMO_MIN - n > 1 ? "s" : ""} pour obtenir -10 %`) +
      `<div class="bar"><i style="width:${Math.min(100, (n / PROMO_MIN) * 100)}%"></i></div>`;
    $("#cartSub").textContent = fmt(t.sub) + " FCFA";
    $("#rowDisc").hidden = !t.promo;
    $("#cartDisc").textContent = "-" + fmt(t.disc) + " FCFA";
    $("#cartTotal").textContent = fmt(t.total) + " FCFA";
    $("#cartSend").disabled = !n;

    $("#cartBarTotal").textContent = fmt(t.total) + " FCFA";
    $("#cartBarCount").textContent = `${n} ouvrage${n > 1 ? "s" : ""}${t.promo ? " · -10 % inclus" : ""}`;
    $("#cartBar").classList.toggle("show", n > 0);
    document.body.classList.toggle("has-cart-bar", n > 0 && matchMedia("(max-width:960px)").matches);
  }

  $("#cartBody").addEventListener("click", e => {
    const r = e.target.closest("[data-remove]");
    if (r) toggleCart(+r.dataset.remove);
  });

  $("#cartSend").addEventListener("click", () => {
    const t = totals();
    let msg = "Bonjour Les Cours Sésame & SAJ,\n\nJe souhaite commander les ouvrages suivants :\n\n";
    cart.forEach((i, k) => { const o = OUVRAGES[i]; msg += `${k + 1}. ${o.titre}\n   ${o.concours} — ${o.prix} FCFA\n\n`; });
    if (t.promo) msg += `🎁 Remise 10% (3+ ouvrages) : -${fmt(t.disc)} FCFA\n`;
    msg += `\n💰 Total : ${fmt(t.total)} FCFA\n\nMerci !`;
    openWhatsApp(msg);
  });

  let lastFocus = null;
  function setDrawer(open) {
    if (open) lastFocus = document.activeElement;
    $("#drawer").classList.toggle("open", open);
    $("#drawer").setAttribute("aria-hidden", !open);
    $("#overlay").classList.toggle("open", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (open) $("#drawerClose").focus(); else if (lastFocus) lastFocus.focus();
  }
  $("#cartBtn").addEventListener("click", () => setDrawer(true));
  $("#cartBarBtn").addEventListener("click", () => setDrawer(true));
  $("#drawerClose").addEventListener("click", () => setDrawer(false));
  $("#overlay").addEventListener("click", () => { setDrawer(false); setModal(false); });

  /* ---------- Fiche ouvrage ---------- */
  let modalIdx = null;
  function openModal(idx) {
    const o = OUVRAGES[idx];
    modalIdx = idx;
    $("#mCover").innerHTML = coverHTML(o);
    $("#mConcours").textContent = o.concours;
    $("#mTitle").textContent = o.titre;
    $("#mDesc").textContent = o.desc;
    $("#mSpecs").innerHTML = `<span class="spec">Niveaux ${o.niveau}</span><span class="spec">Livraison partout en CI</span><span class="spec">Paiement Mobile Money</span>`;
    $("#mPrice").innerHTML = `${o.prix}<small>FCFA</small>`;
    syncModalBtn();
    $(".quick").open = false;
    setModal(true);
  }
  function syncModalBtn() {
    const inCart = cart.includes(modalIdx);
    const b = $("#mAdd");
    b.className = "btn " + (inCart ? "btn-gold" : "btn-navy");
    b.innerHTML = inCart ? svg("i-check", 'fill="none" stroke="currentColor" stroke-width="2.6"') + "Dans le panier" : svg("i-plus", 'fill="none" stroke="currentColor" stroke-width="2.6"') + "Ajouter au panier";
  }
  function setModal(open) {
    if (open) lastFocus = document.activeElement;
    $("#modal").classList.toggle("open", open);
    $("#modal").setAttribute("aria-hidden", !open);
    if (!$("#drawer").classList.contains("open")) {
      $("#overlay").classList.toggle("open", open);
      document.body.style.overflow = open ? "hidden" : "";
    }
    if (open) $("#modalClose").focus(); else if (lastFocus && modalIdx !== null) lastFocus.focus();
    if (!open) modalIdx = null;
  }
  $("#mAdd").addEventListener("click", () => toggleCart(modalIdx));
  $("#modalClose").addEventListener("click", () => setModal(false));
  $("#modal").addEventListener("click", e => { if (e.target === $("#modal")) setModal(false); });

  $("#quickForm").addEventListener("submit", e => {
    e.preventDefault();
    const v = id => $(id).value.trim();
    const req = ["#fPrenom", "#fNom", "#fTel", "#fVille"];
    let ok = true;
    req.forEach(id => { const bad = !v(id); $(id).classList.toggle("err", bad); if (bad && ok) { $(id).focus(); ok = false; } });
    if (!ok) return toast("Merci de remplir prénom, nom, téléphone et ville");
    const o = OUVRAGES[modalIdx];
    const m = v("#fMsg");
    const msg = ["Bonjour Les Cours Sésame & SAJ,", "", "Je souhaite passer une commande :", "",
      `📚 ${o.titre}`, `📂 ${o.concours}`, `📊 ${o.niveau}`, `💰 ${o.prix} FCFA`, `🔢 Quantité : ${v("#fQte") || 1}`, "",
      "Mes coordonnées :", `👤 ${v("#fPrenom")} ${v("#fNom")}`, `📞 ${v("#fTel")}`, `📍 ${v("#fVille")}`, m ? `\n💬 ${m}` : "", "", "Merci !"].join("\n");
    openWhatsApp(msg);
    setModal(false);
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("#modal").classList.contains("open")) setModal(false);
    else if ($("#drawer").classList.contains("open")) setDrawer(false);
    else if ($("#mobileMenu").classList.contains("open")) setMenu(false);
  });

  /* ---------- Méthode ---------- */
  function renderMethodo() {
    $("#mTabs").innerHTML = METHODO.map((m, i) => {
      const n = m.epreuves.split(",").length;
      return `<button class="m-tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${m.concours.replace("INFJ ", "")}<small>${n} épreuves</small></button>`;
    }).join("");
    const show = i => {
      const m = METHODO[i];
      $("#mPanel").innerHTML = `<div class="m-panel" role="tabpanel"><span class="eyebrow">${m.concours}</span>
        <div class="m-label">Épreuves principales</div>
        <div class="pills">${m.epreuves.split(",").map(e => `<span class="pill">${e.trim()}</span>`).join("")}</div>
        <div class="m-label">Ce qu'il faut savoir</div><p>${m.conseil}</p></div>`;
      $$("#mTabs .m-tab").forEach(b => b.setAttribute("aria-selected", +b.dataset.i === i));
    };
    $$("#mTabs .m-tab").forEach(b => b.addEventListener("click", () => show(+b.dataset.i)));
    show(0);

    $("#epTabs").innerHTML = EPREUVES.map((e, i) => `<button class="ep-tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${e.nom}</button>`).join("");
    const showEp = i => {
      $("#epPanel").innerHTML = `<div class="ep-panel" role="tabpanel">${EPREUVES[i].contenu}</div>`;
      $$("#epTabs .ep-tab").forEach(b => b.setAttribute("aria-selected", +b.dataset.i === i));
    };
    $$("#epTabs .ep-tab").forEach(b => b.addEventListener("click", () => showEp(+b.dataset.i)));
    showEp(0);
  }

  /* ---------- Sujets corrigés ---------- */
  function renderSujets() {
    $("#sTabs").innerHTML = SUJETS.map((s, i) => `<button class="s-tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${s.concours}</button>`).join("");
    const waMsg = "Bonjour Les Cours Sésame & SAJ, je souhaite obtenir vos ouvrages complets. Merci !";
    const show = i => {
      const s = SUJETS[i];
      $("#sPanel").innerHTML = `<article class="paper" role="tabpanel">
        <div class="paper-side"><span class="tag">${s.concours}</span><h3>${s.titre}</h3><div class="meta">${s.meta}</div>
          <div class="enonce"><b>Sujet</b><p>${s.enonce}</p></div></div>
        <div class="paper-main">
          <div class="corrige" id="corrige">${s.corrige}</div>
          <div class="corrige-more"><button class="btn btn-ghost btn-sm" id="moreBtn">Lire tout le corrigé</button></div>
          <div class="corrige-cta"><p>Ce corrigé est un extrait de nos ouvrages. Obtenez la version complète avec tous les sujets.</p><button class="btn btn-wa btn-sm" id="sujetOrder">${svg("i-wa", 'fill="currentColor"')}Commander l'ouvrage complet</button></div>
        </div></article>`;
      const c = $("#corrige");
      const more = $("#moreBtn");
      if (c.scrollHeight <= c.clientHeight + 10) more.parentElement.remove();
      else more.addEventListener("click", () => {
        const open = c.classList.toggle("open");
        more.textContent = open ? "Réduire le corrigé" : "Lire tout le corrigé";
        if (!open) c.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      $("#sujetOrder").addEventListener("click", () => openWhatsApp(waMsg));
      $$("#sTabs .s-tab").forEach(b => b.setAttribute("aria-selected", +b.dataset.i === i));
    };
    $$("#sTabs .s-tab").forEach(b => b.addEventListener("click", () => show(+b.dataset.i)));
    show(0);
  }

  /* ---------- Avis ---------- */
  function renderReviews() {
    const stars = svg("i-star").repeat(5);
    const card = t => `<figure class="review"><div class="stars" aria-label="5 étoiles">${stars}</div><blockquote>« ${t.text} »</blockquote><figcaption><span class="avatar">${t.initials}</span><span><cite>${t.author}</cite><small>${t.role}</small></span></figcaption></figure>`;
    const half = Math.ceil(TEMOIGNAGES.length / 2);
    const rowA = TEMOIGNAGES.slice(0, half), rowB = TEMOIGNAGES.slice(half);
    const row = (items, rev) => { const h = items.concat(items, items).map(card).join(""); return `<div class="r-row${rev ? " rev" : ""}">${h}${h}</div>`; };
    $("#reviews").innerHTML = row(rowA, false) + row(rowB, true);
  }

  /* ---------- FAQ ---------- */
  function renderFAQ() {
    $("#faqList").innerHTML = FAQ.map((f, i) => `<details class="faq-item"${i === 0 ? " open" : ""}><summary>${f.q}<i></i></summary><p>${f.a}</p></details>`).join("");
    $$("#faqList details").forEach(d => d.addEventListener("toggle", () => {
      if (d.open) $$("#faqList details").forEach(o => { if (o !== d) o.open = false; });
    }));
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(text) {
    $("#toastText").textContent = text;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2400);
  }

  /* ---------- En-tête, menu, bannière ---------- */
  function setMenu(open) {
    $("#mobileMenu").classList.toggle("open", open);
    $("#mobileMenu").setAttribute("aria-hidden", !open);
    $("#menuBtn").setAttribute("aria-expanded", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (open) $("#menuClose").focus();
  }
  $("#menuBtn").addEventListener("click", () => setMenu(true));
  $("#menuClose").addEventListener("click", () => setMenu(false));
  $$("#mobileMenu a").forEach(a => a.addEventListener("click", () => setMenu(false)));

  function syncTopHeight() {
    document.documentElement.style.setProperty("--top-h", $("#siteTop").offsetHeight + "px");
    document.documentElement.style.scrollPaddingTop = $("#siteTop").offsetHeight + 16 + "px";
  }
  try { if (sessionStorage.getItem("promo-hidden")) $("#promo").hidden = true; } catch (e) {}
  $("#promoClose").addEventListener("click", () => {
    $("#promo").hidden = true;
    try { sessionStorage.setItem("promo-hidden", "1"); } catch (e) {}
    syncTopHeight();
  });

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      $("#header").classList.toggle("scrolled", scrollY > 10);
      ticking = false;
    });
  }, { passive: true });

  // Lien actif dans le menu
  const navLinks = $$(".nav a");
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["catalogue", "methodologie", "sujets", "avis", "apropos", "faq"].forEach(id => spy.observe(document.getElementById(id)));

  /* ---------- Compteurs et apparitions ---------- */
  const COUNTS = { ouvrages: OUVRAGES.length, concours: CONCOURS.length };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countUp(el) {
    const target = COUNTS[el.dataset.countFrom];
    if (reduce) { el.textContent = target; return; }
    const t0 = performance.now(), d = 1400;
    const tick = now => {
      const p = Math.min(1, (now - t0) / d);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      if (en.target.dataset.countFrom) countUp(en.target);
      else en.target.classList.add("in");
      io.unobserve(en.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

  /* ---------- Démarrage ---------- */
  renderTicker();
  renderConcours();
  renderChips();
  renderBooks();
  renderMethodo();
  renderSujets();
  renderReviews();
  renderFAQ();
  updateCart();
  syncTopHeight();
  window.addEventListener("resize", () => { syncTopHeight(); updateCart(); });
  $("#year").textContent = new Date().getFullYear();
  $$(".reveal, [data-count-from]").forEach(el => io.observe(el));
})();
