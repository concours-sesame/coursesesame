/* Concours blancs en accès libre (page concours-blancs/) : séries de la magistrature (présélection et cinq épreuves
   écrites), du Greffe et de l'administration pénitentiaire, un jeu par cycle (les épreuves d'admissibilité de chaque école). Tout visiteur compose, sans compte ; le chronomètre et la copie restent dans son
   navigateur. Le chronomètre démarre à l'entrée dans le sujet, s'arrête quand le candidat quitte la page et reprend à
   son retour, sans jamais revenir à zéro. Le corrigé n'est livré par la base qu'aux abonnés des formules d'une semaine
   et plus (fonction corrige_epreuve_blanche, supabase/migrations/…_epreuves_blanches.sql). */
(function () {
  "use strict";

  const racine = document.getElementById("blancs");
  const E = window.Espace;
  if (!racine) return;
  if (!E || !E.OUVERT) { racine.innerHTML = `<p class="ea-erreur">Les concours blancs sont momentanément indisponibles. Réessayez plus tard.</p>`; return; }
  const { client, esc, toast, messageErreur, mettreEnForme, poserFiligrane } = E;
  const ROOT = document.body.dataset.root || "";
  const $ = (s, el = racine) => el.querySelector(s);
  const $$ = (s, el = racine) => [...el.querySelectorAll(s)];

  const NOMS = {
    preselection: "Présélection", sog: "Sujet d'ordre général", droit_civil: "Droit civil",
    droit_commercial: "Droit commercial et OHADA", droit_penal: "Droit pénal et procédure pénale", droit_administratif: "Droit administratif",
    organisation_judiciaire: "Organisation judiciaire", opaj: "Organisation politique, administrative et judiciaire",
    opea: "Organisation politique, économique et administrative", informatique: "Informatique et bureautique",
    systeme_penitentiaire: "Droit pénitentiaire", administration_penitentiaire: "Administration pénitentiaire", etude_texte: "Étude de texte",
    droits_enfant: "Droits de l'enfant", fonction_publique: "Statut et déontologie de la fonction publique"
  };
  // Un onglet par concours ; seuls ceux qui ont des épreuves publiées s'affichent
  const CONCOURS = [
    { id: "magistrature", nom: "Magistrature", detail: "Concours direct de la magistrature" },
    { id: "greffe_cs", nom: "Greffe, cycle supérieur", detail: "Administrateurs des greffes et parquets" },
    { id: "greffe_cms", nom: "Greffe, cycle moyen supérieur", detail: "Attachés des greffes et parquets" },
    { id: "greffe_cm", nom: "Greffe, cycle moyen", detail: "Secrétaires des greffes et parquets" },
    { id: "penitentiaire_cs", nom: "Pénitentiaire, cycle supérieur", detail: "Administrateurs des services pénitentiaires" },
    { id: "penitentiaire_cms", nom: "Pénitentiaire, cycle moyen supérieur", detail: "Attachés des services pénitentiaires" },
    { id: "penitentiaire_cm", nom: "Pénitentiaire, cycle moyen", detail: "Agents d'encadrement" },
    { id: "eppjej_cs", nom: "EPPJEJ, cycle supérieur", detail: "Protection judiciaire de l'enfance et de la jeunesse" },
    { id: "eppjej_cms", nom: "EPPJEJ, cycle moyen supérieur", detail: "Protection judiciaire de l'enfance et de la jeunesse" },
    { id: "eppjej_cm", nom: "EPPJEJ, cycle moyen", detail: "Protection judiciaire de l'enfance et de la jeunesse" }
  ];
  const nomConc = id => (CONCOURS.find(c => c.id === id) || { nom: "" }).nom;
  // Épreuves en vrai ou faux : sujet et corrigé en JSON, note calculée à l'écran
  const enVraiFaux = e => e.epreuve === "preselection" || e.epreuve === "informatique";
  const intitule = e => `${e.concours === "magistrature" ? "" : `${nomConc(e.concours)}, `}concours blanc n° ${e.serie}, ${e.titre || NOMS[e.epreuve]}`;
  const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);
  const duree = m => m % 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m / 60} heure${m > 60 ? "s" : ""}`;
  const horloge = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  /* ---------- Copie du candidat, gardée dans le navigateur ---------- */
  // { ecoule: ms de composition, fini: bool, reponses: { n: "V" | "F" }, copie: texte }
  const cle = id => `sesame-blanc-epreuve-${id}`;
  function lire(id) { try { return JSON.parse(localStorage.getItem(cle(id))) || null; } catch (e) { return null; } }
  function ecrire(id, c) { try { localStorage.setItem(cle(id), JSON.stringify(c)); } catch (e) { /* stockage plein ou bloqué */ } }

  let epreuves = [], acces = null, session = null, marque = "", choix = "magistrature";
  let ouverte = null; // { e, copie, debutTic, minuteur }

  async function chargerAcces() {
    const { data: { session: s } } = await client.auth.getSession();
    session = s;
    acces = null;
    if (!s) return;
    const [a, p] = await Promise.all([
      client.rpc("acces_corriges_blancs"),
      client.from("profils").select("prenom, nom, telephone").eq("id", s.user.id).maybeSingle()
    ]);
    acces = !a.error && a.data === true;
    const pr = p.data || {};
    marque = [`${pr.prenom || ""} ${pr.nom || ""}`.trim(), pr.telephone, s.user.email].filter(Boolean).join(" · ");
  }

  /* ---------- Liste des séries ---------- */
  function etatEpreuve(e) {
    const c = lire(e.id);
    if (!c) return { cls: "", txt: duree(e.duree_minutes) };
    if (c.fini) return { cls: " is-fini", txt: "Terminée" };
    return { cls: " is-cours", txt: `En cours, ${horloge(e.duree_minutes * 60000 - c.ecoule)} restantes` };
  }
  function afficherListe() {
    arreterMinuteur();
    document.body.classList.remove("cb-compose");
    if (!epreuves.length) { racine.innerHTML = `<p class="ea-vide">Les concours blancs seront mis en ligne très prochainement.</p>`; return; }
    const presents = CONCOURS.filter(c => epreuves.some(e => e.concours === c.id));
    if (!presents.some(c => c.id === choix)) choix = presents[0].id;
    const onglets = presents.length > 1 ? `<div class="cb-onglets" role="tablist" aria-label="Concours">${presents.map(c => `<button type="button" role="tab" class="cb-onglet${c.id === choix ? " is-actif" : ""}" aria-selected="${c.id === choix}" data-conc="${c.id}"><b>${esc(c.nom)}</b><small>${esc(c.detail)}</small></button>`).join("")}</div>` : "";
    const duConcours = epreuves.filter(e => e.concours === choix);
    const series = [...new Set(duConcours.map(e => e.serie))];
    racine.innerHTML = `${onglets}<div class="cb-series">${series.map(n => {
      const liste = duConcours.filter(e => e.serie === n);
      const finies = liste.filter(e => (lire(e.id) || {}).fini).length;
      return `<section class="cb-serie" id="${choix === "magistrature" ? "" : `${choix}-`}serie-${n}"><h3>Concours blanc n° ${n}<small>${finies ? `${finies} épreuve${finies > 1 ? "s" : ""} sur ${liste.length} terminée${finies > 1 ? "s" : ""}` : `${liste.length} épreuves`}</small></h3>
        <ol class="cb-epreuves">${liste.map(e => { const s = etatEpreuve(e); return `<li><button type="button" class="cb-epreuve${s.cls}" data-eid="${e.id}"><b>${esc(NOMS[e.epreuve] || e.titre)}</b><span>${esc(e.nature)}</span><small>${esc(s.txt)}</small></button></li>`; }).join("")}</ol></section>`;
    }).join("")}</div>`;
  }

  /* ---------- Avertissement avant l'entrée dans le sujet ---------- */
  function avertir(e) {
    const c = lire(e.id);
    if (c) return composer(e);
    arreterMinuteur();
    document.body.classList.remove("cb-compose");
    racine.innerHTML = `<div class="cb-avert">
      <p class="cb-retour"><button type="button" class="btn btn-ghost btn-sm" data-action="liste">Retour aux séries</button></p>
      <h3>${esc(majuscule(intitule(e)))}</h3>
      <p class="cb-avert-duree">${esc(e.nature)} · <b>${duree(e.duree_minutes)}</b></p>
      <div class="cb-avert-regles">
        <p><b>Dès que vous entrez dans le sujet, le chronomètre démarre.</b> Vous ne pourrez plus faire machine arrière : l'épreuve ne se recommence pas à zéro.</p>
        <p>Si vous quittez la page, le compteur reste figé et recommence à compter dès que vous revenez dans le sujet. À la fin du temps, la copie est close.</p>
        <p><b>Composez seul, sans document, sans téléphone, sans recherche sur Internet et sans aide.</b> Ce concours blanc sert à mesurer votre vrai niveau, à quelques semaines du concours. Tricher ne trompe que vous : seul un résultat honnête vous dit ce qu'il reste à travailler.</p>
        <p>Installez-vous au calme, pour ${duree(e.duree_minutes)} d'affilée, comme le jour du concours. ${enVraiFaux(e) ? "Cochez vrai ou faux pour chaque affirmation." : "Vous pouvez composer sur papier ou dans le cadre prévu à l'écran ; la copie tapée reste sur cet appareil."}</p>
      </div>
      <label class="ea-accord"><input type="checkbox" id="cbEngage"><span>Je m'engage à composer seul, sans aucune aide, dans les conditions du concours.</span></label>
      <p><button type="button" class="btn btn-gold" data-action="entrer" data-eid="${e.id}" disabled>J'entre dans le sujet et je lance le chronomètre</button></p>
    </div>`;
    $("#cbEngage").addEventListener("change", ev => { $("[data-action=entrer]").disabled = !ev.target.checked; });
    racine.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Composition ---------- */
  const lirePreselection = t => { try { const o = JSON.parse(t); return o && Array.isArray(o.items) ? o : null; } catch (e) { return null; } };
  async function composer(e) {
    racine.innerHTML = `<p class="ea-attente">Ouverture du sujet…</p>`;
    const { data, error } = await client.rpc("epreuve_blanche", { p_id: e.id });
    const d = (data || [])[0];
    if (error || !d) { racine.innerHTML = `<p class="ea-erreur">${esc(error ? messageErreur(error) : "Cette épreuve n'est plus disponible.")}</p><p><button type="button" class="btn btn-ghost btn-sm" data-action="liste">Retour aux séries</button></p>`; return; }
    const copie = lire(e.id) || { ecoule: 0, fini: false, reponses: {}, copie: "" };
    ecrire(e.id, copie);
    const pre = enVraiFaux(e) ? lirePreselection(d.sujet) : null;
    const sujetHTML = pre
      ? `${pre.consigne ? `<p class="cb-consigne">${esc(pre.consigne)}</p>` : ""}<ol class="cb-items">${pre.items.map(it => `<li class="cb-item" data-n="${it.n}">
          <p>${it.matiere ? `<small>${esc(it.matiere)}</small>` : ""}${esc(it.texte)}</p>
          <span class="cb-vf" role="radiogroup" aria-label="Affirmation ${it.n}">${["V", "F"].map(v => `<label><input type="radio" name="cb-${it.n}" value="${v}"${copie.reponses[it.n] === v ? " checked" : ""}${copie.fini ? " disabled" : ""}><span>${v === "V" ? "Vrai" : "Faux"}</span></label>`).join("")}</span></li>`).join("")}</ol>`
      : `<div class="cb-sujet">${mettreEnForme(d.sujet)}</div>
         <label class="ea-blanc-label" for="cbCopie">Votre copie (facultatif, elle reste sur cet appareil)</label>
         <textarea id="cbCopie" class="ea-blanc-copie" spellcheck="false"${copie.fini ? " readonly" : ""}>${esc(copie.copie || "")}</textarea>`;
    racine.innerHTML = `<div class="cb-compo">
      <div class="cb-barre" role="timer" aria-live="off"><span>${esc(majuscule(intitule(e)))}</span><b id="cbReste">${horloge(e.duree_minutes * 60000 - copie.ecoule)}</b></div>
      ${copie.fini ? "" : `<p class="cb-rappel">Le chronomètre tourne tant que cette page est ouverte. Composez seul, sans document : c'est votre vrai niveau qui compte.</p>`}
      ${sujetHTML}
      <div class="cb-fin" id="cbFin">${copie.fini ? "" : `<button type="button" class="btn btn-navy" data-action="rendre">Je rends ma copie</button>`}
        <button type="button" class="btn btn-ghost btn-sm" data-action="liste">${copie.fini ? "Retour aux séries" : "Quitter (le chronomètre s'arrête)"}</button></div>
      <div id="cbCorrige"></div>
    </div>`;
    ouverte = { e, copie, pre };
    // Pendant l'épreuve, la présentation de la page s'efface : seul le sujet reste à l'écran
    document.body.classList.add("cb-compose");
    if (pre) $$(".cb-vf input").forEach(i => i.addEventListener("change", () => { copie.reponses[i.closest(".cb-item").dataset.n] = i.value; ecrire(e.id, copie); }));
    else { let t; $("#cbCopie").addEventListener("input", ev => { copie.copie = ev.target.value; clearTimeout(t); t = setTimeout(() => ecrire(e.id, copie), 400); }); }
    history.replaceState(null, "", `#epreuve-${e.id}`);
    racine.scrollIntoView({ behavior: "smooth", block: "start" });
    if (copie.fini) afficherCorrige();
    else lancerMinuteur();
  }

  function lancerMinuteur() {
    arreterMinuteur();
    if (!ouverte || ouverte.copie.fini) return;
    ouverte.debutTic = Date.now();
    ouverte.minuteur = setInterval(tic, 1000);
  }
  // Ajoute le temps passé sur la page depuis le dernier relevé ; rien ne s'ajoute quand la page est cachée
  function tic() {
    if (!ouverte || ouverte.copie.fini) return;
    const m = Date.now();
    if (ouverte.debutTic && !document.hidden) ouverte.copie.ecoule += m - ouverte.debutTic;
    ouverte.debutTic = document.hidden ? null : m;
    const reste = ouverte.e.duree_minutes * 60000 - ouverte.copie.ecoule;
    const el = document.getElementById("cbReste");
    if (el) { el.textContent = horloge(reste); el.classList.toggle("is-fin", reste < 15 * 60000); }
    if (reste <= 0) { clore("Le temps est écoulé, votre copie est close."); return; }
    ecrire(ouverte.e.id, ouverte.copie);
  }
  function arreterMinuteur() {
    if (!ouverte) return;
    if (ouverte.minuteur) { tic(); clearInterval(ouverte.minuteur); }
    ouverte.minuteur = null; ouverte.debutTic = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (!ouverte || !ouverte.minuteur) return;
    if (document.hidden) { tic(); ouverte.debutTic = null; } else ouverte.debutTic = Date.now();
  });
  window.addEventListener("pagehide", () => { if (ouverte && ouverte.minuteur) tic(); });

  function clore(msg) {
    const o = ouverte;
    if (!o || o.copie.fini) return;
    clearInterval(o.minuteur); o.minuteur = null;
    o.copie.ecoule = Math.min(o.copie.ecoule, o.e.duree_minutes * 60000);
    o.copie.fini = true;
    if (!o.pre) { const t = document.getElementById("cbCopie"); if (t) { o.copie.copie = t.value; t.readOnly = true; } }
    ecrire(o.e.id, o.copie);
    $$(".cb-vf input").forEach(i => { i.disabled = true; });
    $(".cb-rappel") && $(".cb-rappel").remove();
    $("#cbFin").innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-action="liste">Retour aux séries</button>`;
    toast(msg);
    afficherCorrige();
  }

  /* ---------- Corrigé, pour les abonnés qui y ont droit ---------- */
  async function afficherCorrige() {
    const zone = document.getElementById("cbCorrige");
    const o = ouverte;
    if (!zone || !o) return;
    const passe = Math.round(o.copie.ecoule / 60000);
    const bilan = `<p class="cb-temps">Temps de composition : ${passe} minute${passe > 1 ? "s" : ""} sur ${o.e.duree_minutes}.</p>`;
    if (!session || !acces) {
      zone.innerHTML = `${bilan}<div class="cb-verrou"><h3>Le corrigé est réservé aux abonnés</h3>
        <p>${session ? "Votre formule actuelle ne comprend pas les corrigés des concours blancs." : "Connectez-vous à votre compte abonné pour lire le corrigé."} Les corrigés ${o.pre ? "(réponses et justifications de chaque affirmation, avec votre note)" : "(corrigé-type intégral et grille de notation sur 20)"} sont ouverts aux formules d'une semaine et plus, dès 2 000 FCFA.</p>
        <div class="hero-ctas"><a class="btn btn-gold" href="${ROOT}espace-abonnes/#inscription">S'abonner</a>${session ? "" : `<a class="btn btn-ghost" href="${ROOT}espace-abonnes/#connexion" data-retour="concours-blancs/#epreuve-${o.e.id}">Se connecter</a>`}</div></div>`;
      return;
    }
    zone.innerHTML = `${bilan}<p class="ea-attente">Chargement du corrigé…</p>`;
    const { data, error } = await client.rpc("corrige_epreuve_blanche", { p_id: o.e.id });
    if (error || !data) { zone.innerHTML = `${bilan}<p class="ea-erreur">${esc(error ? messageErreur(error) : "Corrigé indisponible.")}</p>`; return; }
    if (o.pre) {
      let rep = {};
      try { (JSON.parse(data).reponses || []).forEach(r => { rep[r.n] = r; }); } catch (e) { rep = {}; }
      let bonnes = 0, vides = 0;
      $$(".cb-item").forEach(li => {
        const n = li.dataset.n, r = rep[n], donne = o.copie.reponses[n];
        if (!r) return;
        if (!donne) vides++; else if (donne === r.r) bonnes++;
        li.classList.add(!donne ? "is-vide" : donne === r.r ? "is-bon" : "is-faux");
        if (!li.querySelector(".cb-just")) li.insertAdjacentHTML("beforeend", `<p class="cb-just"><b>${r.r === "V" ? "Vrai" : "Faux"}.</b> ${esc(r.j || "")}</p>`);
      });
      const total = Object.keys(rep).length || 1;
      const note = Math.round(bonnes / total * 40) / 2;
      zone.innerHTML = `${bilan}<div class="ea-blanc-note"><b>${String(note).replace(".", ",")}/20</b><span>${bonnes} bonne${bonnes > 1 ? "s" : ""} réponse${bonnes > 1 ? "s" : ""} sur ${total}${vides ? `, ${vides} sans réponse` : ""}. La justification de chaque affirmation s'affiche sous la question.</span></div>`;
      poserFiligrane($(".cb-items"), marque);
      return;
    }
    zone.innerHTML = `${bilan}<h3 class="cb-corrige-titre">Corrigé</h3><div class="cb-corrige">${mettreEnForme(data)}</div>`;
    poserFiligrane($(".cb-corrige"), marque);
  }

  /* ---------- Actions ---------- */
  racine.addEventListener("click", ev => {
    const lien = ev.target.closest("a[data-retour]");
    if (lien) { try { sessionStorage.setItem("sesame-retour", lien.dataset.retour); } catch (e) { /* stockage bloqué */ } return; }
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.classList.contains("cb-onglet")) {
      choix = b.dataset.conc;
      try { localStorage.setItem("sesame-blanc-concours", choix); } catch (e) { /* stockage bloqué */ }
      history.replaceState(null, "", `${location.pathname}${choix === "magistrature" ? "" : `?concours=${choix}`}`);
      afficherListe();
      return;
    }
    const e = b.dataset.eid && epreuves.find(x => String(x.id) === b.dataset.eid);
    if (b.classList.contains("cb-epreuve") && e) { avertir(e); return; }
    const act = b.dataset.action;
    if (act === "entrer" && e) { composer(e); return; }
    if (act === "liste") {
      if (ouverte && ouverte.minuteur && !confirm("Quitter l'épreuve ? Le chronomètre s'arrête et reprendra dès que vous reviendrez dans le sujet. L'épreuve ne recommencera pas à zéro.")) return;
      arreterMinuteur(); ouverte = null;
      history.replaceState(null, "", `${location.pathname}${choix === "magistrature" ? "" : `?concours=${choix}`}`);
      afficherListe();
      racine.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (act === "rendre") {
      if (!confirm("Rendre votre copie maintenant ? L'épreuve sera close, sans retour possible.")) return;
      clore("Copie rendue.");
    }
  });
  // Le corrigé et les justifications ne se copient pas ; la copie du candidat reste modifiable
  racine.addEventListener("copy", ev => { if (ev.target.closest && ev.target.closest(".cb-corrige, .cb-just")) ev.preventDefault(); });
  client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" || ev === "SIGNED_IN") chargerAcces().catch(() => {}); });

  (async () => {
    try {
      const [listes] = await Promise.all([
        Promise.all(CONCOURS.map(c => client.rpc("epreuves_blanches_liste", { p_concours: c.id }))),
        chargerAcces().catch(() => {})
      ]);
      const err = listes.find(l => l.error);
      if (err) throw err.error;
      epreuves = listes.flatMap((l, i) => (l.data || []).map(e => ({ ...e, concours: CONCOURS[i].id })));
    } catch (err) {
      racine.innerHTML = `<p class="ea-erreur">${esc(messageErreur(err))}</p>`;
      racine.setAttribute("aria-busy", "false");
      return;
    }
    racine.setAttribute("aria-busy", "false");
    // Concours affiché : adresse (?concours=greffe_cs ou #greffe_cs-serie-2), sinon le dernier choisi sur cet appareil
    const q = new URLSearchParams(location.search).get("concours");
    const s = location.hash.match(/^#(?:([a-z_]+)-)?serie-(\d+)$/);
    let memo = null;
    try { memo = localStorage.getItem("sesame-blanc-concours"); } catch (e) { /* stockage bloqué */ }
    choix = (s && (s[1] || "magistrature")) || q || memo || "magistrature";
    const m = location.hash.match(/^#epreuve-(\d+)$/);
    const e = m && epreuves.find(x => String(x.id) === m[1]);
    if (e) { choix = e.concours; avertir(e); } else afficherListe();
    if (s) { const el = document.getElementById(`${s[1] ? `${s[1]}-` : ""}serie-${s[2]}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  })();
})();
