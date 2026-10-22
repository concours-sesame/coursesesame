/* Administration de l'espace abonnés : activation des abonnements après paiement, relances WhatsApp,
   mots de passe provisoires, ajout et publication des contenus exclusifs, suivi des paiements.
   Réservée aux comptes inscrits dans la table « admins » : la base refuse toute autre demande. */
(function () {
  "use strict";
  const racine = document.querySelector("#admin");
  if (!racine) return;
  const E = window.Espace;
  if (!E || !E.OUVERT) { racine.innerHTML = `<div class="ea-carte-info"><h3>L'espace abonnés n'est pas encore configuré.</h3></div>`; return; }
  const { client, esc, dateFr, auj, joursJusqua, fcfa, numeroWa, lienWa, TYPES, CONC, nomConcours, icone, messageErreur, erreurFonction, toast, ouvrirContenu, lienSur, lireQcm } = E;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROOT = document.body.dataset.root || "";
  const URL_ESPACE = new URL(ROOT + "espace-abonnes/", location.href).href;
  const MOYENS = ["Orange Money", "MTN MoMo", "Wave", "Moov Money", "Espèces", "Autre"];
  // Durées proposées : j = jours, m = mois. Les prix servent à préremplir le montant (modifiable).
  // Formules en jours ou en semaines : sans les ouvrages complets (réservés aux périodes d'au moins 28 jours) ;
  // la formule d'un jour, sans les vidéos non plus (réservées aux périodes d'au moins 7 jours)
  const DUREES = [["j1", "1 jour, sans les vidéos ni les ouvrages"], ["j7", "1 semaine, sans les ouvrages"], ["j14", "2 semaines, sans les ouvrages"], ["m1", "1 mois"], ["m2", "2 mois"], ["m3", "3 mois"], ["m6", "6 mois"], ["m12", "12 mois"], ["date", "Jusqu'à une date…"]];
  const PRIX = Object.fromEntries((typeof TARIFS_ABONNEMENT !== "undefined" && TARIFS_ABONNEMENT.length ? TARIFS_ABONNEMENT : [
    { cle: "j1", prix: "500" }, { cle: "j7", prix: "2 000" }, { cle: "j14", prix: "3 500" }, { cle: "m1", prix: "5 000" },
    { cle: "m2", prix: "9 000" }, { cle: "m3", prix: "12 500" }, { cle: "m6", prix: "22 500" }, { cle: "m12", prix: "40 000" }
  ]).filter(t => t.cle).map(t => [t.cle, String(t.prix).replace(/\D/g, "")]));
  const plusJours = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const MATIERES = ["Droit civil", "Droit pénal", "Procédure pénale", "Droit administratif", "Droit commercial OHADA", "Organisation judiciaire", "Droits de l'enfant", "SOG", "Méthodologie", "Culture générale",
    // Textes publics : lecture sans plafond, texte complet téléchargeable, hors du calcul des 5 % (matière commençant ainsi)
    "Texte officiel · Institutions", "Texte officiel · Droit pénal", "Texte officiel · Droit civil", "Texte officiel · OHADA", "Texte officiel · Droit administratif",
    "Jurisprudence · CCJA", "Jurisprudence · Droit administratif", "Jurisprudence · Droit civil", "Jurisprudence · Droit pénal"];
  const EXTENSIONS = { "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf" };
  const TAILLE_MAX = 50 * 1024 * 1024;

  let moi = null, abonnes = [], paiements = [], contenus = [];
  let commandes = [], notes = new Map(), lectures = [], annonces = [], journal = [], blancs = [], epreuvesB = [];
  let telechargements = [], pagesLues = [], limitesTele = null, rechercheT = "";
  let visites = [], visitesJours = [], filtreV = "tous", minuterieVisites = null; // onglet Visites (site public)
  let emailsReglages = null, emailsEnvoyes = [], etatBrevo = null;
  let deuxEtapes = true; // validation en deux étapes activée pour ce compte
  let facteurs = []; // applications d'authentification validées (téléphone, clés de secours)
  let telechargement = false; // archive .zip ou texte pour l'agent en préparation : la page ne se redessine pas
  let agentReglages = null, agentConsignes = new Map(), agentEchanges = []; // agent de révision (réglages, méthode, demandes des 62 derniers jours)
  let bilanPassages = null; // texte préparé pour l'agent de révision, par contenu (pages, pages sans texte, caractères)
  // Au-delà de ce nombre d'appareils en 7 jours, le compte est signalé comme peut-être partagé
  const SEUIL_PARTAGE = 3;
  // Un abonné est « en ligne » si sa page de l'espace abonnés s'est signalée depuis moins de 3 minutes
  // (elle le fait à l'ouverture puis chaque minute tant qu'elle est affichée)
  const EN_LIGNE_MS = 3 * 60 * 1000;
  let onglet = "direct", filtre = "tous", recherche = "";
  let filtreC = "tous", rechercheC = ""; // recherche et filtre de l'onglet Contenus
  const retours = {}; // messages affichés sous une ligne après une action (par compte ou contenu)
  // Suivi en direct : changements reçus de Supabase Realtime, et actualisation de secours toutes les 30 secondes
  let canal = null, enDirect = false, majEnAttente = false, derniereMaj = null, minuterieDirect = null, attenteSignal = null;
  let retourDirect = ""; // dernier message d'action affiché en tête du suivi en direct

  /* ---------- Outils ---------- */
  const lendemain = d => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  const heure = d => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  function ilYa(t) {
    if (!t) return "jamais";
    const m = Math.floor((Date.now() - new Date(t)) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `il y a ${h} h` : `le ${dateFr(t)}`;
  }
  const enLigne = a => !!a.vu_le && Date.now() - new Date(a.vu_le) < EN_LIGNE_MS;
  // Abonné en cours qui n'est pas passé dans l'espace depuis JOURS_INACTIF jours (à défaut de passage : début de la période)
  const JOURS_INACTIF = 5;
  const dernierPassage = a => a.vu_le || a.derniere_connexion || ((periodeCourante(a) || {}).debut ? periodeCourante(a).debut + "T00:00:00Z" : null);
  const joursSansPassage = a => { const t = dernierPassage(a); return t ? Math.floor((Date.now() - new Date(t)) / 864e5) : 0; };
  const inactif = a => a.actif && !a.suspendu_depuis && joursSansPassage(a) >= JOURS_INACTIF;
  // Jours restants (aujourd'hui compris) ; pendant une suspension, jours gardés en réserve
  const joursRestants = a => !a.fin ? 0 : Math.max(0, (a.suspendu_depuis ? Math.round((new Date(a.fin + "T00:00:00Z") - new Date(a.suspendu_depuis + "T00:00:00Z")) / 864e5) : joursJusqua(a.fin)) + 1);
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  function statut(a) {
    if (a.suspendu_depuis) return { cle: "suspendu", texte: `Suspendu depuis le ${dateFr(a.suspendu_depuis)}` };
    if (a.actif) {
      const j = joursJusqua(a.fin);
      return j <= 7 ? { cle: "bientot", texte: `Fin le ${dateFr(a.fin)}` } : { cle: "actif", texte: `Actif jusqu'au ${dateFr(a.fin)}` };
    }
    if (a.fin && joursJusqua(a.fin) > 0) return { cle: "avenir", texte: `Commence le ${dateFr((periodeCourante(a) || {}).debut || a.fin)}` };
    if (a.fin) return { cle: "expire", texte: `Terminé le ${dateFr(a.fin)}` };
    return { cle: "attente", texte: "En attente d'activation" };
  }
  const enCours = a => a.actif || !!a.suspendu_depuis;
  // Compte inscrit depuis plus de 30 jours sans aucun paiement : faux compte ou inscription abandonnée
  const jamaisActive = a => !Number(a.nb_paiements) && !a.fin && joursJusqua(String(a.inscrit_le).slice(0, 10)) < -30;
  // Période en cours (ou, à défaut, prochaine période) d'un compte, d'après l'historique des paiements
  function periodeCourante(a) {
    const p = paiements.filter(x => x.user_id === a.user_id).sort((x, y) => (x.debut < y.debut ? -1 : 1));
    const jour = auj();
    return p.find(x => x.debut <= jour && jour <= x.fin) || p.find(x => x.debut > jour) || null;
  }
  const FILTRES = [["tous", "Tous", () => true], ["attente", "En attente", a => statut(a).cle === "attente"],
    ["actif", "En cours", a => a.actif && !a.suspendu_depuis], ["enligne", "En ligne", a => enLigne(a)],
    ["bientot", "Fin sous 7 jours", a => statut(a).cle === "bientot"], ["inactif", "Inactifs", a => inactif(a)], ["suspendu", "Suspendus", a => !!a.suspendu_depuis],
    ["expire", "Terminés", a => statut(a).cle === "expire"], ["anciens", "Jamais activés, +30 jours", a => jamaisActive(a)]];
  const estOuvrage = c => /^ouvrage/i.test(c.matiere || "");
  const FILTRES_C = [["tous", "Tous", () => true], ["ouvrages", "Ouvrages complets", estOuvrage],
    ["pdf", "Autres PDF", c => c.type === "pdf" && !estOuvrage(c)], ["texte", "Fiches et QCM", c => c.type === "texte"],
    ["video", "Vidéos", c => c.type === "video"], ["brouillons", "Brouillons et programmés", c => !c.publie || programme(c)]];
  // Recherche sans accents ni majuscules ; tous les mots tapés doivent se retrouver (titre, matière, présentation, concours)
  const sansAccents = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function contenusFiltres() {
    const mots = sansAccents(rechercheC).split(/\s+/).filter(Boolean);
    const test = (FILTRES_C.find(f => f[0] === filtreC) || FILTRES_C[0])[2];
    return contenus.filter(test).filter(c => {
      const t = sansAccents(`${c.titre} ${c.matiere || ""} ${c.description || ""} ${(c.concours || []).map(nomConcours).join(" ")} ${(c.concours || []).join(" ")}`);
      return mots.every(m => t.includes(m));
    });
  }
  function listeContenus() {
    const liste = contenusFiltres();
    return `<p class="ad-note">${liste.length === contenus.length ? pluriel(contenus.length, "contenu") : `${liste.length} sur ${pluriel(contenus.length, "contenu")}`}</p>
      ${liste.length ? liste.map(ligneContenu).join("") : `<p class="ea-vide">${contenus.length ? "Aucun contenu ne correspond. Essayez un autre mot." : "Aucun contenu pour le moment."}</p>`}`;
  }
  function zoneContenus() {
    return `<div class="ad-outils ad-outils-c">
        <label class="search"><span class="sr-only">Rechercher un contenu</span>${icone("i-search")}<input type="search" id="adRechercheC" placeholder="Rechercher un ouvrage par titre, matière ou concours" value="${esc(rechercheC)}" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filtrer les contenus">${FILTRES_C.map(([v, l, f]) => `<button class="chip" type="button" data-filtrec="${v}" aria-pressed="${filtreC === v}">${l}<span class="n">${contenus.filter(f).length}</span></button>`).join("")}</div>
      </div>
      <div class="ad-liste" id="adListeC">${listeContenus()}</div>`;
  }
  function messageRelance(a) {
    const s = statut(a).cle, debut = `Bonjour ${a.prenom},\n\n`;
    const payer = "réglez votre abonnement par Mobile Money (Orange Money, MTN MoMo, Wave ou Moov Money) et envoyez-nous la référence du paiement.";
    if (s === "attente") return `${debut}Votre compte sur l'espace abonnés des Cours Sésame et SAJ est prêt. Pour l'activer, ${payer}\n\n${URL_ESPACE}`;
    if (s === "actif" && inactif(a)) {
      const recents = contenus.filter(c => c.publie && c.publie_le && Date.now() - new Date(c.publie_le) < 7 * 864e5).length;
      return `${debut}Nous ne vous avons pas vu dans votre espace abonnés des Cours Sésame et SAJ depuis quelques jours. Votre abonnement court jusqu'au ${dateFr(a.fin)} : il vous reste ${pluriel(joursRestants(a), "jour")} pour en profiter.${recents ? `\n\n${recents > 1 ? `${recents} nouveaux contenus ont été ajoutés` : "Un nouveau contenu a été ajouté"} cette semaine.` : ""}\n\nPour reprendre en un quart d'heure : la révision du jour, un sujet corrigé, ou les textes officiels. Si vous avez du mal à vous connecter, répondez-moi ici.\n\n${URL_ESPACE}`;
    }
    if (s === "bientot") return `${debut}Votre abonnement à l'espace abonnés des Cours Sésame et SAJ prend fin le ${dateFr(a.fin)}. Pour le renouveler, ${payer}`;
    if (s === "expire") return `${debut}Votre abonnement à l'espace abonnés des Cours Sésame et SAJ a pris fin le ${dateFr(a.fin)}. Pour retrouver l'accès, ${payer}`;
    if (s === "suspendu") return `${debut}Votre abonnement à l'espace abonnés des Cours Sésame et SAJ est suspendu depuis le ${dateFr(a.suspendu_depuis)}. Vos ${pluriel(joursRestants(a), "jour")} restants sont conservés : ils reprendront le jour de la réactivation.`;
    return debut;
  }
  const messageSuspension = a => `Bonjour ${a.prenom},\n\nVotre abonnement à l'espace abonnés des Cours Sésame et SAJ est suspendu à partir d'aujourd'hui. Vos ${pluriel(joursRestants(a), "jour")} restants sont conservés : ils reprendront le jour de la réactivation.`;
  const messageReactivation = (a, fin) => `Bonjour ${a.prenom},\n\nVotre abonnement à l'espace abonnés des Cours Sésame et SAJ est réactivé. Votre accès est ouvert jusqu'au ${dateFr(fin)}.\nConnectez-vous ici : ${URL_ESPACE}`;
  const moisCourant = auj().slice(0, 7);
  const encaisseCeMois = () => paiements.filter(p => p.cree_le.slice(0, 7) === moisCourant).reduce((s, p) => s + (p.montant || 0), 0);

  /* ---------- Connexion ---------- */
  function connexion() {
    racine.innerHTML = `<div class="ea-auth ad-connexion">
        <h3>Connexion administrateur</h3>
        <form class="form ea-form" id="adConnexion" novalidate>
          <div class="field full"><label for="aEmail">Adresse e-mail</label><input id="aEmail" type="email" autocomplete="email" required></div>
          <div class="field full"><label for="aMdp">Mot de passe</label><input id="aMdp" type="password" autocomplete="current-password" required></div>
          <p class="ea-msg" role="alert"></p>
          <button class="btn btn-navy" type="submit">Se connecter</button>
        </form>
      </div>`;
  }

  async function demarrer() {
    racine.setAttribute("aria-busy", "true");
    const { data: { session } } = await client.auth.getSession();
    if (!session) { connexion(); racine.removeAttribute("aria-busy"); return; }
    moi = session.user;
    const { data: adm } = await client.from("admins").select("user_id").eq("user_id", moi.id).maybeSingle();
    if (!adm) {
      racine.innerHTML = `<div class="ea-carte-info"><h3>Ce compte n'a pas accès à l'administration.</h3><p>Connecté : ${esc(moi.email)}</p><button class="btn btn-navy" type="button" data-action="sortir">Se déconnecter</button></div>`;
      racine.removeAttribute("aria-busy");
      return;
    }
    // Validation en deux étapes : sans le code, la base refuse les droits d'administrateur
    const etape = await E.etapeCode();
    if (etape === "code") { racine.removeAttribute("aria-busy"); await E.formulaireCode(racine); return demarrer(); }
    deuxEtapes = etape !== "aucun";
    await chargerFacteurs();
    try { await toutCharger(); afficher(); brancherDirect(); } catch (e) {
      racine.innerHTML = `<div class="ea-carte-info"><h3>Chargement impossible.</h3><p>${esc(messageErreur(e))}</p><button class="btn btn-navy" type="button" data-action="recharger">Réessayer</button></div>`;
    }
    racine.removeAttribute("aria-busy");
  }
  async function toutCharger() {
    const [a, p, c, ap, act, cmd, nt, lec, ann, jr, bil, ar, ac, ae, tl, pl, lt, er, ee, cb, eb, vi, vj] = await Promise.all([
      client.rpc("admin_liste_abonnes"),
      client.rpc("admin_paiements"),
      client.from("contenus").select("*").order("publie_le", { ascending: false }),
      client.rpc("admin_appareils"),
      client.rpc("admin_activite"),
      client.from("commandes").select("*").order("cree_le", { ascending: false }),
      client.from("notes_abonnes").select("user_id, note"),
      client.from("lectures").select("user_id, contenu_id, ouvert_le").gte("ouvert_le", new Date(Date.now() - 90 * 864e5).toISOString()).order("ouvert_le", { ascending: false }).limit(5000),
      client.from("annonces").select("*").order("cree_le", { ascending: false }),
      client.from("journal_admin").select("*").order("quand", { ascending: false }).limit(300),
      client.rpc("admin_bilan_passages"),
      client.from("agent_reglages").select("*").maybeSingle(),
      client.from("agent_consignes").select("cle, texte, maj_le"),
      client.from("agent_echanges").select("id, user_id, exercice, mode, matiere, sujet, note, cout_fcfa, statut, jetons_entree, jetons_sortie, jetons_cache, cree_le")
        .gte("cree_le", new Date(Date.now() - 62 * 864e5).toISOString()).order("cree_le", { ascending: false }).limit(1000),
      client.rpc("admin_telechargements", { p_jours: 60 }),
      client.rpc("admin_pages_lues", { p_jours: 30 }),
      client.rpc("telechargement_limites"),
      client.from("emails_reglages").select("*").maybeSingle(),
      client.from("emails_envoyes").select("*").order("cree_le", { ascending: false }).limit(300),
      client.rpc("admin_concours_blancs"),
      client.from("epreuves_blanches").select("id, concours, serie, ordre, epreuve, titre, nature, duree_minutes, publie").order("serie").order("ordre"),
      client.rpc("admin_visites", { p_heures: 48 }),
      client.rpc("admin_visites_jours", { p_jours: 30 })
    ]);
    const err = a.error || p.error || c.error;
    if (err) throw err;
    abonnes = a.data; paiements = p.data; contenus = c.data;
    // Outils ajoutés en octobre 2026 : tables absentes ou vides, la page fonctionne quand même
    commandes = cmd.data || []; notes = new Map((nt.data || []).map(x => [x.user_id, x.note]));
    lectures = lec.data || []; annonces = ann.data || []; journal = jr.data || [];
    lireBilan(bil);
    emailsReglages = er.data || null; emailsEnvoyes = ee.data || [];
    blancs = cb.data || []; epreuvesB = eb.data || [];
    visites = vi.data || []; visitesJours = vj.data || [];
    telechargements = tl.data || []; pagesLues = pl.data || []; limitesTele = (lt.data || [])[0] || null;
    agentReglages = ar.data || null; agentConsignes = new Map((ac.data || []).map(x => [x.cle, x])); agentEchanges = ae.data || [];
    // Appareils utilisés ces 7 derniers jours (un compte ne s'utilise que sur un appareil à la fois)
    const appareils = new Map((ap.data || []).map(x => [x.user_id, Number(x.appareils_7j)]));
    // Dernier passage sur l'espace abonnés, dernière connexion et suspension en cours
    const activite = new Map((act.data || []).map(x => [x.user_id, x]));
    abonnes.forEach(x => {
      const v = activite.get(x.user_id) || {};
      Object.assign(x, { appareils: appareils.get(x.user_id) || 0, vu_le: v.vu_le || null, derniere_connexion: v.derniere_connexion || null, suspendu_depuis: v.suspendu_depuis || null });
    });
    derniereMaj = new Date(); majEnAttente = false;
  }

  /* ---------- Validation en deux étapes : activation et clés de secours ---------- */
  async function chargerFacteurs() {
    const { data } = await client.auth.mfa.listFactors();
    facteurs = ((data && data.totp) || []).filter(f => f.status === "verified")
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }
  const estSecours = f => /^Clé de secours/.test(f.friendly_name || "");
  // Inscription d'une application d'authentification (Google Authenticator, Microsoft Authenticator…) par code QR.
  // Une « clé de secours » est un second facteur du même type : sa clé, recopiée sur papier ou scannée sur un
  // autre appareil, permet de se connecter si le téléphone habituel est perdu (Supabase n'a pas de codes de secours).
  async function activerDeuxEtapes(bouton, secours) {
    const zone = $("#adSecurite");
    bouton.disabled = true;
    // Une activation commencée puis abandonnée laisse un facteur non vérifié : on le retire avant d'en créer un autre
    const { data: l } = await client.auth.mfa.listFactors();
    for (const f of ((l && l.all) || []).filter(x => x.status !== "verified")) await client.auth.mfa.unenroll({ factorId: f.id });
    const nom = (secours ? "Clé de secours " : "Téléphone ") + new Date().toISOString().slice(0, 16).replace("T", " ");
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: nom, issuer: "Les Cours Sésame et SAJ" });
    if (error) { bouton.disabled = false; toast(messageErreur(error)); return; }
    zone.classList.add("ad-securite-ouverte");
    zone.innerHTML = secours ? `<form class="form ea-form" data-form="mfa" data-secours="1" data-facteur="${esc(data.id)}" novalidate>
        <h3 class="full">Créer une clé de secours</h3>
        <ol class="ad-mfa-etapes full">
          <li>Recopiez cette clé <b>sur papier</b>, lettre par lettre, et rangez-la en lieu sûr, loin du téléphone (par exemple avec vos papiers importants) :
            <code class="ad-mdp ad-cle">${esc(data.totp.secret)}</code>
            <small>Vous pouvez aussi scanner ce code avec un second appareil (tablette, ancien téléphone) qui ne reste pas avec le premier :</small>
            <img class="ad-qr" src="${esc(data.totp.qr_code)}" width="200" height="200" alt="Code QR de la clé de secours"></li>
          <li>Pour vérifier la clé, ajoutez-la maintenant dans une application d'authentification (« Saisir une clé », puis tapez-la), puis saisissez le code à 6 chiffres affiché. Vous pourrez ensuite la retirer de cette application si elle reste sur le même téléphone.</li>
          <li>Si votre téléphone est perdu : installez une application d'authentification sur le nouveau, choisissez « Saisir une clé », tapez la clé recopiée, puis connectez-vous avec le code affiché.</li>
        </ol>
        <p class="ea-aide full">Cette clé vaut un accès complet à l'administration avec votre mot de passe : ne la photographiez pas, ne l'envoyez à personne et ne la gardez pas dans le téléphone.</p>
        <div class="field"><label for="adMfaCode">Code à 6 chiffres</label><input id="adMfaCode" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        <p class="ea-msg" role="alert"></p>
        <button class="btn btn-navy" type="submit">Enregistrer la clé de secours</button>
        <button class="btn btn-ghost" type="button" data-action="secours-fermer">Annuler</button>
      </form>` : `<form class="form ea-form" data-form="mfa" data-facteur="${esc(data.id)}" novalidate>
        <h3 class="full">Activer la validation en deux étapes</h3>
        <ol class="ad-mfa-etapes full">
          <li>Installez sur votre téléphone <b>Google Authenticator</b> ou <b>Microsoft Authenticator</b> (gratuits, Play Store ou App Store).</li>
          <li>Dans l'application, touchez <b>+</b>, puis <b>Scanner un code QR</b>, et visez ce code :
            <img class="ad-qr" src="${esc(data.totp.qr_code)}" width="200" height="200" alt="Code QR à scanner avec l'application d'authentification">
            <small>Impossible de scanner ? Choisissez « Saisir une clé » et tapez : <code class="ad-mdp">${esc(data.totp.secret)}</code></small></li>
          <li>Saisissez ci-dessous le code à 6 chiffres que l'application affiche pour « Les Cours Sésame et SAJ ».</li>
        </ol>
        <div class="field"><label for="adMfaCode">Code à 6 chiffres</label><input id="adMfaCode" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        <p class="ea-msg" role="alert"></p>
        <button class="btn btn-navy" type="submit">Activer</button>
      </form>`;
    $("#adMfaCode").focus();
  }
  // Bandeau de l'administration une fois la validation activée : rappelle de créer une clé de secours
  function blocSecours() {
    const n = facteurs.filter(estSecours).length;
    return n ? `<div class="ad-securite ad-securite-ok" id="adSecurite">
        <div><b>Validation en deux étapes activée</b> · ${facteurs.length} ${facteurs.length > 1 ? "appareils ou clés enregistrés" : "appareil ou clé enregistré"}, dont ${n} ${n > 1 ? "clés" : "clé"} de secours.</div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="secours">Gérer</button>
      </div>` : `<div class="ad-securite" id="adSecurite">
        <div><b>Et si vous perdez votre téléphone ?</b> Sans lui, le code à 6 chiffres ne peut plus être affiché. Créez une clé de secours, à recopier sur papier : elle vous permettra de vous reconnecter depuis un nouveau téléphone.</div>
        <button class="btn btn-gold btn-sm" type="button" data-action="secours">Créer une clé de secours</button>
      </div>`;
  }
  function panneauSecours() {
    const zone = $("#adSecurite");
    zone.classList.add("ad-securite-ouverte");
    zone.innerHTML = `<h3>Appareils et clés de secours</h3>
      <p class="ea-aide">Chacun permet d'afficher le code à 6 chiffres demandé à la connexion. Si un téléphone est perdu, connectez-vous avec une clé de secours, puis retirez-le ici.</p>
      <ul class="ad-facteurs">${facteurs.map(f => `<li><span><b>${esc(f.friendly_name || "Application d'authentification")}</b><small>ajouté le ${dateFr(f.created_at)}</small></span>
        <button class="btn btn-ghost btn-sm" type="button" data-action="retirer-facteur" data-facteur="${esc(f.id)}"${facteurs.length < 2 ? " disabled title=\"Gardez au moins un appareil\"" : ""}>Retirer</button></li>`).join("")}</ul>
      <div class="ad-facteurs-actions">
        <button class="btn btn-gold btn-sm" type="button" data-action="cle-secours">Créer une clé de secours</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="secours-fermer">Fermer</button>
      </div>`;
  }

  /* ---------- Téléchargement des originaux (administrateur) ---------- */
  // Les fichiers du compartiment privé sont les originaux, sans filigrane : le nom de l'abonné n'est ajouté qu'à
  // l'affichage. La base n'en ouvre la lecture qu'à l'administrateur validé par le code (est_admin) et, pour les
  // seuls contenus publiés de leur formule, aux abonnés. Les fiches et QCM (texte) sont enregistrés en .txt.
  const nettoyerNom = t => String(t || "contenu").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "contenu";
  const extension = c => c.fichier ? (c.fichier.split(".").pop() || "pdf").toLowerCase() : "txt";
  const nomDeFichier = c => `${nettoyerNom(c.titre)}.${extension(c)}`;
  const telechargeable = c => !!c.fichier || c.type === "texte";
  // QCM rendu lisible (questions, propositions, bonne réponse, explication et référence)
  function texteDe(c) {
    const qcm = lireQcm(c);
    if (!qcm) return `${c.titre}\n\n${c.texte || ""}\n`;
    const L = "ABCDEFGH";
    return `${c.titre}\n${qcm.duree ? `Durée conseillée, ${qcm.duree} minutes\n` : ""}\n` + qcm.questions.map((q, i) =>
      `${i + 1}. ${q.q}\n${(q.options || []).map((o, j) => `   ${L[j]}. ${o}`).join("\n")}\n   Bonne réponse, ${L[q.bonne] || "?"}\n${q.explication ? `   Explication. ${q.explication}\n` : ""}${q.reference ? `   Référence. ${q.reference}\n` : ""}`).join("\n");
  }
  const enregistrer = (blob, nom) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };
  async function telechargerContenu(c, bouton) {
    if (!c.fichier) { enregistrer(new Blob([texteDe(c)], { type: "text/plain;charset=utf-8" }), nomDeFichier(c)); return; }
    bouton.disabled = true;
    const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, 120, { download: nomDeFichier(c) });
    bouton.disabled = false;
    if (error || !data) { toast(messageErreur(error || new Error("Fichier introuvable"))); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }
  // Extraction de pages : « 3-7, 12, 20-25 » donne un PDF des seules pages demandées, dans l'ordre saisi,
  // tirées du fichier d'origine (sans filigrane). La bibliothèque pdf-lib n'est chargée qu'à la première demande.
  function lirePages(texte, total) {
    const pages = [];
    for (const morceau of String(texte).split(/[,;\s]+/).filter(Boolean)) {
      const m = morceau.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error(`« ${morceau} » n'est pas une page ni un intervalle (exemple : 3-7, 12).`);
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (a < 1 || b < a || b > total) throw new Error(`Pages ${morceau} hors du document, qui compte ${total} pages.`);
      for (let n = a; n <= b; n++) pages.push(n);
    }
    if (!pages.length) throw new Error("Indiquez au moins une page.");
    return pages;
  }
  function formulairePages(c) {
    return `<form class="form ad-form" data-form="pages" novalidate>
        <div class="field full"><label>Pages à télécharger</label><input name="pages" placeholder="Exemple : 3-7, 12, 20-25" autocomplete="off" required></div>
        <small class="ad-note full">Pages du fichier PDF, séparées par des virgules ; un tiret pour un intervalle. Fichier d'origine, sans filigrane.</small>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold btn-sm" type="submit">Télécharger ces pages</button>
      </form>`;
  }
  async function telechargerPages(c, texte, f, msg, bouton) {
    bouton.disabled = true;
    msg.textContent = "Préparation du fichier…";
    try {
      await new Promise((ok, ko) => {
        if (window.PDFLib) return ok();
        const s = document.createElement("script");
        s.src = "../../assets/vendor/pdf-lib-1.17.1/pdf-lib.min.js"; s.onload = ok; s.onerror = () => ko(new Error("Chargement de l'outil PDF impossible."));
        document.head.appendChild(s);
      });
      const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, 300);
      if (error || !data) throw error || new Error("Fichier introuvable");
      const rep = await fetch(data.signedUrl);
      if (!rep.ok) throw new Error("Téléchargement impossible (" + rep.status + ").");
      const source = await PDFLib.PDFDocument.load(await rep.arrayBuffer(), { ignoreEncryption: true });
      const pages = lirePages(texte, source.getPageCount());
      const cible = await PDFLib.PDFDocument.create();
      (await cible.copyPages(source, pages.map(n => n - 1))).forEach(p => cible.addPage(p));
      cible.setTitle(`${c.titre} (pages ${texte.replace(/\s+/g, "")})`);
      const nom = `${nettoyerNom(c.titre)} (p. ${texte.replace(/\s+/g, "").replace(/,/g, ", ")}).pdf`;
      enregistrer(new Blob([await cible.save()], { type: "application/pdf" }), nom);
      msg.textContent = `${pages.length} page${pages.length > 1 ? "s" : ""} sur ${source.getPageCount()} téléchargée${pages.length > 1 ? "s" : ""}.`;
    } catch (e) {
      msg.textContent = e && e.message ? e.message : messageErreur(e);
    }
    bouton.disabled = false;
  }
  // Archive .zip sans compression (les PDF et vidéos sont déjà compressés), noms en UTF-8
  const TABLE_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = o => { let c = 0xffffffff; for (let i = 0; i < o.length; i++) c = TABLE_CRC[(c ^ o[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function archiveZip(fichiers) {
    const enc = new TextEncoder(), parts = [], centre = [], d = new Date();
    const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let pos = 0;
    for (const f of fichiers) {
      const nom = enc.encode(f.nom), crc = crc32(f.octets), n = f.octets.length;
      const loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint16(10, heure, true); loc.setUint16(12, jour, true); loc.setUint32(14, crc, true);
      loc.setUint32(18, n, true); loc.setUint32(22, n, true); loc.setUint16(26, nom.length, true);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(12, heure, true); cen.setUint16(14, jour, true); cen.setUint32(16, crc, true);
      cen.setUint32(20, n, true); cen.setUint32(24, n, true); cen.setUint16(28, nom.length, true); cen.setUint32(42, pos, true);
      parts.push(loc.buffer, nom, f.octets);
      centre.push(cen.buffer, nom);
      pos += 30 + nom.length + n;
    }
    const tailleCentre = centre.reduce((t, x) => t + x.byteLength, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentre, true); fin.setUint32(16, pos, true);
    return new Blob([...parts, ...centre, fin.buffer], { type: "application/zip" });
  }
  // Rangement dans l'archive : un dossier par famille (Ouvrage, Corrigé, Fiches, QCM…), d'après la matière
  const dossierDe = c => nettoyerNom((c.matiere || "").split("·")[0].trim() || (TYPES[c.type] || {}).nom || "Autres");
  async function telechargerTout(bouton) {
    const liste = contenus.filter(telechargeable);
    if (!liste.length) { toast("Aucun fichier à télécharger."); return; }
    if (!confirm(`Télécharger les ${liste.length} contenus en un seul fichier .zip ?\n\nIl s'agit des fichiers d'origine, sans filigrane. Gardez l'archive pour vous : elle contient vos ouvrages complets.`)) return;
    const libelle = bouton.textContent;
    bouton.disabled = true;
    telechargement = true;
    const fichiers = [], pris = new Set(), echecs = [], total = liste.length;
    let fait = 0;
    const majLibelle = () => { bouton.textContent = `Téléchargement… ${fait} / ${total}`; };
    const suivant = async () => {
      while (liste.length) {
        const c = liste.shift();
        try {
          let octets;
          if (c.fichier) {
            const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, 300);
            if (error || !data) throw error || new Error("introuvable");
            const rep = await fetch(data.signedUrl);
            if (!rep.ok) throw new Error("HTTP " + rep.status);
            octets = new Uint8Array(await rep.arrayBuffer());
          } else octets = new TextEncoder().encode(texteDe(c));
          let nom = `${dossierDe(c)}/${nomDeFichier(c)}`, k = 2;
          while (pris.has(nom.toLowerCase())) nom = `${dossierDe(c)}/${nettoyerNom(c.titre)} (${k++}).${extension(c)}`;
          pris.add(nom.toLowerCase());
          fichiers.push({ nom, octets });
        } catch (e) { echecs.push(c.titre); }
        fait++;
        majLibelle();
      }
    };
    majLibelle();
    await Promise.all([suivant(), suivant(), suivant()]);
    majLibelle();
    if (fichiers.length) enregistrer(archiveZip(fichiers), `Contenus exclusifs Cours Sesame ${auj()}.zip`);
    telechargement = false;
    bouton.textContent = libelle;
    bouton.disabled = false;
    toast(echecs.length ? `${fichiers.length} contenus téléchargés. Échec pour ${echecs.length} : ${echecs.slice(0, 3).join(", ")}${echecs.length > 3 ? "…" : ""}` : `${fichiers.length} contenus téléchargés.`);
  }

  /* ---------- Agent de révision : texte des contenus pour la recherche ---------- */
  // Le texte de chaque page des PDF est extrait ici, dans le navigateur de l'administrateur, puis enregistré dans la
  // table « passages », réservée à l'administrateur. Une page sans texte lisible (image scannée) est enregistrée
  // vide et le bilan la signale. Les fiches et QCM sont découpés en parties d'environ 3 000 caractères.
  const indexable = c => (c.type === "pdf" && !!c.fichier) || c.type === "texte";
  const nettoyerTexte = t => t.replace(/\u0000/g, "").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
  function decouper(texte, taille = 3000) {
    const parts = [];
    let cur = "";
    for (const para of texte.split(/\n{2,}/)) {
      if (cur && cur.length + para.length > taille) { parts.push(cur); cur = ""; }
      cur += (cur ? "\n\n" : "") + para;
    }
    if (cur) parts.push(cur);
    return parts.length ? parts : [""];
  }
  async function pagesDe(c, lib) {
    if (!c.fichier) return decouper(texteDe(c)).map(nettoyerTexte);
    const { data, error } = await client.storage.from("exclusif").createSignedUrl(c.fichier, 300);
    if (error || !data) throw error || new Error("introuvable");
    const rep = await fetch(data.signedUrl);
    if (!rep.ok) throw new Error("HTTP " + rep.status);
    const doc = await lib.getDocument({ data: new Uint8Array(await rep.arrayBuffer()), isEvalSupported: false, enableXfa: false }).promise;
    const pages = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const { items } = await page.getTextContent();
        pages.push(nettoyerTexte(items.map(i => (i.str || "") + (i.hasEOL ? "\n" : "")).join("")));
        page.cleanup();
      }
    } finally { doc.destroy(); }
    return pages;
  }
  const lireBilan = r => { bilanPassages = !r || r.error ? null : new Map((r.data || []).map(x => [x.contenu_id, x])); };
  async function indexerContenus(bouton) {
    const liste = contenus.filter(indexable);
    if (!liste.length) { toast("Aucun contenu à préparer."); return; }
    if (!confirm(`Préparer le texte des ${liste.length} contenus pour l'agent de révision ?\n\nLe texte de chaque page est extrait ici puis enregistré dans la base, où seul l'administrateur peut le lire. Comptez quelques minutes et gardez la page ouverte.`)) return;
    const libelle = bouton.textContent;
    bouton.disabled = true;
    telechargement = true;
    const echecs = [];
    try {
      const lib = await E.chargerPdfJs();
      for (const [k, c] of liste.entries()) {
        bouton.textContent = `Préparation… ${k + 1} / ${liste.length}`;
        try {
          const pages = await pagesDe(c, lib);
          const ancien = await client.from("passages").delete().eq("contenu_id", c.id);
          if (ancien.error) throw ancien.error;
          for (let i = 0; i < pages.length; i += 100) {
            const { error } = await client.from("passages").insert(pages.slice(i, i + 100).map((texte, j) => ({ contenu_id: c.id, page: i + j + 1, texte })));
            if (error) throw error;
          }
        } catch (e) { echecs.push(c.titre); }
      }
      // Fréquence des mots, qui sert à la recherche des passages par l'agent
      await client.rpc("admin_actualiser_lexiques");
      lireBilan(await client.rpc("admin_bilan_passages"));
    } catch (e) { echecs.push(messageErreur(e)); }
    telechargement = false;
    bouton.disabled = false;
    bouton.textContent = libelle;
    redessiner();
    toast(echecs.length ? `Texte préparé, sauf pour ${echecs.length} : ${echecs.slice(0, 3).join(", ")}${echecs.length > 3 ? "…" : ""}` : "Texte de tous les contenus préparé.");
  }
  function blocAgent() {
    const total = contenus.filter(indexable).length;
    if (!total) return "";
    let resume = "Pas encore préparé.";
    if (bilanPassages && bilanPassages.size) {
      const L = [...bilanPassages.values()], somme = k => L.reduce((t, x) => t + Number(x[k] || 0), 0);
      const nb = n => Number(n).toLocaleString("fr-FR");
      const scans = contenus.filter(c => { const x = bilanPassages.get(c.id); return x && x.pages_vides > 0; })
        .map(c => { const x = bilanPassages.get(c.id); return `${esc(c.titre)} (${x.pages_vides} sur ${x.pages})`; });
      resume = `${L.length} contenus sur ${total} préparés, ${nb(somme("pages"))} pages, ${nb(somme("caracteres"))} caractères.`
        + (scans.length ? `<br>Pages sans texte lisible (images scannées) : ${scans.join(", ")}.` : "");
    }
    return `<div class="ad-telecharger">
        <button class="btn btn-ghost btn-sm" type="button" data-action="indexer">Préparer le texte pour l'agent de révision</button>
        <small>${resume} À relancer après l'ajout ou le remplacement d'un fichier.</small>
      </div>`;
  }

  /* ---------- Affichage ---------- */
  function afficher() {
    const actifs = abonnes.filter(a => a.actif && !a.suspendu_depuis).length;
    const enligne = abonnes.filter(enLigne).length;
    const attente = abonnes.filter(a => statut(a).cle === "attente").length;
    const suspendus = abonnes.filter(a => a.suspendu_depuis).length;
    const bientot = abonnes.filter(a => statut(a).cle === "bientot").length;
    racine.innerHTML = `<div class="ea-compte">
        <span>Administration · <b>${esc(moi.email)}</b></span>
        <div class="ea-compte-actions"><a class="btn btn-ghost btn-sm" href="../">Voir l'espace abonnés</a><button class="btn btn-ghost btn-sm" type="button" data-action="sortir">Se déconnecter</button></div>
      </div>
      ${deuxEtapes ? blocSecours() : `<div class="ad-securite" id="adSecurite">
        <div><b>Protégez l'administration.</b> Activez la validation en deux étapes : à chaque connexion, en plus du mot de passe, un code à 6 chiffres affiché par une application sur votre téléphone sera demandé. Un mot de passe volé ne suffira plus.</div>
        <button class="btn btn-gold btn-sm" type="button" data-action="mfa">Activer</button>
      </div>`}
      <div class="ad-stats ad-stats-5">
        <div><b>${actifs}</b><span>Abonnements en cours</span></div>
        <div><b>${enligne}</b><span>En ligne maintenant</span></div>
        <div><b>${attente}</b><span>En attente d'activation</span></div>
        <div><b>${bientot}</b><span>Fin sous 7 jours${suspendus ? ` · ${pluriel(suspendus, "suspendu")}` : ""}</span></div>
        <div><b>${fcfa(encaisseCeMois())}</b><span>Encaissé ce mois-ci</span></div>
      </div>
      <div class="ea-onglets ad-onglets" role="tablist" aria-label="Administration">
        ${[["direct", "En direct"], ["visites", "Visites du site"], ["abonnes", `Abonnés (${abonnes.length})`], ["relances", `Relances${nbRelances() ? ` (${nbRelances()})` : ""}`], ["commandes", `Commandes${commandesATraiter() ? ` (${commandesATraiter()})` : ""}`], ["contenus", `Contenus (${contenus.length})`], ["paiements", "Paiements"], ["stats", "Statistiques"], ["agent", "Agent"], ["blancs", "Concours blancs"], ["telechargements", "Téléchargements"], ["emails", "E-mails"], ["journal", "Journal"]].map(([v, l]) => `<button type="button" role="tab" data-onglet="${v}" aria-selected="${onglet === v}">${l}</button>`).join("")}
      </div>
      <div id="adPanneau">${panneau()}</div>`;
    majIndicateur();
  }
  // Redessine la page (onglets compris) sans bouger la position de lecture
  const redessiner = () => { const y = scrollY; afficher(); scrollTo(0, y); };
  const PANNEAUX = { direct: () => panneauDirect(), visites: () => panneauVisites(), abonnes: () => panneauAbonnes(), relances: () => panneauRelances(), commandes: () => panneauCommandes(),
    contenus: () => panneauContenus(), paiements: () => panneauPaiements(), stats: () => panneauStats(), agent: () => panneauAgent(), blancs: () => panneauBlancs(), telechargements: () => panneauTelechargements(), emails: () => panneauEmails(), journal: () => panneauJournal() };
  const panneau = () => (PANNEAUX[onglet] || PANNEAUX.direct)();

  /* ---------- Visites du site public, actualisées toutes les 15 secondes ---------- */
  // Chaque page vue du site est enregistrée par assets/js/visite.js : identifiant anonyme propre au navigateur,
  // compte abonné si le visiteur est connecté, page, provenance et appareil (jamais l'adresse IP).
  const EN_VISITE_MS = 5 * 60 * 1000;
  const nomPage = pg => { const x = decodeURIComponent(pg || "/").replace(/^\/|\/$/g, ""); return x ? x.replace(/\//g, " › ").replace(/-/g, " ") : "Accueil"; };
  const visiteurCourt = v => String(v.visiteur || "").slice(0, 4).toUpperCase();
  const quiVisite = v => v.user_id
    ? `<b>${esc(`${v.prenom || ""} ${v.nom || ""}`.trim() || "Compte sans nom")}</b> <span class="ad-badge ad-${v.abonne ? "actif" : "attente"}">${v.abonne ? "Abonné" : "Compte sans abonnement"}</span>`
    : `<b>Visiteur ${esc(visiteurCourt(v))}</b> <span class="ad-badge ad-avenir">Non connecté</span>`;
  const FILTRES_V = [["tous", "Tous", () => true], ["abonnes", "Abonnés", v => v.user_id && v.abonne], ["comptes", "Comptes sans abonnement", v => v.user_id && !v.abonne], ["anonymes", "Non connectés", v => !v.user_id]];
  function panneauVisites() {
    const t = Date.now(), filtreF = (FILTRES_V.find(f => f[0] === filtreV) || FILTRES_V[0])[2];
    const derniers = new Map();
    visites.filter(v => t - new Date(v.quand) < EN_VISITE_MS).forEach(v => { if (!derniers.has(v.visiteur)) derniers.set(v.visiteur, v); });
    const maintenant = [...derniers.values()];
    const auj = new Date().toISOString().slice(0, 10);
    const jour = visitesJours.find(x => x.jour === auj) || { pages: 0, visiteurs: 0, comptes: 0 };
    const somme = (l, k) => l.reduce((n, x) => n + Number(x[k] || 0), 0);
    const sept = visitesJours.filter(x => t - new Date(x.jour + "T00:00:00Z") < 7 * 864e5);
    const max = Math.max(1, ...visitesJours.map(x => Number(x.visiteurs)));
    const liste = visites.filter(filtreF).slice(0, 300);
    return `<div class="ad-direct-tete">
        <p class="ad-direct-etat"><span class="ad-pastille ad-pastille-ok" aria-hidden="true"></span>Actualisation automatique toutes les 15 secondes.${derniereMaj ? ` Mise à jour à ${heure(derniereMaj)}.` : ""}</p>
        <button class="btn btn-ghost btn-sm" type="button" data-action="actualiser-visites">Actualiser</button>
      </div>
      <div class="ad-stats">
        <div><b>${maintenant.length}</b><span>Sur le site en ce moment (5 min)</span></div>
        <div><b>${Number(jour.visiteurs)}</b><span>Visiteurs aujourd'hui · ${pluriel(Number(jour.pages), "page")} vue${Number(jour.pages) > 1 ? "s" : ""}</span></div>
        <div><b>${Number(jour.comptes)}</b><span>Comptes connectés aujourd'hui</span></div>
        <div><b>${somme(sept, "visiteurs")}</b><span>Visiteurs sur 7 jours (cumul quotidien)</span></div>
      </div>
      <section class="ad-bloc">
        <h3>Sur le site en ce moment <span class="n">${maintenant.length}</span></h3>
        ${maintenant.length ? `<ul class="ad-enligne">${maintenant.map(v => `<li><span class="ad-point" aria-hidden="true"></span>${quiVisite(v)}<small>${esc(nomPage(v.page))} · ${ilYa(v.quand)}</small></li>`).join("")}</ul>`
          : `<p class="ea-vide">Personne sur le site depuis 5 minutes.</p>`}
      </section>
      <section class="ad-bloc">
        <h3>Dernières pages vues (48 heures)</h3>
        <div class="chips" role="group" aria-label="Filtrer les visites">${FILTRES_V.map(([v, l, f]) => `<button class="chip" type="button" data-filtrev="${v}" aria-pressed="${filtreV === v}">${l}<span class="n">${visites.filter(f).length}</span></button>`).join("")}</div>
        ${liste.length ? `<div class="ad-tableau" role="region" aria-label="Dernières pages vues" tabindex="0"><table>
          <thead><tr><th>Quand</th><th>Qui</th><th>Page</th><th>Provenance</th><th>Appareil</th></tr></thead>
          <tbody>${liste.map(v => `<tr><td>${heure(new Date(v.quand))}<small>${ilYa(v.quand)}</small></td><td>${quiVisite(v)}${v.telephone ? `<small><a href="https://wa.me/${numeroWa(v.telephone)}" target="_blank" rel="noopener">${esc(v.telephone)}</a></small>` : ""}</td><td>${esc(nomPage(v.page))}</td><td>${esc(v.provenance === "(site)" ? "page précédente du site" : v.provenance || "accès direct")}</td><td>${esc(v.appareil || "")}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="ea-vide">Aucune visite dans cette catégorie depuis 48 heures.</p>`}
        <p class="ad-note">Un visiteur non connecté est désigné par les quatre premiers caractères d'un identifiant anonyme propre à son navigateur : le même code d'une visite à l'autre signale le même navigateur. Son identité n'est pas connue. Un abonné est reconnu lorsqu'il est connecté à son compte.</p>
      </section>
      <section class="ad-bloc">
        <h3>Les 30 derniers jours</h3>
        ${visitesJours.length ? `<div class="ad-tableau" role="region" aria-label="Visites par jour" tabindex="0"><table>
          <thead><tr><th>Jour</th><th>Visiteurs</th><th>Pages vues</th><th>Comptes connectés</th><th><span class="sr-only">Graphique</span></th></tr></thead>
          <tbody>${visitesJours.map(x => `<tr><td>${dateFr(x.jour)}</td><td><b>${Number(x.visiteurs)}</b></td><td>${Number(x.pages)}</td><td>${Number(x.comptes)}</td><td><span class="ad-barre-v" style="width:${Math.round(100 * Number(x.visiteurs) / max)}%"></span></td></tr>`).join("")}</tbody></table></div>`
          : `<p class="ea-vide">Les visites s'afficheront ici dès les premières pages vues.</p>`}
      </section>`;
  }
  async function rafraichirVisites() {
    if (!moi || document.hidden || onglet !== "visites" || occupe()) return;
    const [vi, vj] = await Promise.all([client.rpc("admin_visites", { p_heures: 48 }), client.rpc("admin_visites_jours", { p_jours: 30 })]);
    if (vi.error || vj.error) return;
    visites = vi.data || []; visitesJours = vj.data || []; derniereMaj = new Date();
    const z = $("#adPanneau");
    if (z && onglet === "visites") { const y = scrollY; z.innerHTML = panneauVisites(); scrollTo(0, y); }
  }

  /* ---------- En direct : abonnements en cours, mis à jour automatiquement ---------- */
  function panneauDirect() {
    const enCoursListe = abonnes.filter(enCours).sort((x, y) => (x.fin < y.fin ? -1 : x.fin > y.fin ? 1 : 0));
    const connectes = abonnes.filter(enLigne).sort((x, y) => new Date(y.vu_le) - new Date(x.vu_le));
    const ligne = a => {
      const s = statut(a), p = periodeCourante(a), n = joursRestants(a);
      return `<tr data-uid="${esc(a.user_id)}">
          <td><b>${esc(a.prenom)} ${esc(a.nom)}</b>${enLigne(a) ? ` <span class="ad-point" title="En ligne">En ligne</span>` : ""}<small><a href="https://wa.me/${numeroWa(a.telephone)}" target="_blank" rel="noopener">${esc(a.telephone)}</a></small></td>
          <td>${p ? `du ${dateFr(p.debut)}<br>au ${dateFr(p.fin)}` : ""}${a.fin && p && a.fin !== p.fin ? `<small>prolongé jusqu'au ${dateFr(a.fin)}</small>` : ""}</td>
          <td><b>${pluriel(n, "jour")}</b>${a.suspendu_depuis ? "<small>en réserve</small>" : ""}</td>
          <td><span class="ad-badge ad-${s.cle}">${esc(s.texte)}</span></td>
          <td>${a.vu_le ? ilYa(a.vu_le) : a.derniere_connexion ? ilYa(a.derniere_connexion) : "jamais"}</td>
          <td class="ad-td-actions">${a.suspendu_depuis
            ? `<button class="btn btn-navy btn-sm" type="button" data-action="reactiver">Réactiver</button>`
            : `<button class="btn btn-ghost btn-sm" type="button" data-action="suspendre">Suspendre</button>`}
            <button class="btn btn-ghost btn-sm ad-danger" type="button" data-action="supprimer">Supprimer</button></td>
        </tr>`;
    };
    return `<div class="ad-direct-tete">
        <p class="ad-direct-etat" id="adDirect" aria-live="polite"></p>
        <button class="btn btn-ghost btn-sm" type="button" data-action="actualiser">Actualiser</button>
      </div>
      ${retourDirect ? `<div class="ad-direct-retour">${retourDirect}</div>` : ""}
      <section class="ad-bloc">
        <h3>En ligne maintenant <span class="n">${connectes.length}</span></h3>
        ${connectes.length ? `<ul class="ad-enligne">${connectes.map(a => `<li><span class="ad-point" aria-hidden="true"></span><b>${esc(a.prenom)} ${esc(a.nom)}</b><small>${ilYa(a.vu_le)}${a.suspendu_depuis ? " · suspendu" : a.actif ? "" : " · sans abonnement en cours"}</small></li>`).join("")}</ul>`
          : `<p class="ea-vide">Aucun abonné sur l'espace en ce moment.</p>`}
      </section>
      <section class="ad-bloc">
        <h3>Abonnements en cours <span class="n">${enCoursListe.length}</span></h3>
        ${enCoursListe.length ? `<div class="ad-tableau" role="region" aria-label="Abonnements en cours" tabindex="0"><table>
          <thead><tr><th>Abonné</th><th>Période en cours</th><th>Reste</th><th>État</th><th>Dernier passage</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${enCoursListe.map(ligne).join("")}</tbody></table></div>
          <p class="ad-note">Suspendre : l'accès est coupé tout de suite, les jours restants sont gardés et repartent à la réactivation. Supprimer : la période en cours disparaît de l'historique et des totaux (activation par erreur, paiement remboursé). Pour arrêter un abonnement en gardant le paiement, utilisez « Couper l'accès » dans l'onglet Abonnés.</p>`
          : `<p class="ea-vide">Aucun abonnement en cours. Activez un compte depuis l'onglet Abonnés après réception du paiement.</p>`}
      </section>`;
  }
  // Ligne d'état du suivi en direct, mise à jour sans redessiner la page
  function majIndicateur() {
    const el = $("#adDirect");
    if (!el) return;
    el.innerHTML = `<span class="ad-pastille${enDirect ? " ad-pastille-ok" : ""}" aria-hidden="true"></span>${enDirect ? "En direct : la liste se met à jour dès qu'un abonnement change." : "Actualisation automatique toutes les 30 secondes."}${derniereMaj ? ` Mise à jour à ${heure(derniereMaj)}.` : ""}${majEnAttente ? ` <button class="btn btn-gold btn-sm" type="button" data-action="actualiser">Nouveautés : afficher</button>` : ""}`;
  }

  function panneauAbonnes() {
    const liste = listeFiltree();
    return `<div class="ad-outils-ligne">
        <button class="btn btn-ghost btn-sm" type="button" data-action="copier-numeros">Copier les numéros (${liste.length})</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="exporter" data-quoi="abonnes">Exporter les abonnés (Excel)</button>
        ${filtre === "anciens" && liste.length ? `<button class="btn btn-ghost btn-sm ad-danger" type="button" data-action="supprimer-anciens">Supprimer ces ${liste.length} comptes</button>` : ""}
      </div>
      <div class="ad-outils">
        <label class="search"><span class="sr-only">Rechercher un abonné</span>${icone("i-search")}<input type="search" id="adRecherche" placeholder="Nom, numéro ou e-mail" value="${esc(recherche)}" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filtrer les abonnés">${FILTRES.map(([v, l, f]) => `<button class="chip" type="button" data-filtre="${v}" aria-pressed="${filtre === v}">${l}<span class="n">${abonnes.filter(f).length}</span></button>`).join("")}</div>
      </div>
      <div class="ad-liste">${liste.length ? liste.map(ligneAbonne).join("") : `<p class="ea-vide">Aucun compte ${abonnes.length ? "ne correspond." : "pour le moment. Les comptes créés sur l'espace abonnés apparaîtront ici."}</p>`}</div>`;
  }
  function listeFiltree() {
    const q = recherche.toLowerCase().replace(/\s+/g, "");
    const test = (FILTRES.find(f => f[0] === filtre) || FILTRES[0])[2];
    return abonnes.filter(test).filter(a => !q || `${a.prenom}${a.nom}${a.telephone}${a.email}`.toLowerCase().replace(/\s+/g, "").includes(q));
  }
  function ligneAbonne(a) {
    const s = statut(a);
    const retour = retours[a.user_id] || "";
    return `<article class="ad-ligne" data-uid="${esc(a.user_id)}">
        <div class="ad-ident">
          <div class="ad-nom"><b>${esc(a.prenom)} ${esc(a.nom)}</b><span class="ad-badge ad-${s.cle}">${esc(s.texte)}</span>${a.appareils >= SEUIL_PARTAGE ? `<span class="ad-badge ad-partage" title="Chaque nouvel appareil déconnecte le précédent. Un nombre élevé peut signaler un compte partagé.">${a.appareils} appareils en 7 jours</span>` : ""}</div>
          <small><a href="https://wa.me/${numeroWa(a.telephone)}" target="_blank" rel="noopener">${esc(a.telephone)}</a> · ${esc(a.email)}${a.concours ? " · " + esc(nomConcours(a.concours)) : ""} · inscrit le ${dateFr(a.inscrit_le)}${Number(a.nb_paiements) ? ` · ${a.nb_paiements} paiement${a.nb_paiements > 1 ? "s" : ""}, ${fcfa(a.total_paye)}` : ""} · ${enLigne(a) ? "<b class=\"ad-vert\">en ligne</b>" : `dernier passage : ${ilYa(a.vu_le || a.derniere_connexion)}`}${lecturesRecentes(l => l.user_id === a.user_id) ? ` · ${pluriel(lecturesRecentes(l => l.user_id === a.user_id), "ouverture")} en 30 jours` : ""}</small>
          ${notes.get(a.user_id) ? `<p class="ad-note-privee"><b>Note</b> ${esc(notes.get(a.user_id))}</p>` : ""}
        </div>
        <div class="ad-actions">
          ${a.suspendu_depuis
            ? `<button class="btn btn-navy btn-sm" type="button" data-action="reactiver">Réactiver</button>`
            : `<button class="btn btn-navy btn-sm" type="button" data-action="activer">${a.actif ? "Prolonger" : "Activer"}</button>`}
          ${a.actif && !a.suspendu_depuis ? `<button class="btn btn-ghost btn-sm" type="button" data-action="suspendre">Suspendre</button><button class="btn btn-ghost btn-sm" type="button" data-action="couper">Couper l'accès</button>` : ""}
          ${enCours(a) ? `<button class="btn btn-ghost btn-sm ad-danger" type="button" data-action="supprimer">Supprimer l'abonnement</button>` : ""}
          <a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), messageRelance(a))}" target="_blank" rel="noopener">${icone("i-wa")}${["attente", "bientot", "expire", "suspendu"].includes(s.cle) ? "Relancer" : "Écrire"}</a>
          <button class="btn btn-ghost btn-sm" type="button" data-action="mdp">Mot de passe</button>
          ${Number(a.nb_paiements) ? `<button class="btn btn-ghost btn-sm" type="button" data-action="historique">Historique</button>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" data-action="note">Note</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="deconnecter" title="Ferme sa session sur tous ses appareils">Déconnecter</button>
          ${!Number(a.nb_paiements) && !a.fin ? `<button class="btn btn-ghost btn-sm ad-danger" type="button" data-action="supprimer-compte">Supprimer le compte</button>` : ""}
        </div>
        <div class="ad-zone"${retour ? "" : " hidden"}>${retour}</div>
      </article>`;
  }
  function formulaireActivation(a) {
    const debut = a.actif ? lendemain(a.fin) : auj();
    return `<form class="form ad-form" data-form="activer" data-debut="${debut}" data-suite="${a.actif ? 1 : 0}" novalidate>
        <p class="ad-note full">${a.actif ? `La prolongation commence le ${dateFr(debut)}, à la suite de l'abonnement en cours.` : "L'abonnement commence aujourd'hui. Pour les formules en jours ou en semaines, le jour de l'activation est offert."} Les vidéos ne s'ouvrent qu'avec une période d'au moins 7 jours (formules d'une semaine et plus), les ouvrages complets qu'avec une période d'au moins 28 jours (formules d'un mois et plus).</p>
        <div class="field"><label>Durée</label><select name="duree">${DUREES.map(([v, l]) => `<option value="${v}"${v === "m1" ? " selected" : ""}>${l}${PRIX[v] ? ` · ${fcfa(+PRIX[v])}` : ""}</option>`).join("")}</select></div>
        <div class="field" data-jusqua hidden><label>Jusqu'au (inclus)</label><input type="date" name="jusqua" min="${debut}"></div>
        <div class="field"><label>Montant reçu (FCFA)</label><input type="number" name="montant" min="0" step="50" inputmode="numeric" value="${PRIX.m1 || ""}"></div>
        <div class="field"><label>Moyen de paiement</label><select name="moyen">${MOYENS.map(m => `<option>${m}</option>`).join("")}</select></div>
        <div class="field full"><label>Référence du paiement ou note (contrôlée contre les doublons)</label><input name="note" maxlength="300"></div>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold" type="submit">Valider ${a.actif ? "la prolongation" : "l'activation"}</button>
      </form>`;
  }
  function historique(uid) {
    const p = paiements.filter(x => x.user_id === uid);
    return `<ul class="ad-histo">${p.map(x => `<li><b>${x.montant != null ? fcfa(x.montant) : "Sans montant"}</b> · du ${dateFr(x.debut)} au ${dateFr(x.fin)}${x.moyen ? " · " + esc(x.moyen) : ""}<small>Enregistré le ${dateFr(x.cree_le)}${x.note ? " · " + esc(x.note) : ""}</small>
        <button class="btn btn-ghost btn-sm ad-danger" type="button" data-action="supprimer-periode" data-pid="${x.id}">Supprimer cette période</button></li>`).join("")}</ul>`;
  }

  function panneauContenus() {
    const coches = CONC.map(c => `<label><input type="checkbox" name="concours" value="${c.id}"> ${esc(c.court)}</label>`).join("");
    const nbTele = contenus.filter(telechargeable).length;
    return `${nbTele ? `<div class="ad-telecharger">
        <button class="btn btn-navy btn-sm" type="button" data-action="tout-telecharger">Télécharger tous les contenus (.zip)</button>
        <small>${nbTele} contenus, fichiers d'origine sans filigrane. Réservé à l'administrateur.</small>
      </div>` : ""}
      <details class="ad-ajout"${contenus.length ? "" : " open"}>
        <summary>Ajouter un contenu exclusif</summary>
        <form class="form ad-form" id="adNouveau" novalidate>
          <div class="field full"><label for="nTitre">Titre</label><input id="nTitre" name="titre" maxlength="160" required></div>
          <div class="field"><label for="nType">Type</label><select id="nType" name="type"><option value="video">Vidéo (MP4)</option><option value="pdf">Document PDF</option><option value="texte">Fiche (texte)</option><option value="lien">Lien (classe en direct, groupe…)</option></select></div>
          <div class="field"><label for="nMatiere">Matière</label><input id="nMatiere" name="matiere" list="adMatieres" maxlength="80"><datalist id="adMatieres">${MATIERES.map(m => `<option value="${esc(m)}">`).join("")}</datalist></div>
          <div class="field full" data-pour="video pdf"><label for="nFichier">Fichier</label><input id="nFichier" type="file" name="fichier" accept="video/mp4,video/webm,application/pdf"><small class="ad-note">50 Mo au plus. Vidéos au format MP4 : pour une vidéo plus lourde, demandez-nous de la compresser.</small></div>
          <div class="field full" data-pour="texte" hidden><label for="nTexte">Texte de la fiche</label><textarea id="nTexte" name="texte" rows="10" maxlength="60000"></textarea><small class="ad-note">Une ligne vide entre deux paragraphes. « ## » en début de ligne pour un intertitre, **mots** pour du gras.</small></div>
          <div class="field full" data-pour="lien" hidden><label for="nLien">Adresse du lien</label><input id="nLien" name="lien" type="url" placeholder="https://"></div>
          <div class="field full"><label for="nDesc">Présentation (facultatif)</label><textarea id="nDesc" name="description" maxlength="600"></textarea></div>
          <fieldset class="full ad-concours"><legend>Concours concernés</legend>${coches}</fieldset>
          <label class="ea-accord full"><input type="checkbox" name="publie" checked><span>Publier (sinon, le contenu reste en brouillon, invisible des abonnés)</span></label>
          <div class="field"><label for="nPubLe">Mettre en ligne le (facultatif)</label><input id="nPubLe" type="datetime-local" name="publie_le"><small class="ad-note">Vide : tout de suite. Sinon, le contenu apparaît seul à cette date et à cette heure.</small></div>
          <p class="ea-msg full" role="alert"></p>
          <button class="btn btn-gold" type="submit">Ajouter le contenu</button>
        </form>
      </details>
      <div id="adZoneC" class="ad-zone-c">${zoneContenus()}</div>
      ${blocAgent()}
      ${blocAnnonces()}`;
  }
  function ligneContenu(c) {
    const retour = retours["c" + c.id] || "";
    return `<article class="ad-ligne" data-cid="${c.id}">
        <div class="ad-ident">
          <div class="ad-nom"><b>${esc(c.titre)}</b>${programme(c) ? `<span class="ad-badge ad-avenir">Programmé le ${dateHeure(c.publie_le)}</span>` : `<span class="ad-badge ${c.publie ? "ad-actif" : "ad-attente"}">${c.publie ? "Publié" : "Brouillon"}</span>`}</div>
          <small>${TYPES[c.type].nom}${c.matiere ? " · " + esc(c.matiere) : ""}${(c.concours || []).length ? " · " + c.concours.map(nomConcours).join(", ") : ""} · ${dateFr(c.publie_le)} · ${pluriel(lecturesRecentes(l => l.contenu_id === c.id), "ouverture")} en 30 jours</small>
        </div>
        <div class="ad-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-caction="voir">Aperçu</button>
          ${telechargeable(c) ? `<button class="btn btn-ghost btn-sm" type="button" data-caction="telecharger" title="Fichier d'origine, sans filigrane">Télécharger</button>` : ""}
          ${c.type === "pdf" && c.fichier ? `<button class="btn btn-ghost btn-sm" type="button" data-caction="pages" title="Extraire certaines pages, sans filigrane">Pages…</button>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" data-caction="lecteurs">Lecteurs</button>
          <button class="btn ${c.publie ? "btn-ghost" : "btn-navy"} btn-sm" type="button" data-caction="publier">${c.publie ? "Retirer" : "Publier"}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-caction="modifier">Modifier</button>
          <button class="btn btn-ghost btn-sm ad-danger" type="button" data-caction="supprimer">Supprimer</button>
        </div>
        <div class="ad-zone"${retour ? "" : " hidden"}>${retour}</div>
      </article>`;
  }
  function formulaireModification(c) {
    const coches = CONC.map(x => `<label><input type="checkbox" name="concours" value="${x.id}"${(c.concours || []).includes(x.id) ? " checked" : ""}> ${esc(x.court)}</label>`).join("");
    return `<form class="form ad-form" data-form="modifier" novalidate>
        <div class="field full"><label>Titre</label><input name="titre" maxlength="160" value="${esc(c.titre)}" required></div>
        <div class="field full"><label>Matière</label><input name="matiere" list="adMatieres" maxlength="80" value="${esc(c.matiere || "")}"></div>
        ${c.type === "texte" ? `<div class="field full"><label>Texte de la fiche</label><textarea name="texte" rows="10" maxlength="60000">${esc(c.texte)}</textarea></div>` : ""}
        ${c.type === "lien" ? `<div class="field full"><label>Adresse du lien</label><input name="lien" type="url" value="${esc(c.lien)}"></div>` : ""}
        <div class="field full"><label>Présentation</label><textarea name="description" maxlength="600">${esc(c.description || "")}</textarea></div>
        <div class="field"><label>Mis en ligne le</label><input type="datetime-local" name="publie_le" value="${versLocal(c.publie_le)}"><small class="ad-note">Une date future programme la mise en ligne.</small></div>
        <fieldset class="full ad-concours"><legend>Concours concernés</legend>${coches}</fieldset>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold" type="submit">Enregistrer</button>
      </form>`;
  }

  function panneauPaiements() {
    const total = paiements.reduce((s, p) => s + (p.montant || 0), 0);
    const doubles = refsEnDouble();
    const nbDoubles = [...doubles.values()].filter(n => n > 1).length;
    return `<div class="ad-stats ad-stats-2"><div><b>${fcfa(encaisseCeMois())}</b><span>Ce mois-ci</span></div><div><b>${fcfa(total)}</b><span>Depuis l'ouverture</span></div></div>
      ${nbDoubles ? `<p class="ad-alerte"><b>${pluriel(nbDoubles, "référence")} de paiement ${nbDoubles > 1 ? "servent" : "sert"} plusieurs fois.</b> Vérifiez les lignes marquées « En double » : une référence Mobile Money ne correspond qu'à un paiement.</p>` : ""}
      <div class="ad-outils-ligne"><button class="btn btn-ghost btn-sm" type="button" data-action="exporter" data-quoi="paiements">Exporter les paiements (Excel)</button></div>
      ${paiements.length ? `<div class="ad-tableau" role="region" aria-label="Paiements" tabindex="0"><table>
        <thead><tr><th>Enregistré le</th><th>Abonné</th><th>Période</th><th>Montant</th><th>Moyen</th><th>Note</th></tr></thead>
        <tbody>${paiements.map(p => `<tr><td>${dateFr(p.cree_le)}</td><td>${esc(p.prenom)} ${esc(p.nom)}</td><td>du ${dateFr(p.debut)} au ${dateFr(p.fin)}</td><td>${p.montant != null ? fcfa(p.montant) : ""}</td><td>${esc(p.moyen || "")}</td><td>${esc(p.note || "")}${(doubles.get(normRef(p.note)) || 0) > 1 ? ` <span class="ad-badge ad-partage">En double</span>` : ""}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="ea-vide">Aucun paiement enregistré pour le moment.</p>`}`;
  }

  /* ---------- Outils : petites aides ---------- */
  const dateHeure = t => new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const versLocal = t => { if (!t) return ""; const x = new Date(t); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const programme = c => c.publie && new Date(c.publie_le) > new Date();
  const il30j = Date.now() - 30 * 864e5;
  const lecturesRecentes = test => lectures.filter(l => new Date(l.ouvert_le) >= il30j && test(l)).length;
  const nomAbonne = uid => { const a = abonnes.find(x => x.user_id === uid); return a ? `${a.prenom} ${a.nom}` : "Compte supprimé"; };
  // Références de paiement : comparées sans espaces, tirets ni casse ; trop courtes (moins de 5 signes), ignorées
  const normRef = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const paiementsMemeReference = t => { const k = normRef(t); return k.length >= 5 ? paiements.filter(p => normRef(p.note) === k) : []; };
  const refsEnDouble = () => { const m = new Map(); paiements.forEach(p => { const k = normRef(p.note); if (k.length >= 5) m.set(k, (m.get(k) || 0) + 1); }); return m; };

  /* ---------- Exports Excel (CSV, séparateur point-virgule, accents conservés) ---------- */
  const csv = (entetes, lignes) => "﻿" + [entetes, ...lignes].map(l => l.map(x => {
    const t = x == null ? "" : String(x);
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }).join(";")).join("\r\n");
  function exporter(quoi) {
    let nom, entetes, lignes;
    if (quoi === "abonnes") {
      nom = "Abonnés"; entetes = ["Prénom", "Nom", "Téléphone", "E-mail", "Concours", "Inscrit le", "État", "Accès jusqu'au", "Paiements", "Total payé (F CFA)", "Note privée"];
      lignes = abonnes.map(a => [a.prenom, a.nom, a.telephone, a.email, a.concours ? nomConcours(a.concours) : "", dateFr(a.inscrit_le), statut(a).texte, a.fin ? dateFr(a.fin) : "", a.nb_paiements, a.total_paye, notes.get(a.user_id) || ""]);
    } else if (quoi === "paiements") {
      nom = "Paiements"; entetes = ["Enregistré le", "Prénom", "Nom", "Début", "Fin", "Montant (F CFA)", "Moyen", "Référence ou note"];
      lignes = paiements.map(p => [dateFr(p.cree_le), p.prenom, p.nom, dateFr(p.debut), dateFr(p.fin), p.montant, p.moyen || "", p.note || ""]);
    } else {
      nom = "Commandes"; entetes = ["Date", "Client", "Téléphone", "Ville", "Ouvrages", "Montant (F CFA)", "Moyen", "État", "Note"];
      lignes = commandes.map(k => [dateFr(k.cree_le), k.client, k.telephone || "", k.ville || "", (k.lignes || []).map(l => `${l.qte} x ${l.ouvrage}`).join(" | "), k.montant, k.moyen || "", libelleStatut(k.statut), k.note || ""]);
    }
    enregistrer(new Blob([csv(entetes, lignes)], { type: "text/csv;charset=utf-8" }), `${nom} ${auj()}.csv`);
  }
  // Numéros au format international, un par ligne, pour une liste de diffusion WhatsApp
  async function copierNumeros() {
    const liste = listeFiltree();
    const texte = [...new Set(liste.map(a => "+" + numeroWa(a.telephone)))].join("\n");
    try { await navigator.clipboard.writeText(texte); toast(`${pluriel(liste.length, "numéro")} copiés. Collez-les dans une liste de diffusion WhatsApp.`); }
    catch (e) { prompt("Copiez les numéros :", texte.replace(/\n/g, " ")); }
  }
  async function supprimerAnciens(bouton) {
    const liste = listeFiltree().filter(jamaisActive);
    if (!liste.length || !confirm(`Supprimer définitivement ${pluriel(liste.length, "compte")} jamais activés depuis plus de 30 jours ?\n\nAucun n'a eu d'abonnement. Cette action ne peut pas être annulée.`)) return;
    bouton.disabled = true;
    let ok = 0;
    for (const a of liste) { const { error } = await client.rpc("admin_supprimer_compte", { p_user: a.user_id }); if (!error) ok++; }
    recharger(`${pluriel(ok, "compte")} supprimés.`);
  }

  /* ---------- Notes privées ---------- */
  const formulaireNote = a => `<form class="form ad-form" data-form="note" novalidate>
      <div class="field full"><label>Note privée sur ${esc(a.prenom)} ${esc(a.nom)} (jamais visible par l'abonné)</label><textarea name="note" maxlength="1000" rows="3">${esc(notes.get(a.user_id) || "")}</textarea></div>
      <p class="ea-msg full" role="alert"></p>
      <button class="btn btn-gold" type="submit">Enregistrer</button>
    </form>`;

  /* ---------- Relances ---------- */
  // « Fait » est mémorisé sur cet appareil (pratique, sans enjeu) : la ligne passe en fin de liste pendant 3 jours
  const CLE_RELANCES = "ad-relances";
  const lireRelances = () => { try { return JSON.parse(localStorage.getItem(CLE_RELANCES) || "{}"); } catch (e) { return {}; } };
  const marquerRelance = uid => { const m = lireRelances(); m[uid] = auj(); try { localStorage.setItem(CLE_RELANCES, JSON.stringify(m)); } catch (e) { /* stockage indisponible */ } };
  const relanceRecente = (uid, m) => !!m[uid] && joursJusqua(m[uid]) >= -3;
  const groupesRelance = () => [
    ["Fin dans les 7 jours", abonnes.filter(a => statut(a).cle === "bientot")],
    [`En cours, sans passage depuis ${JOURS_INACTIF} jours ou plus`, abonnes.filter(a => statut(a).cle === "actif" && inactif(a))],
    ["Terminés depuis moins de 30 jours", abonnes.filter(a => statut(a).cle === "expire" && joursJusqua(a.fin) >= -30)],
    ["Inscrits sans abonnement", abonnes.filter(a => statut(a).cle === "attente" && !jamaisActive(a))]
  ];
  const nbRelances = () => { const m = lireRelances(); return groupesRelance().reduce((n, g) => n + g[1].filter(a => !relanceRecente(a.user_id, m)).length, 0); };
  function panneauRelances() {
    const m = lireRelances();
    return `<p class="ad-note">Chaque bouton ouvre WhatsApp avec le message prêt. La ligne est marquée relancée et passe en fin de liste pendant 3 jours (mémorisé sur cet appareil).</p>` +
      groupesRelance().map(([titre, liste]) => {
        const tri = [...liste].sort((x, y) => relanceRecente(x.user_id, m) - relanceRecente(y.user_id, m));
        return `<section class="ad-bloc"><h3>${titre} <span class="n">${liste.length}</span></h3>${tri.length ? `<ul class="ad-relances">${tri.map(a => {
          const fait = relanceRecente(a.user_id, m);
          return `<li data-uid="${esc(a.user_id)}"${fait ? ` class="ad-relance-faite"` : ""}>
            <span><b>${esc(a.prenom)} ${esc(a.nom)}</b><small>${esc(a.telephone)} · ${esc(statut(a).texte)}${fait ? ` · relancé le ${dateFr(m[a.user_id])}` : ""}</small></span>
            <span class="ad-relance-actions"><a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), messageRelance(a))}" target="_blank" rel="noopener" data-relance="${esc(a.user_id)}">${icone("i-wa")}Relancer</a>
            ${fait ? "" : `<button class="btn btn-ghost btn-sm" type="button" data-action="relance-faite">Déjà fait</button>`}</span></li>`;
        }).join("")}</ul>` : `<p class="ea-vide">Personne à relancer.</p>`}</section>`;
      }).join("");
  }

  /* ---------- Commandes d'ouvrages papier ---------- */
  const STATUTS_CMD = [["nouvelle", "Nouvelle"], ["payee", "Payée"], ["expediee", "Expédiée"], ["livree", "Livrée"], ["annulee", "Annulée"]];
  const libelleStatut = s => (STATUTS_CMD.find(x => x[0] === s) || ["", s])[1];
  const commandesATraiter = () => commandes.filter(k => k.statut === "nouvelle" || k.statut === "payee").length;
  const catalogue = () => (typeof OUVRAGES !== "undefined" ? OUVRAGES : []).map(o => ({ titre: o.titre, prix: Number(String(o.prix || "").replace(/\D/g, "")) || 0 }));
  const ligneCmdHTML = () => `<div class="ad-cmd-ligne"><select name="ouvrage" aria-label="Ouvrage"><option value="">Choisir un ouvrage…</option>${catalogue().map(o => `<option value="${esc(o.titre)}" data-prix="${o.prix}">${esc(o.titre)} · ${fcfa(o.prix)}</option>`).join("")}</select><input name="qte" type="number" min="1" max="99" value="1" inputmode="numeric" aria-label="Quantité"></div>`;
  // Remise du site : 10 % dès 3 ouvrages commandés
  function totalCommande(f) {
    const lignes = $$(".ad-cmd-ligne", f).map(l => {
      const s = $("select", l), o = s.selectedOptions[0];
      return s.value ? { ouvrage: s.value, prix: Number(o.dataset.prix) || 0, qte: Math.max(1, Math.round(Number($("input", l).value) || 1)) } : null;
    }).filter(Boolean);
    const nb = lignes.reduce((n, l) => n + l.qte, 0), brut = lignes.reduce((t, l) => t + l.prix * l.qte, 0);
    const remise = nb >= 3 ? Math.round(brut * 0.1) : 0;
    return { lignes, nb, brut, remise, total: brut - remise };
  }
  function majTotalCommande(f) {
    const t = totalCommande(f);
    $("#adCmdTotal").textContent = t.lignes.length ? `${pluriel(t.nb, "ouvrage")} · ${fcfa(t.brut)}${t.remise ? ` · remise de 10 % : ${fcfa(t.remise)}` : ""} · total ${fcfa(t.total)}` : "";
    if (!f.elements.montant.dataset.manuel) f.elements.montant.value = t.lignes.length ? t.total : "";
  }
  function messageCommande(k) {
    const liste = (k.lignes || []).map(l => `• ${l.qte} x ${l.ouvrage}`).join("\n");
    const debut = `Bonjour ${k.client},\n\n`;
    if (k.statut === "payee") return `${debut}Nous avons bien reçu votre paiement de ${fcfa(k.montant)} pour :\n${liste}\n\nVotre commande est en préparation. Merci !`;
    if (k.statut === "expediee") return `${debut}Votre commande a été expédiée :\n${liste}\n\nBonne préparation !`;
    if (k.statut === "livree") return `${debut}Votre commande vous a été remise. Merci de votre confiance et bonne préparation !`;
    return `${debut}Nous avons bien noté votre commande :\n${liste}\n\nMontant : ${fcfa(k.montant)}. Vous pouvez régler par Orange Money, MTN MoMo, Wave ou Moov Money, puis nous envoyer la référence du paiement.`;
  }
  function panneauCommandes() {
    const valides = commandes.filter(k => k.statut !== "annulee");
    const encaisse = valides.filter(k => k.statut !== "nouvelle" && k.cree_le.slice(0, 7) === moisCourant).reduce((t, k) => t + k.montant, 0);
    return `<div class="ad-stats ad-stats-3"><div><b>${commandesATraiter()}</b><span>À traiter (nouvelles ou payées)</span></div><div><b>${fcfa(encaisse)}</b><span>Encaissé ce mois-ci</span></div><div><b>${valides.length}</b><span>Commandes enregistrées</span></div></div>
      <div class="ad-outils-ligne"><button class="btn btn-ghost btn-sm" type="button" data-action="exporter" data-quoi="commandes">Exporter les commandes (Excel)</button></div>
      <details class="ad-ajout"${commandes.length ? "" : " open"}>
        <summary>Enregistrer une commande</summary>
        <form class="form ad-form" id="adCommande" novalidate>
          <div class="field"><label for="kClient">Client</label><input id="kClient" name="client" maxlength="120" required></div>
          <div class="field"><label for="kTel">Téléphone</label><input id="kTel" name="telephone" type="tel" maxlength="30" inputmode="tel"></div>
          <div class="field"><label for="kVille">Ville</label><input id="kVille" name="ville" maxlength="80" placeholder="Abidjan"></div>
          <div class="field full"><label>Ouvrages</label><div class="ad-cmd-lignes" id="adCmdLignes">${ligneCmdHTML()}</div>
            <button class="btn btn-ghost btn-sm" type="button" data-action="cmd-ligne">Ajouter un autre ouvrage</button></div>
          <p class="ad-note full" id="adCmdTotal" aria-live="polite"></p>
          <div class="field"><label for="kMontant">Montant (F CFA)</label><input id="kMontant" name="montant" type="number" min="0" step="50" inputmode="numeric"></div>
          <div class="field"><label for="kMoyen">Moyen de paiement</label><select id="kMoyen" name="moyen"><option value="">Pas encore payé</option>${MOYENS.map(m => `<option>${m}</option>`).join("")}</select></div>
          <div class="field"><label for="kStatut">État</label><select id="kStatut" name="statut">${STATUTS_CMD.slice(0, 4).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
          <div class="field full"><label for="kNote">Note (adresse de livraison, référence du paiement…)</label><input id="kNote" name="note" maxlength="500"></div>
          <p class="ea-msg full" role="alert"></p>
          <button class="btn btn-gold" type="submit">Enregistrer la commande</button>
        </form>
      </details>
      <div class="ad-liste">${commandes.length ? commandes.map(ligneCommande).join("") : `<p class="ea-vide">Aucune commande enregistrée pour le moment.</p>`}</div>`;
  }
  const CLASSE_STATUT = { nouvelle: "ad-attente", payee: "ad-bientot", expediee: "ad-avenir", livree: "ad-actif", annulee: "ad-expire" };
  const ligneCommande = k => `<article class="ad-ligne" data-kid="${k.id}">
      <div class="ad-ident">
        <div class="ad-nom"><b>${esc(k.client)}</b><span class="ad-badge ${CLASSE_STATUT[k.statut] || ""}">${libelleStatut(k.statut)}</span><b>${fcfa(k.montant)}</b></div>
        <small>${dateHeure(k.cree_le)}${k.ville ? " · " + esc(k.ville) : ""}${k.telephone ? ` · <a href="https://wa.me/${numeroWa(k.telephone)}" target="_blank" rel="noopener">${esc(k.telephone)}</a>` : ""}${k.moyen ? " · " + esc(k.moyen) : ""}</small>
        <ul class="ad-cmd-detail">${(k.lignes || []).map(l => `<li>${l.qte} x ${esc(l.ouvrage)} <small>${fcfa(l.prix)}</small></li>`).join("")}</ul>
        ${k.note ? `<p class="ad-note-privee">${esc(k.note)}</p>` : ""}
      </div>
      <div class="ad-actions">
        <label class="ad-statut-cmd"><span class="sr-only">État de la commande</span><select data-kstatut="${k.id}">${STATUTS_CMD.map(([v, l]) => `<option value="${v}"${v === k.statut ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        ${k.telephone ? `<a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(k.telephone), messageCommande(k))}" target="_blank" rel="noopener">${icone("i-wa")}Écrire</a>` : ""}
        <button class="btn btn-ghost btn-sm ad-danger" type="button" data-kaction="supprimer">Supprimer</button>
      </div>
    </article>`;

  /* ---------- Lectures ---------- */
  function lecteursHTML(c) {
    const parCompte = new Map();
    lectures.filter(l => l.contenu_id === c.id).forEach(l => {
      const x = parCompte.get(l.user_id) || { n: 0, der: l.ouvert_le };
      x.n++; if (l.ouvert_le > x.der) x.der = l.ouvert_le;
      parCompte.set(l.user_id, x);
    });
    const liste = [...parCompte].sort((a, b) => b[1].der.localeCompare(a[1].der));
    return liste.length ? `<ul class="ad-histo">${liste.map(([uid, x]) => `<li><b>${esc(nomAbonne(uid))}</b> · ${pluriel(x.n, "ouverture")}<small>dernière le ${dateHeure(x.der)}</small></li>`).join("")}</ul><p class="ad-note">Ouvertures des 90 derniers jours (une au plus toutes les 10 minutes par abonné).</p>`
      : `<p class="ea-vide">Aucune ouverture ces 90 derniers jours.</p>`;
  }

  /* ---------- Annonces ---------- */
  const annonceVisible = an => an.active && an.debut <= auj() && (!an.fin || auj() <= an.fin);
  function blocAnnonces() {
    const visibles = annonces.filter(annonceVisible).length;
    return `<details class="ad-ajout ad-annonces">
        <summary>Annonces aux abonnés${visibles ? ` (${visibles} en ligne)` : ""}</summary>
        <div class="ad-annonces-corps">
          ${annonces.length ? `<ul class="ad-facteurs">${annonces.map(an => `<li><span><b>${esc(an.texte)}</b><small>${annonceVisible(an) ? "En ligne" : an.active ? "Programmée ou terminée" : "Masquée"} · du ${dateFr(an.debut)}${an.fin ? ` au ${dateFr(an.fin)}` : ", sans fin"}${an.lien ? " · avec un lien" : ""}</small></span>
            <span><button class="btn btn-ghost btn-sm" type="button" data-action="annonce-basculer" data-aid="${an.id}">${an.active ? "Masquer" : "Afficher"}</button>
            <button class="btn btn-ghost btn-sm ad-danger" type="button" data-action="annonce-supprimer" data-aid="${an.id}">Supprimer</button></span></li>`).join("")}</ul>` : ""}
          <form class="form ad-form" id="adAnnonce" novalidate>
            <div class="field full"><label for="anTexte">Nouvelle annonce (affichée en haut de l'espace abonnés)</label><textarea id="anTexte" name="texte" maxlength="400" rows="2" placeholder="Exemple : nouveaux corrigés INFJ en ligne cette semaine."></textarea></div>
            <div class="field full"><label for="anLien">Lien (facultatif)</label><input id="anLien" name="lien" type="url" placeholder="https://"></div>
            <div class="field"><label for="anDebut">Du</label><input id="anDebut" name="debut" type="date" value="${auj()}"></div>
            <div class="field"><label for="anFin">Au (facultatif)</label><input id="anFin" name="fin" type="date"></div>
            <p class="ea-msg full" role="alert"></p>
            <button class="btn btn-gold" type="submit">Publier l'annonce</button>
          </form>
        </div>
      </details>`;
  }

  /* ---------- Statistiques ---------- */
  const FORMULES = [[2, "1 jour"], [8, "1 semaine"], [15, "2 semaines"], [32, "1 mois"], [62, "2 mois"], [93, "3 mois"], [186, "6 mois"], [Infinity, "12 mois"]];
  const formuleDe = p => { const n = Math.round((new Date(p.fin) - new Date(p.debut)) / 864e5) + 1; return FORMULES.find(f => n <= f[0])[1]; };
  function barres(titre, lignes, format = fcfa) {
    const max = Math.max(1, ...lignes.map(l => l[1]));
    return `<section class="ad-bloc"><h3>${titre}</h3>${lignes.length ? `<ul class="ad-barres">${lignes.map(([nom, val, plus]) => `<li><span class="ad-barre-nom">${esc(nom)}</span><span class="ad-barre"><i style="width:${Math.max(val ? 2 : 0, Math.round(val / max * 100))}%"></i></span><span class="ad-barre-val">${format(val)}${plus ? ` <small>${plus}</small>` : ""}</span></li>`).join("")}</ul>` : `<p class="ea-vide">Pas encore de données.</p>`}</section>`;
  }
  const regrouper = (liste, cle, valeur) => { const m = new Map(); liste.forEach(x => { const k = cle(x); const v = m.get(k) || [0, 0]; v[0] += valeur(x); v[1]++; m.set(k, v); }); return [...m].sort((a, b) => b[1][0] - a[1][0]); };
  /* ---------- Concours blancs ---------- */
  // Épreuves à date et heure fixes : le sujet n'est visible des abonnés qu'à l'heure du début. Une épreuve publiée et
  // commencée ne se modifie plus (les copies portent sur ce sujet).
  function panneauBlancs() {
    const maintenant = Date.now();
    const etatB = b => { const d = new Date(b.debut), f = d.getTime() + b.duree_minutes * 60000; return !b.publie ? "Brouillon" : maintenant < d ? "Publiée, à venir" : maintenant <= f ? "En cours" : "Terminée"; };
    const liste = blancs.length ? `<ul class="ad-facteurs">${blancs.map(b => `<li><span><b>${esc(b.titre)}</b><small>${etatB(b)} · ${EXERCICES_AGENT[b.exercice] || b.exercice}${b.matiere ? ", " + esc(b.matiere) : ""} · ${dateHeure(b.debut)}, ${b.duree_minutes} min · ${pluriel(b.copies, "copie")}, ${b.rendues} rendue${b.rendues > 1 ? "s" : ""}, ${b.notes} notée${b.notes > 1 ? "s" : ""}${b.moyenne != null ? `, moyenne ${String(b.moyenne).replace(".", ",")}/20` : ""}</small></span>
        <span>${!b.publie || new Date(b.debut) > maintenant ? `<button class="btn btn-ghost btn-sm" type="button" data-action="blanc-basculer" data-bid="${b.id}">${b.publie ? "Retirer" : "Publier"}</button>` : ""}</span></li>`).join("")}</ul>` : `<p class="ea-vide">Aucun concours blanc pour le moment.</p>`;
    return `${blocEpreuvesBlanches()}<section class="ad-bloc"><h3>Concours blancs à date fixe <span class="n">${blancs.length}</span></h3>
        <p class="ad-note">Les abonnés en cours voient l'épreuve publiée dès sa publication, mais le sujet n'apparaît qu'à l'heure du début. La copie s'enregistre seule et part à la fin (5 minutes de tolérance). Ensuite, chacun la fait corriger et noter par l'agent de révision (formules d'un mois et plus) ; le classement est anonyme. Prévenez les abonnés par une annonce.</p>
        ${liste}
        <details class="ad-ajout"><summary>Nouveau concours blanc</summary>
          <form class="form ad-form" id="adBlanc" novalidate>
            <div class="field full"><label for="cbTitre">Titre</label><input id="cbTitre" name="titre" maxlength="120" placeholder="Exemple : Concours blanc INFJ n° 1, cas pratique de droit pénal"></div>
            <div class="field"><label for="cbExercice">Épreuve</label><select id="cbExercice" name="exercice">${Object.entries(EXERCICES_AGENT).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
            <div class="field"><label for="cbMatiere">Matière</label><input id="cbMatiere" name="matiere" maxlength="80" placeholder="Droit pénal"></div>
            <div class="field"><label for="cbDebut">Début (date et heure d'Abidjan)</label><input id="cbDebut" name="debut" type="datetime-local"></div>
            <div class="field"><label for="cbDuree">Durée (minutes)</label><input id="cbDuree" name="duree" type="number" min="30" max="600" value="180"></div>
            <div class="field full"><label for="cbSujet">Sujet (énoncé complet, tel qu'il sera donné)</label><textarea id="cbSujet" name="sujet" rows="8" maxlength="12000"></textarea></div>
            <label class="ea-accord full"><input type="checkbox" name="publie"><span>Publier tout de suite (sinon, brouillon)</span></label>
            <p class="ea-msg" role="alert"></p>
            <button class="btn btn-gold" type="submit">Enregistrer</button>
          </form>
        </details>
      </section>`;
  }

  // Concours blancs en accès libre (page concours-blancs/) : sujets lisibles de tous une fois publiés, corrigés
  // réservés aux abonnés des formules d'une semaine et plus. L'administrateur lit les deux, publiés ou non.
  const NOMS_EPREUVES = { preselection: "Présélection", sog: "Sujet d'ordre général", droit_civil: "Droit civil", droit_commercial: "Droit commercial et OHADA", droit_penal: "Droit pénal et procédure pénale", droit_administratif: "Droit administratif", organisation_judiciaire: "Organisation judiciaire", opaj: "OPAJ", opea: "Organisation politique, économique et administrative", informatique: "Informatique et bureautique" };
  const NOMS_BLANCS = { magistrature: "Magistrature", greffe_cs: "Greffe, cycle supérieur", greffe_cms: "Greffe, cycle moyen supérieur", greffe_cm: "Greffe, cycle moyen" };
  function blocEpreuvesBlanches() {
    const rang = c => { const i = Object.keys(NOMS_BLANCS).indexOf(c); return i < 0 ? 99 : i; };
    const series = [...new Set(epreuvesB.map(e => `${e.concours}|${e.serie}`))]
      .sort((x, y) => { const [cx, nx] = x.split("|"), [cy, ny] = y.split("|"); return rang(cx) - rang(cy) || nx - ny; });
    const publiees = epreuvesB.filter(e => e.publie).length;
    return `<section class="ad-bloc"><h3>Concours blancs en accès libre <span class="n">${epreuvesB.length}</span></h3>
        <p class="ad-note">Magistrature : la présélection (2 heures) et les cinq épreuves écrites (4 heures chacune). Greffe : les épreuves d'admissibilité de chaque cycle. Tout visiteur compose sur la page <a href="${ROOT}concours-blancs/" target="_blank" rel="noopener">Concours blancs</a> ; le corrigé est réservé aux abonnés des formules d'une semaine et plus. ${publiees} épreuve${publiees > 1 ? "s" : ""} publiée${publiees > 1 ? "s" : ""} sur ${epreuvesB.length}.</p>
        ${series.length ? series.map(k => {
          const [conc, n] = k.split("|"), liste = epreuvesB.filter(e => e.concours === conc && String(e.serie) === n);
          const toutes = liste.every(e => e.publie);
          return `<details class="ad-ajout"><summary>${esc(NOMS_BLANCS[conc] || nomConcours(conc))}, série ${n} · ${liste.filter(e => e.publie).length}/${liste.length} publiées</summary>
            <ul class="ad-facteurs">${liste.map(e => `<li><span><b>${esc(NOMS_EPREUVES[e.epreuve] || e.titre)}</b><small>${esc(e.nature)} · ${e.duree_minutes} min · ${e.publie ? "publiée" : "brouillon"}</small></span>
              <span><button class="btn btn-ghost btn-sm" type="button" data-action="eb-voir" data-quoi="sujet" data-ebid="${e.id}">Sujet</button><button class="btn btn-ghost btn-sm" type="button" data-action="eb-voir" data-quoi="corrige" data-ebid="${e.id}">Corrigé</button></span></li>`).join("")}</ul>
            <p><button class="btn btn-navy btn-sm" type="button" data-action="eb-serie" data-conc="${esc(conc)}" data-serie="${n}" data-publie="${toutes ? "0" : "1"}">${toutes ? "Retirer la série" : "Publier la série"}</button></p></details>`;
        }).join("") : `<p class="ea-vide">Aucune épreuve pour le moment.</p>`}
      </section>`;
  }
  // Présélection : le sujet et le corrigé sont des objets JSON ; on les présente en texte lisible
  function texteEpreuve(e, quoi, t) {
    if (e.epreuve !== "preselection" && e.epreuve !== "informatique") return t;
    try {
      const o = JSON.parse(t);
      if (quoi === "sujet") return `${o.consigne || ""}\n\n${(o.items || []).map(i => `**${i.n}.** ${i.matiere ? `(${i.matiere}) ` : ""}${i.texte}`).join("\n\n")}`;
      return (o.reponses || []).map(r => `**${r.n}. ${r.r === "V" ? "Vrai" : "Faux"}.** ${r.j || ""}`).join("\n\n");
    } catch (err) { return t; }
  }
  async function voirEpreuveBlanche(id, quoi) {
    const e = epreuvesB.find(x => x.id === id);
    if (!e) return;
    const { data, error } = await client.from("epreuves_blanches").select(quoi).eq("id", id).maybeSingle();
    if (error || !data) { toast(error ? messageErreur(error) : "Épreuve introuvable."); return; }
    ouvrirContenu({ type: "texte", titre: `${NOMS_BLANCS[e.concours] || e.concours}, série ${e.serie}, ${NOMS_EPREUVES[e.epreuve] || e.titre}, ${quoi === "sujet" ? "sujet" : "corrigé"}`, texte: texteEpreuve(e, quoi, data[quoi]) }, "Administration");
  }

  function panneauStats() {
    const d = new Date(auj() + "T00:00:00Z"), mois = [];
    for (let i = 11; i >= 0; i--) mois.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    const vendues = commandes.filter(k => ["payee", "expediee", "livree"].includes(k.statut));
    const parMois = mois.map(m => {
      const a = paiements.filter(p => p.cree_le.slice(0, 7) === m).reduce((t, p) => t + (p.montant || 0), 0);
      const c = vendues.filter(k => k.cree_le.slice(0, 7) === m).reduce((t, k) => t + k.montant, 0);
      return [new Date(m + "-01T00:00:00Z").toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" }), a + c, c ? `dont ouvrages ${fcfa(c)}` : ""];
    });
    // Renouvellement : parmi les comptes dont la première période est terminée, part de ceux qui ont repris
    const parCompte = new Map();
    paiements.forEach(p => { const l = parCompte.get(p.user_id) || []; l.push(p); parCompte.set(p.user_id, l); });
    const eligibles = [...parCompte.values()].filter(l => l.map(p => p.fin).sort()[0] < auj());
    const renouveles = eligibles.filter(l => l.length > 1).length;
    const taux = eligibles.length ? Math.round(renouveles / eligibles.length * 100) : null;
    const nb = x => String(x);
    const lus = regrouper(lectures.filter(l => new Date(l.ouvert_le) >= il30j), l => l.contenu_id, () => 1).slice(0, 10)
      .map(([cid, v]) => [(contenus.find(c => c.id === cid) || {}).titre || "Contenu supprimé", v[0]]);
    const ventes = new Map();
    commandes.filter(k => k.statut !== "annulee").forEach(k => (k.lignes || []).forEach(l => ventes.set(l.ouvrage, (ventes.get(l.ouvrage) || 0) + l.qte)));
    const enCoursParConcours = regrouper(abonnes.filter(a => a.actif), a => a.concours ? nomConcours(a.concours) : "Non précisé", () => 1).map(([k, v]) => [k, v[0]]);
    return `<div class="ad-stats ad-stats-3">
        <div><b>${fcfa(paiements.reduce((t, p) => t + (p.montant || 0), 0) + vendues.reduce((t, k) => t + k.montant, 0))}</b><span>Recettes depuis l'ouverture (abonnements et ouvrages)</span></div>
        <div><b>${taux == null ? "–" : taux + " %"}</b><span>Renouvellement${eligibles.length ? ` (${renouveles} sur ${eligibles.length} comptes arrivés au terme d'une période)` : " : pas encore de période terminée"}</span></div>
        <div><b>${abonnes.filter(a => a.actif).length}</b><span>Abonnements en cours</span></div>
      </div>
      ${barres("Recettes des 12 derniers mois", parMois)}
      ${barres("Abonnements par formule", regrouper(paiements, formuleDe, p => p.montant || 0).map(([k, v]) => [k, v[0], pluriel(v[1], "paiement")]))}
      ${barres("Par moyen de paiement", regrouper([...paiements, ...vendues], x => x.moyen || "Non précisé", x => x.montant || 0).map(([k, v]) => [k, v[0], pluriel(v[1], "paiement")]))}
      ${barres("Abonnés en cours par concours", enCoursParConcours, nb)}
      ${barres("Contenus les plus ouverts (30 jours)", lus, nb)}
      ${barres("Ouvrages papier vendus", [...ventes].sort((a, b) => b[1] - a[1]).slice(0, 15), x => pluriel(x, "exemplaire"))}`;
  }

  /* ---------- Journal ---------- */
  const LIBELLES_JOURNAL = {
    abonnement_active: "Abonnement activé", abonnement_supprime: "Abonnement supprimé", acces_coupe: "Accès coupé", abonnement_modifie: "Abonnement modifié",
    abonnement_suspendu: "Abonnement suspendu", abonnement_reactive: "Abonnement réactivé", contenu_ajoute: "Contenu ajouté", contenu_supprime: "Contenu supprimé",
    contenu_publie: "Contenu publié", contenu_retire: "Contenu retiré", contenu_modifie: "Contenu modifié", commande_ajoutee: "Commande enregistrée",
    commande_supprimee: "Commande supprimée", commande_payee: "Commande payée", commande_expediee: "Commande expédiée", commande_livree: "Commande livrée",
    commande_annulee: "Commande annulée", commande_nouvelle: "Commande remise en « nouvelle »", commande_modifiee: "Commande modifiée",
    compte_deconnecte: "Abonné déconnecté de ses appareils", compte_supprime: "Compte supprimé"
  };
  function detailJournal(j) {
    const x = j.details || {};
    if (j.action.startsWith("abonnement") || j.action === "acces_coupe") return `${esc(nomAbonne(j.cible))}${x.debut ? ` · du ${dateFr(x.debut)} au ${dateFr(x.fin)}` : ""}${x.montant != null && j.action === "abonnement_active" ? ` · ${fcfa(x.montant)}` : ""}${x.moyen && j.action === "abonnement_active" ? ` · ${esc(x.moyen)}` : ""}`;
    if (j.action.startsWith("contenu")) return esc(x.titre || "");
    if (j.action.startsWith("commande")) return `${esc(x.client || "")}${x.montant != null ? ` · ${fcfa(x.montant)}` : ""}`;
    if (j.action === "compte_deconnecte") return esc(nomAbonne(j.cible));
    if (j.action === "compte_supprime") return esc(x.email || "");
    return "";
  }
  function panneauJournal() {
    return journal.length ? `<div class="ad-tableau" role="region" aria-label="Journal des actions" tabindex="0"><table>
        <thead><tr><th>Quand</th><th>Action</th><th>Détail</th></tr></thead>
        <tbody>${journal.map(j => `<tr><td>${dateHeure(j.quand)}</td><td>${esc(LIBELLES_JOURNAL[j.action] || j.action)}</td><td>${detailJournal(j)}</td></tr>`).join("")}</tbody>
      </table></div><p class="ad-note">Les 300 dernières actions sur les abonnements, les contenus, les commandes et les comptes, enregistrées par la base.</p>`
      : `<p class="ea-vide">Aucune action enregistrée pour le moment. Le journal démarre avec cette version de l'administration.</p>`;
  }

  /* ---------- Agent de révision : réglages, méthode, coûts ---------- */
  // La méthode (consignes) est rangée dans la base, réservée à l'administrateur, et jamais dans le dépôt public.
  // La clé de l'API Anthropic est un secret de la fonction Supabase « agent-revision » (ANTHROPIC_API_KEY).
  const CONSIGNES = [["commun", "Consignes communes (sources, références vérifiées, style, correction)"], ["cas_pratique", "Cas pratique"], ["dissertation", "Dissertation juridique"], ["commentaire", "Commentaire d'article"]];
  const MODELES = [["claude-sonnet-5-5", "Sonnet 5.5 (recommandé)"], ["claude-opus-5-5", "Opus 5.5 (plus fin, plus cher)"], ["claude-haiku-5-5", "Haiku 5.5 (économique)"]];
  const EXERCICES_AGENT = { cas_pratique: "Cas pratique", dissertation: "Dissertation", commentaire: "Commentaire d'article" };
  const auteurDemande = uid => uid === (moi && moi.id) ? "Vous" : nomAbonne(uid);
  /* ---------- Téléchargements et lectures des abonnés ---------- */
  // Pages réservées au téléchargement (60 derniers jours) et pages lues à l'écran (30 derniers jours), par abonné
  const plages = l => { const r = []; for (const n of [...l].sort((a, b) => a - b)) { const d = r[r.length - 1]; if (d && n === d[1] + 1) d[1] = n; else r.push([n, n]); } return r.map(([a, b]) => a === b ? a : `${a}-${b}`).join(", "); };
  const nomDe = uid => { const a = abonnes.find(x => x.user_id === uid); return a ? `${a.prenom} ${a.nom}` : "Compte supprimé"; };
  function tablesTelechargements() {
    const q = sansAccents(rechercheT).trim();
    const depuis30j = Date.now() - 30 * 864e5, jour = auj();
    const parAbonne = new Map();
    const ligne = uid => { if (!parAbonne.has(uid)) parAbonne.set(uid, { uid, tele30: 0, tele60: 0, dernier: null, luesJour: 0, lues30: 0 }); return parAbonne.get(uid); };
    telechargements.forEach(t => { const x = ligne(t.user_id); x.tele60 += t.nb; if (new Date(t.cree_le) >= depuis30j) x.tele30 += t.nb; if (!x.dernier || t.cree_le > x.dernier) x.dernier = t.cree_le; });
    pagesLues.forEach(l => { const x = ligne(l.user_id); x.lues30 += Number(l.pages); if (l.jour === jour) x.luesJour += Number(l.pages); });
    const garde = uid => !q || sansAccents(`${nomDe(uid)} ${(abonnes.find(x => x.user_id === uid) || {}).telephone || ""}`).includes(q);
    const resume = [...parAbonne.values()].filter(x => garde(x.uid)).sort((a, b) => b.tele30 - a.tele30 || b.luesJour - a.luesJour || b.lues30 - a.lues30);
    const liste = telechargements.filter(t => garde(t.user_id) || sansAccents(t.titre).includes(q));
    const quota = limitesTele ? limitesTele.quota : 0;
    return `<section class="ad-bloc"><h3>Par abonné <span class="n">${resume.length}</span></h3>
        ${resume.length ? `<div class="ad-tableau" role="region" aria-label="Téléchargements et lectures par abonné" tabindex="0"><table>
          <thead><tr><th>Abonné</th><th>Téléchargées, 30 jours</th><th>Lues aujourd'hui</th><th>Lues, 30 jours</th><th>Dernier téléchargement</th></tr></thead>
          <tbody>${resume.map(x => `<tr><td>${esc(nomDe(x.uid))}</td><td>${x.tele30}${quota ? ` / ${quota}` : ""}${quota && x.tele30 >= quota * 0.8 ? ` <span class="ad-badge ad-partage">Limite proche</span>` : ""}</td><td>${x.luesJour} / 300${x.luesJour >= 240 ? ` <span class="ad-badge ad-partage">Limite proche</span>` : ""}</td><td>${x.lues30}</td><td>${x.dernier ? dateHeure(x.dernier) : ""}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="ea-vide">${q ? "Aucun abonné ne correspond." : "Aucune page lue ni téléchargée pour le moment."}</p>`}
      </section>
      <section class="ad-bloc"><h3>Téléchargements des 60 derniers jours <span class="n">${liste.length}</span></h3>
        ${liste.length ? `<div class="ad-tableau" role="region" aria-label="Téléchargements" tabindex="0"><table>
          <thead><tr><th>Date</th><th>Abonné</th><th>Document</th><th>Pages</th><th>Nombre</th><th>Réf.</th></tr></thead>
          <tbody>${liste.map(t => `<tr><td>${dateHeure(t.cree_le)}</td><td>${esc(`${t.prenom || ""} ${t.nom || ""}`.trim() || nomDe(t.user_id))}${t.telephone ? `<small> · ${esc(t.telephone)}</small>` : ""}</td><td>${esc(t.titre)}</td><td>${esc(plages(t.pages))}</td><td>${t.nb}</td><td>${t.id}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="ea-vide">${q ? "Aucun téléchargement ne correspond." : "Aucun téléchargement pour le moment."}</p>`}
      </section>`;
  }
  function panneauTelechargements() {
    const depuis30j = Date.now() - 30 * 864e5, jour = auj();
    const tele30 = telechargements.filter(t => new Date(t.cree_le) >= depuis30j);
    return `<div class="ad-stats"><div><b>${tele30.reduce((s, t) => s + t.nb, 0)}</b><span>Pages téléchargées en 30 jours</span></div>
        <div><b>${new Set(tele30.map(t => t.user_id)).size}</b><span>Abonnés ayant téléchargé en 30 jours</span></div>
        <div><b>${pagesLues.filter(l => l.jour === jour).reduce((s, l) => s + Number(l.pages), 0)}</b><span>Pages lues aujourd'hui</span></div>
        <div><b>${limitesTele ? limitesTele.quota : "?"}</b><span>Limite par abonné sur 30 jours (5 par ouvrage)</span></div></div>
      <p class="ad-note">Chaque page lue ou téléchargée porte, fondus dans l'image, le nom, le téléphone et l'e-mail de l'abonné ; les pages téléchargées portent aussi la référence ci-dessous. Une page trouvée en dehors de l'espace permet ainsi de retrouver le compte et le téléchargement d'origine.</p>
      <div class="ad-outils ad-outils-c"><label class="search"><span class="sr-only">Rechercher</span>${icone("i-search")}<input type="search" id="adRechercheT" placeholder="Rechercher un abonné, un numéro ou un document" value="${esc(rechercheT)}" autocomplete="off"></label></div>
      <div id="adTablesT">${tablesTelechargements()}</div>`;
  }

  /* ---------- E-mails aux abonnés (Brevo) ---------- */
  // Trois e-mails automatiques, préparés par la base et envoyés par la fonction « emails » toutes les 15 minutes
  const TYPES_EMAIL = { bienvenue: "Bienvenue", rappel_fin: "Rappel de fin", inactif: "Relance d'inactivité", campagne: "Annonce (campagne)", nouveautes: "Nouveautés", essai: "Essai" };
  async function verifierBrevo() {
    const { data, error } = await client.functions.invoke("emails", { body: { action: "etat" } });
    etatBrevo = error ? { erreur: await erreurFonction(error) } : data;
    const el = $("#adEtatBrevo");
    if (el) el.innerHTML = etatBrevoHTML();
  }
  const etatBrevoHTML = () => !etatBrevo ? "Vérification de la clé Brevo…"
    : etatBrevo.erreur ? esc(etatBrevo.erreur)
    : etatBrevo.cle ? `<span class="ad-badge ad-actif">Clé Brevo enregistrée</span>` : `<span class="ad-badge ad-attente">Clé Brevo absente</span> À enregistrer dans Supabase, Edge Functions, Secrets, sous le nom BREVO_API_KEY.`;
  function panneauEmails() {
    if (!emailsReglages) return `<p class="ea-vide">Les e-mails ne sont pas encore installés dans la base.</p>`;
    if (!etatBrevo) setTimeout(verifierBrevo, 0);
    const il30j = Date.now() - 30 * 864e5;
    const recents = emailsEnvoyes.filter(e => new Date(e.cree_le) >= il30j);
    const compte = t => recents.filter(e => e.type === t && e.statut === "envoye").length;
    const erreurs = recents.filter(e => e.statut === "erreur").length;
    return `<section class="ad-bloc">
        <h3>Envoi des e-mails <span class="ad-badge ${emailsReglages.actif ? "ad-actif" : "ad-attente"}">${emailsReglages.actif ? "Ouvert" : "Fermé"}</span></h3>
        <p id="adEtatBrevo">${etatBrevoHTML()}</p>
        <div class="ad-outils-ligne">
          <button class="btn ${emailsReglages.actif ? "btn-ghost" : "btn-navy"} btn-sm" type="button" data-action="emails-basculer">${emailsReglages.actif ? "Fermer l'envoi" : "Ouvrir l'envoi"}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="emails-essai">M'envoyer un e-mail d'essai</button>
        </div>
        <p class="ad-note">Expéditeur infos@coursesesame.com, par Brevo. Quatre e-mails partent seuls, au plus tard 15 minutes après l'événement. La bienvenue, au premier abonnement d'un compte. Le rappel, 7 jours puis 3 jours avant la fin d'un abonnement qui n'a pas été prolongé. La relance d'inactivité, entre 9 h et 20 h, à l'abonné en cours qui n'est pas passé dans l'espace depuis 5 jours (une fois par semaine au plus, jamais un jour d'annonce des nouveautés, ni dans les 3 derniers jours). L'annonce des nouveautés, chaque jour à partir de 9 h s'il y a eu des mises en ligne, aux abonnés en cours qui ne l'ont pas refusée. Chaque annonce contient un lien de désinscription ; l'abonné peut aussi changer son choix dans « Mon compte ».</p>
      </section>
      <div class="ad-stats"><div><b>${compte("bienvenue")}</b><span>Bienvenues, 30 jours</span></div><div><b>${compte("rappel_fin")}</b><span>Rappels, 30 jours</span></div><div><b>${compte("inactif")}</b><span>Relances, 30 jours</span></div>
        <div><b>${compte("nouveautes")}</b><span>Annonces, 30 jours</span></div><div><b>${erreurs}</b><span>Erreurs, 30 jours</span></div></div>
      <section class="ad-bloc"><h3>Derniers envois <span class="n">${emailsEnvoyes.length}</span></h3>
        ${emailsEnvoyes.length ? `<div class="ad-tableau" role="region" aria-label="Derniers e-mails" tabindex="0"><table>
          <thead><tr><th>Date</th><th>Abonné</th><th>E-mail</th><th>État</th></tr></thead>
          <tbody>${emailsEnvoyes.map(e => `<tr><td>${dateHeure(e.cree_le)}</td><td>${esc(e.user_id ? nomDe(e.user_id) : "")}</td><td>${esc(TYPES_EMAIL[e.type] || e.type)}</td><td>${e.statut === "envoye" ? "Envoyé" : e.statut === "erreur" ? `<span class="ad-badge ad-partage">Erreur</span> <small>${esc(e.erreur || "")}</small>` : "En cours"}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="ea-vide">Aucun e-mail envoyé pour le moment.</p>`}
      </section>`;
  }

  function panneauAgent() {
    if (!agentReglages) return `<p class="ea-vide">L'agent de révision n'est pas encore installé dans la base.</p>`;
    const r = agentReglages, debutMois = auj().slice(0, 8) + "01";
    const mois = agentEchanges.filter(e => e.cree_le.slice(0, 10) >= debutMois);
    const faits = mois.filter(e => e.statut === "termine");
    const cout = mois.reduce((t, e) => t + Number(e.cout_fcfa || 0), 0);
    const usagers = new Set(faits.map(e => e.user_id)).size;
    const notes = faits.filter(e => e.note != null);
    const consignesPretes = CONSIGNES.every(([k]) => agentConsignes.has(k));
    return `${r.actif ? "" : `<div class="ad-alerte"><b>L'agent est fermé aux abonnés.</b> Vous pouvez le tester depuis l'espace abonnés. Ouvrez-le ci-dessous quand vous êtes satisfait.</div>`}
      ${consignesPretes ? "" : `<div class="ad-alerte"><b>Méthode incomplète.</b> Les quatre consignes doivent être enregistrées pour que l'agent réponde.</div>`}
      <div class="ad-stats ad-stats-5">
        <div><b>${faits.length}</b><span>Demandes ce mois-ci</span></div>
        <div><b>${usagers}</b><span>Abonnés utilisateurs</span></div>
        <div><b>${fcfa(cout)}</b><span>Coût estimé ce mois-ci (plafond ${fcfa(r.plafond_mois_fcfa)})</span></div>
        <div><b>${faits.length ? fcfa(cout / faits.length) : "–"}</b><span>Coût moyen d'une demande</span></div>
        <div><b>${notes.length ? (notes.reduce((t, e) => t + Number(e.note), 0) / notes.length).toFixed(1).replace(".", ",") + "/20" : "–"}</b><span>Note moyenne des copies corrigées</span></div>
      </div>
      <details class="ad-ajout">
        <summary>Réglages de l'agent</summary>
        <form class="form ad-form" id="adAgentReglages" novalidate>
          <label class="ea-accord full"><input type="checkbox" name="actif"${r.actif ? " checked" : ""}><span>Ouvrir l'agent aux abonnés (formules d'un mois et plus)</span></label>
          <div class="field"><label for="agModele">Modèle</label><select id="agModele" name="modele">${MODELES.map(([v, l]) => `<option value="${v}"${r.modele === v ? " selected" : ""}>${l}</option>`).join("")}${MODELES.some(([v]) => v === r.modele) ? "" : `<option value="${esc(r.modele)}" selected>${esc(r.modele)}</option>`}</select></div>
          <div class="field"><label for="agJour">Demandes par jour et par abonné</label><input id="agJour" name="quota_jour" type="number" min="0" max="100" value="${r.quota_jour}"></div>
          <div class="field"><label for="agMois">Demandes par mois et par abonné</label><input id="agMois" name="quota_mois" type="number" min="0" max="1000" value="${r.quota_mois}"></div>
          <div class="field"><label for="agPlafond">Plafond de dépense du mois (FCFA)</label><input id="agPlafond" name="plafond_mois_fcfa" type="number" min="0" step="1000" value="${r.plafond_mois_fcfa}"><small class="ad-note">Au-delà, l'agent s'arrête pour les abonnés jusqu'au mois suivant. Fixez aussi une limite dans la console Anthropic.</small></div>
          <div class="field"><label for="agEntree">Prix des jetons lus ($ par million)</label><input id="agEntree" name="prix_entree_usd" type="number" min="0" step="0.01" value="${r.prix_entree_usd}"></div>
          <div class="field"><label for="agSortie">Prix des jetons écrits ($ par million)</label><input id="agSortie" name="prix_sortie_usd" type="number" min="0" step="0.01" value="${r.prix_sortie_usd}"></div>
          <div class="field"><label for="agCache">Prix des jetons en cache ($ par million)</label><input id="agCache" name="prix_cache_usd" type="number" min="0" step="0.01" value="${r.prix_cache_usd}"></div>
          <div class="field"><label for="agTaux">Cours du dollar (FCFA)</label><input id="agTaux" name="taux_fcfa" type="number" min="1" step="1" value="${r.taux_fcfa}"></div>
          <p class="ea-msg full" role="alert"></p>
          <button class="btn btn-gold" type="submit">Enregistrer les réglages</button>
        </form>
      </details>
      ${CONSIGNES.map(([k, l]) => { const c = agentConsignes.get(k); return `<details class="ad-ajout">
        <summary>Méthode, ${l}${c ? ` <small>(${pluriel(c.texte.split(/\s+/).length, "mot")}, modifiée le ${dateFr(c.maj_le)})</small>` : " <small>(à enregistrer)</small>"}</summary>
        <form class="form ad-form" data-form="consigne" data-cle="${k}" novalidate>
          <div class="field full"><label for="agC-${k}">Texte lu par l'agent avant chaque réponse</label><textarea id="agC-${k}" name="texte" rows="18" maxlength="200000">${esc(c ? c.texte : "")}</textarea></div>
          <p class="ea-msg full" role="alert"></p>
          <button class="btn btn-gold" type="submit">Enregistrer</button>
        </form>
      </details>`; }).join("")}
      <div class="ad-bloc"><h3>Dernières demandes</h3>
      ${agentEchanges.length ? `<div class="ad-tableau" role="region" aria-label="Demandes à l'agent" tabindex="0"><table>
        <thead><tr><th>Quand</th><th>Abonné</th><th>Exercice</th><th>Note</th><th>Coût</th><th></th></tr></thead>
        <tbody>${agentEchanges.slice(0, 100).map(e => `<tr><td>${dateHeure(e.cree_le)}</td><td>${esc(auteurDemande(e.user_id))}</td><td>${EXERCICES_AGENT[e.exercice] || e.exercice}, ${e.mode === "correction" ? "correction" : "rédaction"}${e.statut === "erreur" ? " · échec" : e.statut === "en_cours" ? " · en cours" : ""}</td><td>${e.note != null ? String(e.note).replace(".", ",") + "/20" : ""}</td><td>${e.cout_fcfa != null ? fcfa(e.cout_fcfa) : ""}</td><td>${e.statut === "termine" ? `<button class="btn btn-ghost btn-sm" type="button" data-action="agent-voir" data-eid="${e.id}">Voir</button>` : ""}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="ea-vide">Aucune demande pour le moment.</p>`}
      <p class="ad-note">Coûts estimés d'après les jetons comptés par Anthropic et les tarifs ci-dessus. La facture réelle est dans la console Anthropic.</p></div>`;
  }
  async function voirEchange(id) {
    const { data, error } = await client.from("agent_echanges").select("*").eq("id", id).maybeSingle();
    if (error || !data) { toast(messageErreur(error || new Error("Demande introuvable"))); return; }
    const texte = `**Demande de ${auteurDemande(data.user_id)}, ${dateHeure(data.cree_le)}**\n\n## Sujet\n\n${data.sujet}${data.copie ? `\n\n## Copie de l'abonné\n\n${data.copie}` : ""}\n\n## Réponse de l'agent${data.note != null ? ` (note indicative ${String(data.note).replace(".", ",")}/20)` : ""}\n\n${data.reponse || ""}`;
    ouvrirContenu({ type: "texte", titre: `${EXERCICES_AGENT[data.exercice] || "Exercice"}, ${data.mode === "correction" ? "correction" : "rédaction"}`, texte }, "Administration");
  }

  /* ---------- Suivi en direct ---------- */
  // Changements des abonnements, suspensions et comptes reçus en direct (Supabase Realtime, réservé à
  // l'administrateur par les règles d'accès) ; actualisation de secours toutes les 30 secondes, qui sert aussi
  // à la liste des abonnés en ligne.
  // Si un formulaire est ouvert ou un champ en cours de saisie, la page ne se redessine pas : un bouton
  // « Nouveautés : afficher » apparaît à la place.
  const occupe = () => telechargement || !!racine.querySelector(".ad-zone:not([hidden]) form, .ad-ajout[open], .ad-securite-ouverte") ||
    (document.activeElement && racine.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
  async function actualiserEnDirect() {
    if (!moi || document.hidden) return;
    if (occupe()) { majEnAttente = true; majIndicateur(); return; }
    try { await toutCharger(); } catch (e) { return; }
    const y = scrollY;
    afficher();
    scrollTo(0, y);
  }
  const signal = () => { clearTimeout(attenteSignal); attenteSignal = setTimeout(actualiserEnDirect, 800); };
  function brancherDirect() {
    if (!minuterieDirect) minuterieDirect = setInterval(actualiserEnDirect, 30000);
    if (!minuterieVisites) minuterieVisites = setInterval(rafraichirVisites, 15000);
    if (canal || typeof client.channel !== "function") return;
    canal = client.channel("admin-direct")
      .on("postgres_changes", { event: "*", schema: "public", table: "abonnements" }, signal)
      .on("postgres_changes", { event: "*", schema: "public", table: "suspensions" }, signal)
      .on("postgres_changes", { event: "*", schema: "public", table: "profils" }, signal)
      .subscribe(etat => { enDirect = etat === "SUBSCRIBED"; majIndicateur(); });
  }
  function debrancherDirect() {
    clearInterval(minuterieDirect); minuterieDirect = null;
    clearInterval(minuterieVisites); minuterieVisites = null;
    if (canal) { client.removeChannel(canal); canal = null; }
    enDirect = false;
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && moi) actualiserEnDirect(); });

  /* ---------- Actions ---------- */
  async function recharger(messageOk) {
    try { await toutCharger(); } catch (e) { toast(messageErreur(e)); }
    const y = scrollY;
    afficher();
    scrollTo(0, y);
    if (messageOk) toast(messageOk);
  }
  const zoneDe = el => $(".ad-zone", el.closest(".ad-ligne"));
  function basculerZone(el, html) {
    const z = zoneDe(el);
    const ouvert = !z.hidden && z.dataset.contenu === html.slice(0, 40);
    z.innerHTML = ouvert ? "" : html;
    z.dataset.contenu = ouvert ? "" : html.slice(0, 40);
    z.hidden = ouvert;
    return z;
  }

  racine.addEventListener("click", async e => {
    const lienRelance = e.target.closest("a[data-relance]");
    if (lienRelance) { marquerRelance(lienRelance.dataset.relance); setTimeout(() => { if (onglet === "relances" && !occupe()) redessiner(); }, 600); return; }
    const b = e.target.closest("button[data-action], button[data-caction], button[data-kaction], button[data-onglet], button[data-filtre], button[data-filtrec], button[data-filtrev]");
    if (!b) return;
    if (b.dataset.onglet) { onglet = b.dataset.onglet; afficher(); return; }
    if (b.dataset.filtre) { filtre = b.dataset.filtre; $("#adPanneau").innerHTML = panneauAbonnes(); return; }
    if (b.dataset.filtrec) { filtreC = b.dataset.filtrec; $("#adZoneC").innerHTML = zoneContenus(); return; }
    if (b.dataset.filtrev) { filtreV = b.dataset.filtrev; $("#adPanneau").innerHTML = panneauVisites(); return; }
    const act = b.dataset.action;
    if (act === "sortir") { debrancherDirect(); await client.auth.signOut(); connexion(); return; }
    if (act === "emails-basculer") {
      const actif = !emailsReglages.actif;
      if (actif && !confirm("Ouvrir l'envoi des e-mails ? Les bienvenues, rappels et annonces partiront automatiquement.")) return;
      const { error } = await client.from("emails_reglages").update({ actif, maj_le: new Date().toISOString() }).eq("id", true);
      if (error) return toast(messageErreur(error));
      emailsReglages.actif = actif;
      toast(actif ? "Envoi des e-mails ouvert." : "Envoi des e-mails fermé.");
      afficher();
      return;
    }
    if (act === "emails-essai") {
      b.disabled = true;
      const { data, error } = await client.functions.invoke("emails", { body: { action: "essai" } });
      b.disabled = false;
      toast(error ? await erreurFonction(error) : `E-mail d'essai envoyé à ${data.a}. Regardez aussi dans les courriers indésirables.`);
      return;
    }
    if (act === "recharger") { demarrer(); return; }
    if (act === "actualiser") { recharger(); return; }
    if (act === "actualiser-visites") { const o = onglet; onglet = "visites"; await rafraichirVisites(); onglet = o; toast("Visites actualisées"); return; }
    if (act === "mfa") { activerDeuxEtapes(b); return; }
    if (act === "tout-telecharger") { telechargerTout(b); return; }
    if (act === "indexer") { indexerContenus(b); return; }
    if (act === "agent-voir") { voirEchange(Number(b.dataset.eid)); return; }
    if (act === "exporter") { exporter(b.dataset.quoi); return; }
    if (act === "copier-numeros") { copierNumeros(); return; }
    if (act === "supprimer-anciens") { supprimerAnciens(b); return; }
    if (act === "cmd-ligne") { $("#adCmdLignes").insertAdjacentHTML("beforeend", ligneCmdHTML()); return; }
    if (act === "eb-voir") { voirEpreuveBlanche(Number(b.dataset.ebid), b.dataset.quoi === "sujet" ? "sujet" : "corrige"); return; }
    if (act === "eb-serie") {
      const publier = b.dataset.publie === "1";
      if (publier && !confirm(`Publier la série ${b.dataset.serie} ? Tous les visiteurs pourront composer ; les abonnés des formules d'une semaine et plus liront les corrigés.`)) return;
      const { error } = await client.from("epreuves_blanches").update({ publie: publier }).eq("concours", b.dataset.conc).eq("serie", Number(b.dataset.serie));
      if (error) { toast(messageErreur(error)); return; }
      recharger(publier ? "Série publiée." : "Série retirée.");
      return;
    }
    if (act === "blanc-basculer") {
      const cb = blancs.find(x => String(x.id) === b.dataset.bid);
      if (!cb) return;
      if (!cb.publie && !confirm(`Publier « ${cb.titre} » ? Les abonnés verront l'épreuve et sa date ; le sujet restera caché jusqu'au début.`)) return;
      const { error } = await client.from("concours_blancs").update({ publie: !cb.publie }).eq("id", cb.id);
      if (error) { toast(messageErreur(error)); return; }
      recharger(cb.publie ? "Concours blanc retiré." : "Concours blanc publié.");
      return;
    }
    if (act === "annonce-basculer" || act === "annonce-supprimer") {
      const an = annonces.find(x => String(x.id) === b.dataset.aid);
      if (!an) return;
      if (act === "annonce-supprimer" && !confirm("Supprimer cette annonce ?")) return;
      const { error } = act === "annonce-supprimer" ? await client.from("annonces").delete().eq("id", an.id)
        : await client.from("annonces").update({ active: !an.active }).eq("id", an.id);
      if (error) return toast(messageErreur(error));
      recharger(act === "annonce-supprimer" ? "Annonce supprimée." : an.active ? "Annonce masquée." : "Annonce affichée.");
      return;
    }
    const lk = b.closest("[data-kid]");
    if (lk && b.dataset.kaction) {
      const k = commandes.find(x => String(x.id) === lk.dataset.kid);
      if (!k) return;
      if (b.dataset.kaction === "supprimer") {
        if (!confirm(`Supprimer la commande de ${k.client} (${fcfa(k.montant)}) ?`)) return;
        const { error } = await client.from("commandes").delete().eq("id", k.id);
        if (error) return toast(messageErreur(error));
        recharger("Commande supprimée.");
      }
      return;
    }
    if (act === "secours") { await chargerFacteurs(); panneauSecours(); return; }
    if (act === "cle-secours") { activerDeuxEtapes(b, true); return; }
    if (act === "secours-fermer") {
      // Une clé commencée mais non vérifiée est retirée
      const { data: l } = await client.auth.mfa.listFactors();
      for (const f of ((l && l.all) || []).filter(x => x.status !== "verified")) await client.auth.mfa.unenroll({ factorId: f.id });
      const z = $("#adSecurite");
      z.outerHTML = blocSecours();
      return;
    }
    if (act === "retirer-facteur") {
      const f = facteurs.find(x => x.id === b.dataset.facteur);
      if (!f || facteurs.length < 2) return;
      if (!confirm(`Retirer « ${f.friendly_name || "cette application"} » ?\n\nIl ne permettra plus de se connecter à l'administration. À faire pour un téléphone perdu ou une clé de secours qui a pu être vue par quelqu'un d'autre.`)) return;
      b.disabled = true;
      const { error } = await client.auth.mfa.unenroll({ factorId: f.id });
      if (error) { b.disabled = false; toast(messageErreur(error)); return; }
      await chargerFacteurs();
      panneauSecours();
      toast("Retiré : il ne permet plus de se connecter.");
      return;
    }
    const ligne = b.closest("[data-uid], [data-cid]");
    if (!ligne) return;
    if (act) {
      const a = abonnes.find(x => x.user_id === ligne.dataset.uid);
      if (!a) return;
      delete retours[a.user_id];
      // Message de retour : sous la ligne (onglet Abonnés) et en tête du suivi en direct
      const retour = html => { retours[a.user_id] = html; retourDirect = html; };
      if (act === "relance-faite") { marquerRelance(a.user_id); redessiner(); return; }
      if (act === "note") { basculerZone(b, formulaireNote(a)); return; }
      if (act === "deconnecter") {
        if (!confirm(`Déconnecter ${a.prenom} ${a.nom} de tous ses appareils ?\n\nSa session est fermée tout de suite. Son abonnement n'est pas touché : il pourra se reconnecter avec son mot de passe, sur un seul appareil.`)) return;
        b.disabled = true;
        const { error } = await client.rpc("admin_deconnecter", { p_user: a.user_id });
        b.disabled = false;
        if (error) return toast(messageErreur(error));
        recharger(`${a.prenom} ${a.nom} est déconnecté de tous ses appareils.`);
        return;
      }
      if (act === "supprimer-compte") {
        if (!confirm(`Supprimer définitivement le compte de ${a.prenom} ${a.nom} (${a.email}) ?\n\nÀ réserver aux faux comptes et aux inscriptions abandonnées : le compte n'a jamais eu d'abonnement.`)) return;
        b.disabled = true;
        const { error } = await client.rpc("admin_supprimer_compte", { p_user: a.user_id });
        b.disabled = false;
        if (error) return toast(messageErreur(error));
        recharger("Compte supprimé.");
        return;
      }
      if (act === "suspendre") {
        if (!confirm(`Suspendre l'abonnement de ${a.prenom} ${a.nom} ?\n\nL'accès est coupé tout de suite. Les ${pluriel(joursRestants(a), "jour")} restants sont gardés et repartiront le jour de la réactivation.`)) return;
        b.disabled = true;
        const texte = messageSuspension(a);
        const { error } = await client.rpc("admin_suspendre", { p_user: a.user_id });
        b.disabled = false;
        if (error) return toast(messageErreur(error));
        retour(`<div class="ad-retour"><p>Abonnement de ${esc(a.prenom)} ${esc(a.nom)} <b>suspendu</b>.</p><a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), texte)}" target="_blank" rel="noopener">${icone("i-wa")}Prévenir ${esc(a.prenom)} sur WhatsApp</a></div>`);
        recharger("Abonnement suspendu.");
        return;
      }
      if (act === "reactiver") {
        if (!confirm(`Réactiver l'abonnement de ${a.prenom} ${a.nom} ?\n\nLes ${pluriel(joursRestants(a), "jour")} gardés en réserve repartent aujourd'hui.`)) return;
        b.disabled = true;
        const { data: fin, error } = await client.rpc("admin_reactiver", { p_user: a.user_id });
        b.disabled = false;
        if (error) return toast(messageErreur(error));
        retour(`<div class="ad-retour"><p>Abonnement de ${esc(a.prenom)} ${esc(a.nom)} réactivé jusqu'au <b>${dateFr(fin)}</b>.</p><a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), messageReactivation(a, fin))}" target="_blank" rel="noopener">${icone("i-wa")}Prévenir ${esc(a.prenom)} sur WhatsApp</a></div>`);
        recharger("Abonnement réactivé.");
        return;
      }
      if (act === "supprimer" || act === "supprimer-periode") {
        const pid = act === "supprimer-periode" ? Number(b.dataset.pid) : null;
        const p = pid ? paiements.find(x => x.id === pid) : null;
        const quoi = p ? `la période du ${dateFr(p.debut)} au ${dateFr(p.fin)}${p.montant != null ? ` (${fcfa(p.montant).replace(/ /g, " ")})` : ""}` : "l'abonnement en cours (et ses prolongations à venir)";
        if (!confirm(`Supprimer ${quoi} de ${a.prenom} ${a.nom} ?\n\nL'accès correspondant est fermé tout de suite et le paiement disparaît de l'historique et des totaux. À utiliser pour une activation faite par erreur ou un paiement remboursé.\n\nPour arrêter un abonnement en gardant le paiement, choisissez plutôt « Couper l'accès ».`)) return;
        b.disabled = true;
        const { data: n, error } = await client.rpc("admin_supprimer_abonnement", { p_user: a.user_id, p_id: pid });
        b.disabled = false;
        if (error) return toast(messageErreur(error));
        retour(`<div class="ad-retour"><p>${n ? (n > 1 ? `${n} périodes supprimées` : "Période supprimée") : "Rien à supprimer"} pour ${esc(a.prenom)} ${esc(a.nom)}.</p></div>`);
        recharger(n ? "Abonnement supprimé." : "Aucune période à supprimer.");
        return;
      }
      if (act === "activer") { const z = basculerZone(b, formulaireActivation(a)); if (!z.hidden) $("select", z).focus(); }
      if (act === "historique") basculerZone(b, historique(a.user_id));
      if (act === "couper") {
        if (!confirm(`Couper l'accès de ${a.prenom} ${a.nom} dès aujourd'hui ? L'historique des paiements est conservé.`)) return;
        const { error } = await client.rpc("admin_couper", { p_user: a.user_id });
        if (error) return toast(messageErreur(error));
        recharger("Accès coupé.");
      }
      if (act === "mdp") {
        if (!confirm(`Donner un mot de passe provisoire à ${a.prenom} ${a.nom} ? Son mot de passe actuel ne fonctionnera plus.`)) return;
        b.disabled = true;
        const { data, error } = await client.functions.invoke("admin-mot-de-passe", { body: { user_id: a.user_id } });
        b.disabled = false;
        if (error) return toast(await erreurFonction(error));
        const msg = `Bonjour ${a.prenom},\n\nVoici votre mot de passe provisoire pour l'espace abonnés des Cours Sésame et SAJ : ${data.motDePasse}\n\nConnectez-vous ici : ${URL_ESPACE}\nPuis choisissez un nouveau mot de passe dans « Mon compte ».`;
        const z = zoneDe(b);
        z.hidden = false;
        z.innerHTML = `<div class="ad-retour"><p>Mot de passe provisoire de ${esc(a.prenom)} : <b class="ad-mdp">${esc(data.motDePasse)}</b></p><a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), msg)}" target="_blank" rel="noopener">${icone("i-wa")}L'envoyer sur WhatsApp</a></div>`;
      }
      return;
    }
    const c = contenus.find(x => String(x.id) === ligne.dataset.cid);
    if (!c) return;
    const ca = b.dataset.caction;
    if (ca === "voir") ouvrirContenu(c, "Aperçu administrateur");
    if (ca === "telecharger") { telechargerContenu(c, b); return; }
    if (ca === "pages") { basculerZone(b, formulairePages(c)); return; }
    if (ca === "lecteurs") { basculerZone(b, lecteursHTML(c)); return; }
    if (ca === "modifier") basculerZone(b, formulaireModification(c));
    if (ca === "publier") {
      const maj = c.publie ? { publie: false } : { publie: true, publie_le: new Date().toISOString() };
      const { error } = await client.from("contenus").update(maj).eq("id", c.id);
      if (error) return toast(messageErreur(error));
      recharger(c.publie ? "Contenu retiré : il est redevenu un brouillon." : "Contenu publié.");
    }
    if (ca === "supprimer") {
      if (!confirm(`Supprimer définitivement « ${c.titre} » ?`)) return;
      if (c.fichier) {
        const { error } = await client.storage.from("exclusif").remove([c.fichier]);
        if (error) return toast(messageErreur(error));
      }
      const { error } = await client.from("contenus").delete().eq("id", c.id);
      if (error) return toast(messageErreur(error));
      recharger("Contenu supprimé.");
    }
  });

  racine.addEventListener("input", e => {
    if (e.target.form && e.target.form.id === "adCommande" && e.target.name !== "montant") { majTotalCommande(e.target.form, e.target); return; }
    if (e.target.form && e.target.form.id === "adCommande" && e.target.name === "montant") { e.target.dataset.manuel = "1"; return; }
    if (e.target.id === "adRechercheT") { rechercheT = e.target.value; $("#adTablesT").innerHTML = tablesTelechargements(); return; }
    if (e.target.id === "adRechercheC") { rechercheC = e.target.value; $("#adListeC").innerHTML = listeContenus(); return; }
    if (e.target.id === "adRecherche") {
      recherche = e.target.value;
      const pos = e.target.selectionStart;
      $("#adPanneau").innerHTML = panneauAbonnes();
      const champ = $("#adRecherche");
      champ.focus();
      champ.setSelectionRange(pos, pos);
    }
  });
  racine.addEventListener("change", async e => {
    if (e.target.dataset.kstatut) {
      const k = commandes.find(x => String(x.id) === e.target.dataset.kstatut);
      if (!k) return;
      const { error } = await client.from("commandes").update({ statut: e.target.value, maj_le: new Date().toISOString() }).eq("id", k.id);
      if (error) { toast(messageErreur(error)); e.target.value = k.statut; return; }
      recharger("Commande : " + (STATUTS_CMD.find(x => x[0] === e.target.value) || ["", e.target.value])[1].toLowerCase() + ".");
      return;
    }
    if (e.target.form && e.target.form.id === "adCommande") { majTotalCommande(e.target.form, e.target); return; }
    const f = e.target.form;
    if (!f) return;
    if (e.target.name === "duree") {
      $("[data-jusqua]", f).hidden = e.target.value !== "date";
      if (PRIX[e.target.value]) f.elements.montant.value = PRIX[e.target.value];
    }
    if (e.target.id === "nType") $$("[data-pour]", f).forEach(x => { x.hidden = !x.dataset.pour.split(" ").includes(e.target.value); });
  });

  racine.addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
    const v = n => (f.elements[n] ? f.elements[n].value.trim() : "");
    const coches = () => $$("input[name=concours]:checked", f).map(x => x.value);
    msg.textContent = "";

    if (f.dataset.form === "mfa") {
      const code = v("code").replace(/\D/g, "");
      if (code.length !== 6) { msg.textContent = "Le code compte 6 chiffres."; return; }
      bouton.disabled = true;
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId: f.dataset.facteur, code });
      bouton.disabled = false;
      if (error) { msg.textContent = "Code incorrect ou expiré. Saisissez le code affiché en ce moment par l'application."; return; }
      deuxEtapes = true;
      await chargerFacteurs();
      if (f.dataset.secours) { panneauSecours(); toast("Clé de secours enregistrée. Gardez le papier en lieu sûr."); return; }
      afficher();
      toast("Validation en deux étapes activée. Le code sera demandé à chaque connexion.");
      return;
    }

    if (f.id === "adConnexion") {
      bouton.disabled = true;
      const { error } = await client.auth.signInWithPassword({ email: v("aEmail") || $("#aEmail").value.trim(), password: $("#aMdp").value });
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      demarrer();
      return;
    }

    if (f.dataset.form === "activer") {
      const a = abonnes.find(x => x.user_id === f.closest(".ad-ligne").dataset.uid);
      const duree = v("duree"), montant = v("montant");
      const mois = duree[0] === "m" ? Number(duree.slice(1)) : 0;
      // Durées en jours : fin calculée côté site. Pour un nouvel accès, le jour même est offert (activation en
      // cours de journée) : « 1 jour » ouvre jusqu'au lendemain soir. Une prolongation s'enchaîne sans jour offert.
      const nJours = duree[0] === "j" ? Number(duree.slice(1)) : 0;
      const jusqua = nJours ? plusJours(f.dataset.debut, f.dataset.suite === "1" ? nJours - 1 : nJours) : v("jusqua");
      if (!mois && !jusqua) { msg.textContent = "Choisissez la date de fin."; return; }
      const deja = paiementsMemeReference(v("note"))[0];
      if (deja && !confirm(`Attention : la référence « ${v("note")} » a déjà servi le ${dateFr(deja.cree_le)} pour ${deja.prenom} ${deja.nom}${deja.montant != null ? ` (${fcfa(deja.montant)})` : ""}.\n\nUne même référence Mobile Money ne correspond normalement qu'à un seul paiement. Enregistrer quand même ?`)) return;
      bouton.disabled = true;
      const { data: fin, error } = await client.rpc("admin_activer", {
        p_user: a.user_id, p_mois: mois || null, p_jusqu_au: mois ? null : jusqua,
        p_montant: montant === "" ? null : Math.round(Number(montant)), p_moyen: v("moyen") || null, p_note: v("note") || null
      });
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      const texte = `Bonjour ${a.prenom},\n\nVotre abonnement à l'espace abonnés des Cours Sésame et SAJ est activé jusqu'au ${dateFr(fin)}.\nConnectez-vous ici : ${URL_ESPACE}\n\nBonne préparation !`;
      retours[a.user_id] = `<div class="ad-retour"><p>Abonnement de ${esc(a.prenom)} actif jusqu'au <b>${dateFr(fin)}</b>.</p><a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), texte)}" target="_blank" rel="noopener">${icone("i-wa")}Prévenir ${esc(a.prenom)} sur WhatsApp</a></div>`;
      recharger("Abonnement enregistré.");
      return;
    }

    if (f.dataset.form === "note") {
      const a = abonnes.find(x => x.user_id === f.closest(".ad-ligne").dataset.uid);
      const note = v("note");
      bouton.disabled = true;
      const { error } = note ? await client.from("notes_abonnes").upsert({ user_id: a.user_id, note, maj_le: new Date().toISOString() })
        : await client.from("notes_abonnes").delete().eq("user_id", a.user_id);
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      recharger(note ? "Note enregistrée." : "Note effacée.");
      return;
    }

    if (f.id === "adAgentReglages") {
      const nb = n => Number(v(n));
      const maj = { actif: f.elements.actif.checked, modele: v("modele"), quota_jour: nb("quota_jour"), quota_mois: nb("quota_mois"), plafond_mois_fcfa: nb("plafond_mois_fcfa"),
        prix_entree_usd: nb("prix_entree_usd"), prix_sortie_usd: nb("prix_sortie_usd"), prix_cache_usd: nb("prix_cache_usd"), taux_fcfa: nb("taux_fcfa"), maj_le: new Date().toISOString() };
      if (Object.values(maj).some(x => typeof x === "number" && !(x >= 0))) { msg.textContent = "Vérifiez les nombres saisis."; return; }
      if (maj.actif && !CONSIGNES.every(([k]) => agentConsignes.has(k))) { msg.textContent = "Enregistrez d'abord les quatre consignes."; return; }
      bouton.disabled = true;
      const { error } = await client.from("agent_reglages").update(maj).eq("id", true);
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      f.closest("details").open = false;
      recharger(maj.actif ? "Réglages enregistrés. L'agent est ouvert aux abonnés." : "Réglages enregistrés.");
      return;
    }

    if (f.dataset.form === "consigne") {
      const texte = f.elements.texte.value.trim();
      if (texte.length < 50) { msg.textContent = "Le texte est trop court."; return; }
      bouton.disabled = true;
      const { error } = await client.from("agent_consignes").upsert({ cle: f.dataset.cle, texte, maj_le: new Date().toISOString() });
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      f.closest("details").open = false;
      recharger("Méthode enregistrée.");
      return;
    }

    if (f.id === "adBlanc") {
      const debut = v("debut"), duree = Number(v("duree"));
      if (v("titre").length < 3) { msg.textContent = "Indiquez un titre."; return; }
      if (!debut) { msg.textContent = "Indiquez la date et l'heure du début."; return; }
      if (!(duree >= 30 && duree <= 600)) { msg.textContent = "La durée va de 30 à 600 minutes."; return; }
      if (v("sujet").length < 10) { msg.textContent = "Collez le sujet complet."; return; }
      // Heure d'Abidjan = temps universel
      const debutIso = new Date(debut + ":00Z").toISOString();
      if (new Date(debutIso) < new Date()) { msg.textContent = "Le début doit être dans le futur."; return; }
      bouton.disabled = true;
      const { error } = await client.from("concours_blancs").insert({ titre: v("titre"), exercice: v("exercice"), matiere: v("matiere"), sujet: v("sujet"), debut: debutIso, duree_minutes: duree, publie: f.elements.publie.checked });
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      recharger(f.elements.publie.checked ? "Concours blanc publié." : "Concours blanc enregistré en brouillon.");
      return;
    }

    if (f.id === "adAnnonce") {
      const texte = v("texte"), lien = v("lien");
      if (texte.length < 2) { msg.textContent = "Écrivez l'annonce."; return; }
      if (lien && !lienSur(lien)) { msg.textContent = "Le lien doit commencer par https://"; return; }
      if (v("fin") && v("fin") < (v("debut") || auj())) { msg.textContent = "La date de fin précède la date de début."; return; }
      bouton.disabled = true;
      const { error } = await client.from("annonces").insert({ texte, lien: lien || null, debut: v("debut") || auj(), fin: v("fin") || null });
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      recharger("Annonce publiée.");
      return;
    }

    if (f.id === "adCommande") {
      const t = totalCommande(f);
      if (v("client").length < 1) { msg.textContent = "Indiquez le nom du client."; return; }
      if (!t.lignes.length) { msg.textContent = "Choisissez au moins un ouvrage."; return; }
      const montant = v("montant") === "" ? t.total : Math.max(0, Math.round(Number(v("montant"))));
      bouton.disabled = true;
      const { error } = await client.from("commandes").insert({ client: v("client"), telephone: v("telephone") || null, ville: v("ville") || null,
        lignes: t.lignes, montant, moyen: v("moyen") || null, statut: v("statut") || "nouvelle", note: v("note") || null, cree_par: moi.id });
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      recharger("Commande enregistrée.");
      return;
    }

    if (f.dataset.form === "pages") {
      const c = contenus.find(x => String(x.id) === f.closest(".ad-ligne").dataset.cid);
      if (c) await telechargerPages(c, v("pages"), f, msg, bouton);
      return;
    }

    if (f.dataset.form === "modifier") {
      const c = contenus.find(x => String(x.id) === f.closest(".ad-ligne").dataset.cid);
      const maj = { titre: v("titre"), matiere: v("matiere") || null, description: v("description") || null, concours: coches() };
      if (v("publie_le")) maj.publie_le = new Date(v("publie_le")).toISOString();
      if (c.type === "texte") maj.texte = f.elements.texte.value;
      if (c.type === "lien") { maj.lien = v("lien"); if (!lienSur(maj.lien)) { msg.textContent = "L'adresse doit commencer par https://"; return; } }
      if (maj.titre.length < 2) { msg.textContent = "Indiquez un titre."; return; }
      bouton.disabled = true;
      const { error } = await client.from("contenus").update(maj).eq("id", c.id);
      bouton.disabled = false;
      if (error) { msg.textContent = messageErreur(error); return; }
      recharger("Contenu modifié.");
      return;
    }

    if (f.id === "adNouveau") {
      const type = v("type"), titre = v("titre");
      const ligne = { titre, type, matiere: v("matiere") || null, description: v("description") || null, concours: coches(), publie: f.elements.publie.checked };
      if (v("publie_le")) ligne.publie_le = new Date(v("publie_le")).toISOString();
      if (titre.length < 2) { msg.textContent = "Indiquez un titre."; f.elements.titre.focus(); return; }
      let fichier = null;
      if (type === "video" || type === "pdf") {
        fichier = f.elements.fichier.files[0];
        if (!fichier) { msg.textContent = "Choisissez le fichier à déposer."; return; }
        const ext = (fichier.name.split(".").pop() || "").toLowerCase();
        const mime = fichier.type || { mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf" }[ext] || "";
        if (type === "pdf" ? mime !== "application/pdf" : !/^video\/(mp4|webm)$/.test(mime)) { msg.textContent = type === "pdf" ? "Le fichier doit être un PDF." : "La vidéo doit être au format MP4."; return; }
        if (fichier.size > TAILLE_MAX) { msg.textContent = `Fichier trop lourd (${Math.round(fichier.size / 1048576)} Mo) : 50 Mo au plus. Compressez-le d'abord.`; return; }
        const slug = (window.SESAME ? window.SESAME.slugify(titre) : "contenu").slice(0, 60) || "contenu";
        ligne.fichier = `${type === "video" ? "videos" : "documents"}/${auj().slice(0, 4)}/${Date.now()}-${slug}.${EXTENSIONS[mime]}`;
        bouton.disabled = true;
        msg.textContent = `Envoi du fichier (${Math.max(1, Math.round(fichier.size / 1048576))} Mo)… Gardez cette page ouverte.`;
        const { error } = await client.storage.from("exclusif").upload(ligne.fichier, fichier, { contentType: mime, upsert: false, cacheControl: "3600" });
        if (error) { bouton.disabled = false; msg.textContent = "Envoi impossible : " + messageErreur(error); return; }
      } else if (type === "texte") {
        ligne.texte = f.elements.texte.value;
        if (ligne.texte.trim().length < 10) { msg.textContent = "Écrivez le texte de la fiche."; return; }
      } else {
        ligne.lien = v("lien");
        if (!lienSur(ligne.lien)) { msg.textContent = "L'adresse doit commencer par https://"; return; }
      }
      bouton.disabled = true;
      const { error } = await client.from("contenus").insert(ligne);
      bouton.disabled = false;
      if (error) {
        if (ligne.fichier) await client.storage.from("exclusif").remove([ligne.fichier]);
        msg.textContent = messageErreur(error);
        return;
      }
      recharger(ligne.publie ? "Contenu ajouté et publié." : "Contenu ajouté en brouillon.");
    }
  });

  client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && moi) { moi = null; debrancherDirect(); connexion(); } });
  demarrer();
})();
