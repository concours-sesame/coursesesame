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

  /* ---------- Mention au nom de l'abonné sur un PDF ---------- */
  async function pdfAuNom(octets, marque, mention) {
    await chargerScript(ROOT + "assets/vendor/pdf-lib-1.17.1.min.js");
    const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
    const doc = await PDFDocument.load(octets, { ignoreEncryption: true });
    const gras = await doc.embedFont(StandardFonts.HelveticaBold);
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    // Les polices standard ne connaissent que l'alphabet latin : autres caractères remplacés
    const sur = (police, t) => { try { police.encodeText(t); return t; } catch (e) { return t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "?"); } };
    const m1 = sur(gras, marque), m2 = sur(normal, mention);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const taille = Math.max(14, Math.min(width, height) / 16);
      const angle = Math.atan2(height, width);
      const long = gras.widthOfTextAtSize(m1, taille);
      page.drawText(m1, {
        x: width / 2 - (Math.cos(angle) * long) / 2, y: height / 2 - (Math.sin(angle) * long) / 2,
        size: taille, font: gras, color: rgb(0.06, 0.16, 0.36), opacity: 0.09, rotate: degrees((angle * 180) / Math.PI)
      });
      page.drawText(m2, { x: 22, y: 10, size: 6.5, font: normal, color: rgb(0.25, 0.25, 0.3), opacity: 0.85 });
    }
    return doc.save();
  }

  /* ---------- Visionneuse des contenus ---------- */
  let visionneuse, retourFocus, minuterieMarque;
  function fermerVisionneuse() {
    if (!visionneuse || visionneuse.hidden) return;
    const v = $("video", visionneuse);
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
    clearInterval(minuterieMarque);
    $$("a[data-blob]", visionneuse).forEach(a => URL.revokeObjectURL(a.href));
    visionneuse.hidden = true;
    document.body.style.overflow = "";
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
  // marque : texte affiché sur la vidéo et porté sur les documents (nom et téléphone de l'abonné)
  async function ouvrirContenu(c, marque) {
    if (!visionneuse) creerVisionneuse();
    retourFocus = document.activeElement;
    const t = TYPES[c.type] || TYPES.texte;
    $("#eaVType").className = "ea-type ea-type-" + c.type;
    $("#eaVType").textContent = t.nom;
    $("#eaVTitre").textContent = c.titre;
    $("#eaVDesc").textContent = c.description || "";
    $("#eaVDesc").hidden = !c.description;
    const corps = $("#eaVCorps");
    corps.innerHTML = `<p class="ea-attente">Chargement…</p>`;
    visionneuse.hidden = false;
    document.body.style.overflow = "hidden";
    $(".ea-v-fermer", visionneuse).focus();

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
    const duree = c.type === "video" ? 4 * 3600 : 600;
    const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, duree);
    if (error || !data) { corps.innerHTML = `<p class="ea-erreur">Ce contenu n'est pas accessible. Si votre abonnement est actif, rechargez la page.</p>`; return; }

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
    // Document PDF : préparé à son nom, puis ouvert ou téléchargé
    corps.innerHTML = `<p>Chaque page de ce document porte la mention « ${esc(marque)} ».</p>
      <div class="ea-v-actions"><button class="btn btn-navy" type="button" id="eaPrep">Préparer le document</button></div>
      <p class="ea-etat" role="status"></p>`;
    $("#eaPrep").addEventListener("click", async () => {
      const etat = $(".ea-etat", corps), bouton = $("#eaPrep");
      bouton.disabled = true;
      etat.textContent = "Préparation du document à votre nom…";
      try {
        const r = await fetch(data.signedUrl);
        if (!r.ok) throw new Error("Téléchargement impossible");
        const octets = await pdfAuNom(await r.arrayBuffer(), marque, `Réservé à ${marque} · Les Cours Sésame et SAJ · Reproduction et diffusion interdites`);
        const url = URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
        const nom = (window.SESAME ? window.SESAME.slugify(c.titre) : "document") + ".pdf";
        $(".ea-v-actions", corps).innerHTML = `<a class="btn btn-gold" data-blob href="${url}" target="_blank" rel="noopener">Ouvrir le document</a><a class="btn btn-ghost" data-blob href="${url}" download="${esc(nom)}">Télécharger</a>`;
        etat.textContent = "Document prêt.";
      } catch (e) {
        bouton.disabled = false;
        etat.textContent = "Le document n'a pas pu être préparé. Réessayez.";
      }
    });
  }

  window.Espace = { client, OUVERT, esc, dateFr, auj, joursJusqua, fcfa, WA_NUM, numeroWa, lienWa, TYPES, CONC, nomConcours, icone, messageErreur, erreurFonction, toast, ouvrirContenu, lienSur };

  /* =====================================================================
     Page de l'espace abonnés
     ===================================================================== */
  const racine = $("#espace");
  if (!racine) return;
  const marqueDe = p => `${p.prenom} ${p.nom} · ${p.telephone}`;
  let etat = {};

  if (!OUVERT) {
    racine.innerHTML = `<div class="ea-carte-info"><h3>L'espace abonnés ouvre bientôt.</h3><p>Écrivez-nous sur WhatsApp pour être prévenu de son ouverture.</p><a class="btn btn-wa" href="${lienWa(WA_NUM, "Bonjour Les Cours Sésame & SAJ, je souhaite être prévenu de l'ouverture de l'espace abonnés.")}" target="_blank" rel="noopener">${icone("i-wa")}Écrire sur WhatsApp</a></div>`;
    return;
  }

  async function chargerEtat() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { session: null };
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
  function bibliothequeHTML() {
    if (!contenus.length) return `<div class="ea-biblio"><p class="ea-vide">Les premiers contenus exclusifs arrivent très bientôt. Revenez nous voir.</p></div>`;
    const types = Object.keys(TYPES).filter(t => contenus.some(c => c.type === t));
    const liste = filtre === "tous" ? contenus : contenus.filter(c => c.type === filtre);
    return `<div class="ea-biblio">
        <div class="ea-biblio-tete"><h3>Vos contenus exclusifs</h3>
          ${types.length > 1 ? `<div class="chips" role="group" aria-label="Filtrer par type">${[["tous", "Tous", contenus.length], ...types.map(t => [t, TYPES[t].pluriel, contenus.filter(c => c.type === t).length])].map(([v, l, n]) => `<button class="chip" type="button" data-filtre="${v}" aria-pressed="${filtre === v}">${l}<span class="n">${n}</span></button>`).join("")}</div>` : ""}
        </div>
        <div class="ea-grille">${liste.map(c => `<button class="ea-carte" type="button" data-id="${c.id}">
            <span class="ea-type ea-type-${c.type}">${TYPES[c.type].nom}</span>
            <b>${esc(c.titre)}</b>
            ${c.description ? `<span class="ea-carte-desc">${esc(c.description)}</span>` : ""}
            <small>${[c.matiere ? esc(c.matiere) : "", (c.concours || []).map(nomConcours).join(", "), dateFr(c.publie_le)].filter(Boolean).join(" · ")}</small>
            <span class="ea-carte-go">${TYPES[c.type].action}${icone("i-arrow")}</span>
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
    if (!etat.session) {
      racine.innerHTML = `<div class="ea-accueil">${formulairesHTML(onglet || (location.hash === "#inscription" ? "inscription" : "connexion"))}${await apercuHTML()}</div>`;
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
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      history.replaceState(null, "", location.pathname);
      afficher();
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
  window.addEventListener("hashchange", versFormulaire);
  afficher().then(versFormulaire);
})();
