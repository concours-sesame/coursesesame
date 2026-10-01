/* Les Cours Sésame & SAJ : interactions du site (toutes les pages).
   Contenus : data.js. Affichage partagé avec le générateur : render.js. */
(function () {
  "use strict";

  const { CONCOURS, parsePrice, fmt, svg, slugify, plural, coverParts, coverHTML, bookHTML, groupHTML, packTotals } = window.SESAME;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const on = (sel, ev, fn) => { const el = typeof sel === "string" ? $(sel) : sel; if (el) el.addEventListener(ev, fn); };
  const WA_URL = "https://wa.me/" + WA;
  const CART_KEY = "sesame-cart-v1";
  const PROMO_MIN = 3;
  const ROOT = document.body.dataset.root || "";
  const PAGE_CAT = document.body.dataset.cat || "";
  const byCat = id => OUVRAGES.filter(o => o.categorie === id);
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function openWhatsApp(text, toNumber = true) {
    const url = (toNumber ? WA_URL : "https://wa.me/") + "?text=" + encodeURIComponent(text);
    const w = window.open(url, "_blank", "noopener");
    if (!w) location.href = url;
  }

  /* ---------- Panier ---------- */
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
  cart = cart.filter(i => Number.isInteger(i) && OUVRAGES[i]);
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} };
  const totals = () => {
    const t = packTotals(cart.map(i => OUVRAGES[i]));
    return Object.assign(t, { promo: cart.length >= PROMO_MIN });
  };

  function bump() {
    const cc = $("#cartCount");
    if (!cc) return;
    cc.classList.remove("bump"); void cc.offsetWidth; cc.classList.add("bump");
  }

  function afterCartChange() {
    saveCart();
    updateCart();
    renderBooks();
    if (modalIdx !== null) syncModalBtn();
  }

  function toggleCart(idx) {
    const at = cart.indexOf(idx);
    if (at > -1) cart.splice(at, 1);
    else {
      cart.push(idx);
      const left = PROMO_MIN - cart.length;
      toast(left > 0 ? `Ajouté. Encore ${left} pour -10 %` : cart.length === PROMO_MIN ? "Remise de 10 % débloquée !" : "Ajouté au panier");
      bump();
    }
    afterCartChange();
  }

  function addMany(ids) {
    const fresh = ids.filter(i => OUVRAGES[i] && !cart.includes(i));
    if (!fresh.length) { toast("Ces ouvrages sont déjà dans votre panier"); return; }
    cart.push(...fresh);
    toast(`${plural(fresh.length, "ouvrage")} ajouté${fresh.length > 1 ? "s" : ""}${cart.length >= PROMO_MIN ? ", remise de 10 % incluse" : ""}`);
    bump();
    afterCartChange();
  }

  function updateCart() {
    const t = totals();
    const n = cart.length;
    const cc = $("#cartCount");
    cc.textContent = n;
    cc.classList.toggle("show", n > 0);

    $("#cartBody").innerHTML = n ? cart.map(i => {
      const o = OUVRAGES[i];
      return `<div class="c-item"><span class="c-mini"></span><div><b>${o.titre}</b><small>${o.concours}${o.numerique ? " · version numérique" : ""}</small><span class="c-price">${o.prix} FCFA</span></div><button class="c-remove" data-remove="${i}" aria-label="Retirer ${o.titre.replace(/"/g, "&quot;")}">${svg("i-x")}</button></div>`;
    }).join("") : `<div class="c-empty"><b>Votre panier est vide</b>Ajoutez des ouvrages depuis le catalogue.</div>`;

    const meter = $("#promoMeter");
    meter.classList.toggle("ok", t.promo);
    meter.innerHTML = (t.promo ? "Remise de 10 % appliquée" : `Encore ${plural(PROMO_MIN - n, "ouvrage")} pour obtenir -10 %`) +
      `<div class="bar"><i style="width:${Math.min(100, (n / PROMO_MIN) * 100)}%"></i></div>`;
    $("#cartSub").textContent = fmt(t.sub) + " FCFA";
    $("#rowDisc").hidden = !t.promo;
    $("#cartDisc").textContent = "-" + fmt(t.disc) + " FCFA";
    $("#cartTotal").textContent = fmt(t.total) + " FCFA";
    $("#cartSend").disabled = !n;

    $("#cartBarTotal").textContent = fmt(t.total) + " FCFA";
    $("#cartBarCount").textContent = `${plural(n, "ouvrage")}${t.promo ? " · -10 % inclus" : ""}`;
    $("#cartBar").classList.toggle("show", n > 0);
    document.body.classList.toggle("has-cart-bar", n > 0 && matchMedia("(max-width:960px)").matches);
  }

  on("#cartBody", "click", e => {
    const r = e.target.closest("[data-remove]");
    if (r) toggleCart(+r.dataset.remove);
  });

  on("#cartSend", "click", () => {
    const t = totals();
    let msg = "Bonjour Les Cours Sésame & SAJ,\n\nJe souhaite commander les ouvrages suivants :\n\n";
    cart.forEach((i, k) => { const o = OUVRAGES[i]; msg += `${k + 1}. ${o.titre}${o.numerique ? " (version numérique)" : ""}\n   ${o.concours} — ${o.prix} FCFA\n\n`; });
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
  on("#cartBtn", "click", () => setDrawer(true));
  on("#cartBarBtn", "click", () => setDrawer(true));
  on("#drawerClose", "click", () => setDrawer(false));
  on("#overlay", "click", () => { setDrawer(false); setModal(false); });

  /* ---------- Fiche ouvrage ---------- */
  let modalIdx = null;
  function openModal(idx) {
    const o = OUVRAGES[idx];
    modalIdx = idx;
    $("#mCover").innerHTML = coverHTML(o);
    $("#mConcours").textContent = o.concours;
    $("#mTitle").textContent = o.titre;
    $("#mDesc").textContent = o.desc;
    $("#mSpecs").innerHTML = (o.phase ? `<span class="spec">${o.phase}</span>` : "") + `<span class="spec">Niveaux ${o.niveau}</span>` +
      (o.numerique ? `<span class="spec spec-num">Version numérique uniquement</span>` : `<span class="spec">Livraison partout en CI</span>`) + `<span class="spec">Paiement Mobile Money</span>`;
    $("#mPrice").innerHTML = `${o.prix}<small>FCFA</small>`;
    syncModalBtn();
    $(".quick").open = false;
    setModal(true);
  }
  function syncModalBtn() {
    const inCart = cart.includes(modalIdx);
    const b = $("#mAdd");
    const ic = 'fill="none" stroke="currentColor" stroke-width="2.6"';
    b.className = "btn " + (inCart ? "btn-gold" : "btn-navy");
    b.innerHTML = inCart ? svg("i-check", ic) + "Dans le panier" : svg("i-plus", ic) + "Ajouter au panier";
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
  on("#mAdd", "click", () => toggleCart(modalIdx));
  on("#modalClose", "click", () => setModal(false));
  on("#modal", "click", e => { if (e.target === $("#modal")) setModal(false); });

  on("#quickForm", "submit", e => {
    e.preventDefault();
    const v = id => $(id).value.trim();
    let ok = true;
    ["#fPrenom", "#fNom", "#fTel", "#fVille"].forEach(id => { const bad = !v(id); $(id).classList.toggle("err", bad); if (bad && ok) { $(id).focus(); ok = false; } });
    if (!ok) return toast("Merci de remplir prénom, nom, téléphone et ville");
    const o = OUVRAGES[modalIdx];
    const m = v("#fMsg");
    const msg = ["Bonjour Les Cours Sésame & SAJ,", "", "Je souhaite passer une commande :", "",
      `📚 ${o.titre}${o.numerique ? " (version numérique)" : ""}`, `📂 ${o.concours}`, `📊 ${o.niveau}`, `💰 ${o.prix} FCFA`, `🔢 Quantité : ${v("#fQte") || 1}`, "",
      "Mes coordonnées :", `👤 ${v("#fPrenom")} ${v("#fNom")}`, `📞 ${v("#fTel")}`, `📍 ${v("#fVille")}`, m ? `\n💬 ${m}` : "", "", "Merci !"].join("\n");
    openWhatsApp(msg);
    setModal(false);
  });

  // Clics sur les ouvrages et les packs, où qu'ils soient dans la page
  document.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) return toggleCart(+add.dataset.add);
    const pack = e.target.closest("[data-pack]");
    if (pack) return addMany(pack.dataset.pack.split(",").map(Number));
    const open = e.target.closest("[data-open]");
    if (open) return openModal(+open.dataset.open);
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("#modal").classList.contains("open")) setModal(false);
    else if ($("#drawer").classList.contains("open")) setDrawer(false);
    else if ($("#mobileMenu").classList.contains("open")) setMenu(false);
  });

  /* ---------- Catalogue (accueil) et rayon (page concours) ---------- */
  const state = { cat: "tous", q: "", sort: "default" };

  function renderChips() {
    if (!$("#chips")) return;
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

  function renderBooks() {
    const box = $("#books");
    if (!box) return;
    if (PAGE_CAT) { box.innerHTML = groupHTML(byCat(PAGE_CAT), OUVRAGES, cart, true); return; }

    let list = OUVRAGES.slice();
    if (state.cat !== "tous") list = list.filter(o => o.categorie === state.cat);
    if (state.q) {
      const q = norm(state.q);
      list = list.filter(o => norm(o.titre + " " + o.desc + " " + o.concours).includes(q));
    }
    if (state.sort === "price-asc") list.sort((a, b) => parsePrice(a.prix) - parsePrice(b.prix));
    if (state.sort === "price-desc") list.sort((a, b) => parsePrice(b.prix) - parsePrice(a.prix));
    if (state.sort === "alpha") list.sort((a, b) => a.titre.localeCompare(b.titre, "fr"));

    const label = state.cat === "tous" ? "tous concours" : CONCOURS.find(c => c.id === state.cat).long;
    $("#resultInfo").textContent = `${plural(list.length, "ouvrage")} · ${label}`;
    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>Aucun ouvrage trouvé</b>Essayez un autre mot, ou <a href="${WA_URL}" target="_blank" rel="noopener">demandez-nous sur WhatsApp</a>.</div>`;
      return;
    }
    if (!state.q && state.sort === "default") {
      const groups = state.cat === "tous" ? CONCOURS : CONCOURS.filter(c => c.id === state.cat);
      box.innerHTML = groups.map(c => {
        const items = list.filter(o => o.categorie === c.id);
        return `<h3 class="group-title">${c.court}<small>${plural(items.length, "ouvrage")}</small><a class="group-link" href="${ROOT}concours/${c.slug}/">Page du concours</a></h3>${groupHTML(items, OUVRAGES, cart, false)}`;
      }).join("");
    } else {
      box.innerHTML = `<div class="books">${list.map(o => bookHTML(o, OUVRAGES.indexOf(o), cart.includes(OUVRAGES.indexOf(o)))).join("")}</div>`;
    }
  }
  let searchTimer;
  on("#search", "input", e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); renderBooks(); }, 120);
  });
  on("#sort", "change", e => { state.sort = e.target.value; renderBooks(); });

  /* ---------- Bandeau défilant ---------- */
  function renderTicker() {
    if (!$("#ticker")) return;
    const words = ["INFJ Magistrature", "Greffe", "Pénitentiaire", "EPPJEJ", "ENA", "Savoirs", "Méthode", "Réussite"];
    const one = words.map(w => `<span class="ticker-item">${w}${svg("i-star")}</span>`).join("");
    $("#ticker").innerHTML = one + one;
  }

  /* ---------- Méthode (accueil) ---------- */
  function renderMethodo() {
    if (!$("#mTabs")) return;
    $("#mTabs").innerHTML = METHODO.map((m, i) => `<button class="m-tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${m.concours.replace("INFJ ", "")}<small>${plural(m.epreuves.split(",").length, "épreuve")}</small></button>`).join("");
    const show = i => {
      const m = METHODO[i];
      const c = CONCOURS.find(x => x.long === m.concours) || CONCOURS.find(x => m.concours.includes(x.court));
      $("#mPanel").innerHTML = `<div class="m-panel" role="tabpanel"><span class="eyebrow">${m.concours}</span>
        <div class="m-label">Épreuves principales</div>
        <div class="pills">${m.epreuves.split(",").map(e => `<span class="pill">${e.trim()}</span>`).join("")}</div>
        <div class="m-label">Ce qu'il faut savoir</div><p>${m.conseil}</p>
        ${c ? `<a class="m-link" href="${ROOT}concours/${c.slug}/">Tout sur le concours ${c.court} ${svg("i-arrow")}</a>` : ""}</div>`;
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
  function wireCorrige(scope) {
    const c = $(".corrige", scope), more = $(".more-btn", scope);
    if (!c || !more) return;
    if (c.scrollHeight <= c.clientHeight + 10) { more.parentElement.remove(); return; }
    more.addEventListener("click", () => {
      const open = c.classList.toggle("open");
      more.textContent = open ? "Réduire le corrigé" : "Lire tout le corrigé";
      if (!open) c.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  function renderSujets() {
    if (!$("#sTabs")) return;
    $("#sTabs").innerHTML = SUJETS.map((s, i) => `<button class="s-tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${s.concours}</button>`).join("");
    const show = i => {
      const s = SUJETS[i];
      $("#sPanel").innerHTML = `<article class="paper" role="tabpanel">
        <div class="paper-side"><span class="tag">${s.concours}</span><h3>${s.titre}</h3><div class="meta">${s.meta}</div>
          <div class="enonce"><b>Sujet</b><p>${s.enonce}</p></div></div>
        <div class="paper-main">
          <div class="corrige">${s.corrige}</div>
          <div class="corrige-more"><button class="btn btn-ghost btn-sm more-btn">Lire tout le corrigé</button></div>
          <div class="corrige-cta"><p>Ce corrigé est un extrait de nos ouvrages. Obtenez la version complète avec tous les sujets.</p><button class="btn btn-wa btn-sm" data-wa-order>${svg("i-wa", 'fill="currentColor"')}Commander l'ouvrage complet</button></div>
        </div></article>`;
      wireCorrige($("#sPanel"));
      $$("#sTabs .s-tab").forEach(b => b.setAttribute("aria-selected", +b.dataset.i === i));
    };
    $$("#sTabs .s-tab").forEach(b => b.addEventListener("click", () => show(+b.dataset.i)));
    show(0);
  }
  document.addEventListener("click", e => {
    if (e.target.closest("[data-wa-order]")) openWhatsApp("Bonjour Les Cours Sésame & SAJ, je souhaite obtenir vos ouvrages complets. Merci !");
  });

  /* ---------- Avis et FAQ ---------- */
  function renderReviews() {
    if (!$("#reviews")) return;
    const stars = svg("i-star").repeat(5);
    const card = t => `<figure class="review"><div class="stars" aria-label="5 étoiles">${stars}</div><blockquote>« ${t.text} »</blockquote><figcaption><span class="avatar">${t.initials}</span><span><cite>${t.author}</cite><small>${t.role}</small></span></figcaption></figure>`;
    const half = Math.ceil(TEMOIGNAGES.length / 2);
    const row = (items, rev) => { const h = items.concat(items, items).map(card).join(""); return `<div class="r-row${rev ? " rev" : ""}">${h}${h}</div>`; };
    $("#reviews").innerHTML = row(TEMOIGNAGES.slice(0, half), false) + row(TEMOIGNAGES.slice(half), true);
  }
  function wireFAQ() {
    const items = $$(".faq-item");
    items.forEach(d => d.addEventListener("toggle", () => { if (d.open) items.forEach(o => { if (o !== d) o.open = false; }); }));
  }

  /* ---------- Test « Quel ouvrage pour moi ? » ---------- */
  function initConseiller() {
    const box = $("#csBox");
    if (!box) return;
    const GENERIQUES = ["Annales corrigées", "Guide méthodologique", "Magistrature", "Écrit de la magistrature"];
    const ans = {};
    const steps = [];

    const pool = () => byCat(ans.cat).filter(o => !ans.phase || ans.phase === "tout" || !o.phase || o.phase === ans.phase);
    const matieres = () => {
      const seen = new Map();
      pool().forEach(o => { const p = coverParts(o.titre); if (!GENERIQUES.includes(p.serie)) seen.set(p.sujet.toLowerCase(), p.sujet); });
      return [...seen.values()];
    };

    steps.push({ key: "cat", q: "Quel concours préparez-vous ?", opts: () => CONCOURS.map(c => [c.id, c.court]) });
    steps.push({ key: "phase", q: "Quelle étape préparez-vous ?", when: () => byCat(ans.cat).some(o => o.phase),
      opts: () => [...new Set(byCat(ans.cat).map(o => o.phase).filter(Boolean))].map(p => [p, p]).concat([["tout", "Les deux"]]) });
    steps.push({ key: "matiere", q: "Quelle matière voulez-vous renforcer en priorité ?", opts: () => matieres().map(m => [m, m]).concat([["methode", "Surtout la méthode"]]) });
    steps.push({ key: "temps", q: "Combien de temps vous reste-t-il avant le concours ?", opts: () => [["court", "Moins d'un mois"], ["moyen", "1 à 3 mois"], ["long", "Plus de 3 mois"]] });

    function reco() {
      const items = pool();
      const out = [], why = new Map();
      const add = (o, raison) => { if (o && !out.includes(o)) { out.push(o); why.set(o, raison); } };
      const serie = o => coverParts(o.titre).serie;
      // Guide de méthode et annales propres au concours
      add(items.find(o => serie(o) === "Guide méthodologique"), "Pour maîtriser la méthode attendue par le jury");
      const annales = items.filter(o => serie(o) === "Annales corrigées");
      add(annales.find(o => !/SOG/.test(o.titre)) || annales[0], "Pour vous entraîner sur de vrais sujets corrigés");
      // Matière à renforcer
      if (ans.matiere !== "methode") items.filter(o => coverParts(o.titre).sujet === ans.matiere).forEach(o => add(o, "Votre matière à renforcer"));
      // Selon le temps disponible
      const cours = items.filter(o => !GENERIQUES.includes(serie(o)) && !o.numerique);
      if (ans.temps === "moyen") cours.slice(0, 2).forEach(o => add(o, "Pour consolider les autres matières"));
      if (ans.temps === "long") cours.forEach(o => add(o, "Pour couvrir tout le programme"));
      if (ans.temps === "court") annales.forEach(o => add(o, "Dernière ligne droite : entraînement sur sujets"));
      return { out, why };
    }

    function render(i) {
      let k = i;
      while (steps[k] && steps[k].when && !steps[k].when()) k++;
      if (!steps[k]) return result();
      const s = steps[k];
      const counts = x => !x.when || !ans.cat || x.when();
      const total = steps.filter(counts).length;
      const pos = steps.slice(0, k + 1).filter(counts).length;
      box.innerHTML = `<div class="cs-step" data-k="${k}">
        <div class="cs-progress"><span>Question ${pos} sur ${total}</span><i style="width:${(pos / total) * 100}%"></i></div>
        <h3>${s.q}</h3>
        <div class="cs-opts">${s.opts().map(([v, l]) => `<button class="cs-opt" data-v="${v.replace(/"/g, "&quot;")}">${l}${svg("i-arrow")}</button>`).join("")}</div>
        ${k > 0 ? `<button class="cs-back" data-back="${k}">Retour</button>` : ""}
      </div>`;
      $$(".cs-opt", box).forEach(b => b.addEventListener("click", () => { ans[s.key] = b.dataset.v; render(k + 1); }));
      on($(".cs-back", box), "click", () => { let j = k - 1; while (j > 0 && steps[j].when && !steps[j].when()) j--; render(j); });
    }

    function result() {
      const { out, why } = reco();
      const t = packTotals(out);
      const ids = out.map(o => OUVRAGES.indexOf(o));
      const c = CONCOURS.find(x => x.id === ans.cat);
      box.innerHTML = `<div class="cs-result">
        <span class="eyebrow">Notre suggestion · ${c.court}</span>
        <h3>${plural(out.length, "ouvrage")} pour votre préparation</h3>
        <ul class="cs-list">${out.map(o => `<li><button class="cs-book" data-open="${OUVRAGES.indexOf(o)}"><span class="c-mini"></span><span><b>${o.titre}</b><small>${why.get(o)}</small></span><em>${o.prix} FCFA</em></button></li>`).join("")}</ul>
        <div class="cs-total">${t.disc ? `<s>${fmt(t.sub)} FCFA</s>` : ""}<strong>${fmt(t.total)} FCFA</strong>${t.disc ? `<em>remise de 10 % incluse</em>` : ""}</div>
        <div class="cs-actions"><button class="btn btn-gold" data-pack="${ids.join(",")}">${svg("i-plus", 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"')}Tout ajouter au panier</button>
        <button class="btn btn-ghost" id="csRestart">Recommencer</button></div>
        <p class="cs-note">Suggestion indicative. Pour un conseil sur mesure, <a href="${WA_URL}" target="_blank" rel="noopener">écrivez-nous sur WhatsApp</a>.</p>
      </div>`;
      on("#csRestart", "click", () => { Object.keys(ans).forEach(k => delete ans[k]); render(0); });
    }
    render(0);
  }

  /* ---------- QCM « Testez votre méthode » ---------- */
  function initQCM() {
    const box = $("#qcmBox");
    if (!box || typeof QCM === "undefined") return;
    let i = 0, score = 0;
    const letters = "ABCD";
    function show() {
      const q = QCM[i];
      box.innerHTML = `<div class="qcm-card">
        <div class="cs-progress"><span>Question ${i + 1} sur ${QCM.length}</span><i style="width:${((i + 1) / QCM.length) * 100}%"></i></div>
        <span class="qcm-tag">${q.epreuve}</span>
        <h3>${q.q}</h3>
        <div class="qcm-opts">${q.options.map((o, k) => `<button class="qcm-opt" data-k="${k}"><span>${letters[k]}</span>${o}</button>`).join("")}</div>
        <div class="qcm-expl" hidden></div>
      </div>`;
      $$(".qcm-opt", box).forEach(b => b.addEventListener("click", () => answer(+b.dataset.k)));
    }
    function answer(k) {
      const q = QCM[i];
      const good = k === q.bonne;
      if (good) score++;
      $$(".qcm-opt", box).forEach((b, j) => { b.disabled = true; if (j === q.bonne) b.classList.add("ok"); else if (j === k) b.classList.add("ko"); });
      const ex = $(".qcm-expl", box);
      ex.hidden = false;
      ex.innerHTML = `<b>${good ? "Bonne réponse !" : "Pas tout à fait."}</b> ${q.explication} <a href="#${slugify(q.epreuve)}">Revoir la fiche</a>
        <button class="btn btn-navy btn-sm" id="qcmNext">${i + 1 < QCM.length ? "Question suivante" : "Voir mon score"}${svg("i-arrow", 'fill="none" stroke="currentColor" stroke-width="2.4"')}</button>`;
      on("#qcmNext", "click", () => { i++; i < QCM.length ? show() : end(); });
    }
    function end() {
      const pct = Math.round((score / QCM.length) * 100);
      const msg = pct >= 80 ? "Excellent ! Votre méthode est solide." : pct >= 50 ? "Bonne base. Quelques points de méthode à consolider." : "La méthode fait la différence au concours : nos fiches et guides sont faits pour vous.";
      box.innerHTML = `<div class="qcm-card qcm-end">
        <div class="qcm-score"><b>${score}</b><span>/ ${QCM.length}</span></div>
        <h3>${msg}</h3>
        <div class="cs-actions">
          <button class="btn btn-wa" id="qcmShare">${svg("i-wa", 'fill="currentColor"')}Défier un ami sur WhatsApp</button>
          <button class="btn btn-ghost" id="qcmRestart">Recommencer</button>
        </div></div>`;
      on("#qcmShare", "click", () => openWhatsApp(`J'ai eu ${score}/${QCM.length} au test de méthode des concours (SOG, cas pratique, note de synthèse…) des Cours Sésame et SAJ. À toi de jouer : ${location.href.split("#")[0]}#qcm`, false));
      on("#qcmRestart", "click", () => { i = 0; score = 0; show(); });
    }
    show();
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(text) {
    $("#toastText").textContent = text;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
  }

  /* ---------- En-tête, menu, bannière ---------- */
  function setMenu(open) {
    $("#mobileMenu").classList.toggle("open", open);
    $("#mobileMenu").setAttribute("aria-hidden", !open);
    $("#menuBtn").setAttribute("aria-expanded", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (open) $("#menuClose").focus();
  }
  on("#menuBtn", "click", () => setMenu(true));
  on("#menuClose", "click", () => setMenu(false));
  $$("#mobileMenu a").forEach(a => a.addEventListener("click", () => setMenu(false)));

  function syncTopHeight() {
    const h = $("#siteTop").offsetHeight;
    document.documentElement.style.setProperty("--top-h", h + "px");
    document.documentElement.style.scrollPaddingTop = h + 16 + "px";
  }
  try { if (sessionStorage.getItem("promo-hidden")) $("#promo").hidden = true; } catch (e) {}
  on("#promoClose", "click", () => {
    $("#promo").hidden = true;
    try { sessionStorage.setItem("promo-hidden", "1"); } catch (e) {}
    syncTopHeight();
  });

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { $("#header").classList.toggle("scrolled", scrollY > 10); ticking = false; });
  }, { passive: true });

  // Lien actif dans le menu (sections de la page courante)
  const navLinks = $$(".nav a").filter(a => a.hash && a.pathname === location.pathname);
  if (navLinks.length) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle("active", a.hash === "#" + en.target.id)); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach(a => { const t = document.getElementById(a.hash.slice(1)); if (t) spy.observe(t); });
  }

  /* ---------- Compteurs et apparitions ---------- */
  const COUNTS = { ouvrages: OUVRAGES.length, concours: CONCOURS.length };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function countUp(el) {
    const target = el.dataset.countFrom in COUNTS ? COUNTS[el.dataset.countFrom] : +el.dataset.countFrom;
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
  renderChips();
  renderBooks();
  renderMethodo();
  renderSujets();
  $$(".paper-static").forEach(wireCorrige);
  renderReviews();
  wireFAQ();
  initConseiller();
  initQCM();
  updateCart();
  syncTopHeight();
  window.addEventListener("resize", () => { syncTopHeight(); updateCart(); });
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();
  $$(".reveal, [data-count-from]").forEach(el => io.observe(el));
})();
