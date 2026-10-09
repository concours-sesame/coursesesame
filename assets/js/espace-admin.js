/* Administration de l'espace abonnés : activation des abonnements après paiement, relances WhatsApp,
   mots de passe provisoires, ajout et publication des contenus exclusifs, suivi des paiements.
   Réservée aux comptes inscrits dans la table « admins » : la base refuse toute autre demande. */
(function () {
  "use strict";
  const racine = document.querySelector("#admin");
  if (!racine) return;
  const E = window.Espace;
  if (!E || !E.OUVERT) { racine.innerHTML = `<div class="ea-carte-info"><h3>L'espace abonnés n'est pas encore configuré.</h3></div>`; return; }
  const { client, esc, dateFr, auj, joursJusqua, fcfa, numeroWa, lienWa, TYPES, CONC, nomConcours, icone, messageErreur, erreurFonction, toast, ouvrirContenu, lienSur } = E;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ROOT = document.body.dataset.root || "";
  const URL_ESPACE = new URL(ROOT + "espace-abonnes/", location.href).href;
  const MOYENS = ["Orange Money", "MTN MoMo", "Wave", "Moov Money", "Espèces", "Autre"];
  const DUREES = [[1, "1 mois"], [2, "2 mois"], [3, "3 mois"], [6, "6 mois"], [12, "12 mois"], [0, "Jusqu'à une date…"]];
  const MATIERES = ["Droit civil", "Droit pénal", "Procédure pénale", "Droit administratif", "Droit commercial OHADA", "Organisation judiciaire", "Droits de l'enfant", "SOG", "Méthodologie", "Culture générale"];
  const EXTENSIONS = { "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf" };
  const TAILLE_MAX = 50 * 1024 * 1024;

  let moi = null, abonnes = [], paiements = [], contenus = [];
  let onglet = "abonnes", filtre = "tous", recherche = "";
  const retours = {}; // messages affichés sous une ligne après une action (par compte ou contenu)

  /* ---------- Outils ---------- */
  const lendemain = d => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  function statut(a) {
    if (a.actif) {
      const j = joursJusqua(a.fin);
      return j <= 7 ? { cle: "bientot", texte: `Fin le ${dateFr(a.fin)}` } : { cle: "actif", texte: `Actif jusqu'au ${dateFr(a.fin)}` };
    }
    if (a.fin) return { cle: "expire", texte: `Terminé le ${dateFr(a.fin)}` };
    return { cle: "attente", texte: "En attente d'activation" };
  }
  const FILTRES = [["tous", "Tous", () => true], ["attente", "En attente", a => statut(a).cle === "attente"], ["actif", "Actifs", a => a.actif],
    ["bientot", "Fin sous 7 jours", a => statut(a).cle === "bientot"], ["expire", "Terminés", a => statut(a).cle === "expire"]];
  function messageRelance(a) {
    const s = statut(a).cle, debut = `Bonjour ${a.prenom},\n\n`;
    const payer = "réglez votre abonnement par Mobile Money (Orange Money, MTN MoMo, Wave ou Moov Money) et envoyez-nous la référence du paiement.";
    if (s === "attente") return `${debut}Votre compte sur l'espace abonnés des Cours Sésame et SAJ est prêt. Pour l'activer, ${payer}\n\n${URL_ESPACE}`;
    if (s === "bientot") return `${debut}Votre abonnement à l'espace abonnés des Cours Sésame et SAJ prend fin le ${dateFr(a.fin)}. Pour le renouveler, ${payer}`;
    if (s === "expire") return `${debut}Votre abonnement à l'espace abonnés des Cours Sésame et SAJ a pris fin le ${dateFr(a.fin)}. Pour retrouver l'accès, ${payer}`;
    return debut;
  }
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
    try { await toutCharger(); afficher(); } catch (e) {
      racine.innerHTML = `<div class="ea-carte-info"><h3>Chargement impossible.</h3><p>${esc(messageErreur(e))}</p><button class="btn btn-navy" type="button" data-action="recharger">Réessayer</button></div>`;
    }
    racine.removeAttribute("aria-busy");
  }
  async function toutCharger() {
    const [a, p, c] = await Promise.all([
      client.rpc("admin_liste_abonnes"),
      client.rpc("admin_paiements"),
      client.from("contenus").select("*").order("publie_le", { ascending: false })
    ]);
    const err = a.error || p.error || c.error;
    if (err) throw err;
    abonnes = a.data; paiements = p.data; contenus = c.data;
  }

  /* ---------- Affichage ---------- */
  function afficher() {
    const actifs = abonnes.filter(a => a.actif).length;
    const attente = abonnes.filter(a => statut(a).cle === "attente").length;
    const bientot = abonnes.filter(a => statut(a).cle === "bientot").length;
    racine.innerHTML = `<div class="ea-compte">
        <span>Administration · <b>${esc(moi.email)}</b></span>
        <div class="ea-compte-actions"><a class="btn btn-ghost btn-sm" href="../">Voir l'espace abonnés</a><button class="btn btn-ghost btn-sm" type="button" data-action="sortir">Se déconnecter</button></div>
      </div>
      <div class="ad-stats">
        <div><b>${actifs}</b><span>Abonnés actifs</span></div>
        <div><b>${attente}</b><span>En attente d'activation</span></div>
        <div><b>${bientot}</b><span>Fin sous 7 jours</span></div>
        <div><b>${fcfa(encaisseCeMois())}</b><span>Encaissé ce mois-ci</span></div>
      </div>
      <div class="ea-onglets ad-onglets" role="tablist" aria-label="Administration">
        ${[["abonnes", `Abonnés (${abonnes.length})`], ["contenus", `Contenus (${contenus.length})`], ["paiements", "Paiements"]].map(([v, l]) => `<button type="button" role="tab" data-onglet="${v}" aria-selected="${onglet === v}">${l}</button>`).join("")}
      </div>
      <div id="adPanneau">${onglet === "abonnes" ? panneauAbonnes() : onglet === "contenus" ? panneauContenus() : panneauPaiements()}</div>`;
  }

  function panneauAbonnes() {
    const q = recherche.toLowerCase().replace(/\s+/g, "");
    const test = (FILTRES.find(f => f[0] === filtre) || FILTRES[0])[2];
    const liste = abonnes.filter(test).filter(a => !q || `${a.prenom}${a.nom}${a.telephone}${a.email}`.toLowerCase().replace(/\s+/g, "").includes(q));
    return `<div class="ad-outils">
        <label class="search"><span class="sr-only">Rechercher un abonné</span>${icone("i-search")}<input type="search" id="adRecherche" placeholder="Nom, numéro ou e-mail" value="${esc(recherche)}" autocomplete="off"></label>
        <div class="chips" role="group" aria-label="Filtrer les abonnés">${FILTRES.map(([v, l, f]) => `<button class="chip" type="button" data-filtre="${v}" aria-pressed="${filtre === v}">${l}<span class="n">${abonnes.filter(f).length}</span></button>`).join("")}</div>
      </div>
      <div class="ad-liste">${liste.length ? liste.map(ligneAbonne).join("") : `<p class="ea-vide">Aucun compte ${abonnes.length ? "ne correspond." : "pour le moment. Les comptes créés sur l'espace abonnés apparaîtront ici."}</p>`}</div>`;
  }
  function ligneAbonne(a) {
    const s = statut(a);
    const retour = retours[a.user_id] || "";
    return `<article class="ad-ligne" data-uid="${esc(a.user_id)}">
        <div class="ad-ident">
          <div class="ad-nom"><b>${esc(a.prenom)} ${esc(a.nom)}</b><span class="ad-badge ad-${s.cle}">${esc(s.texte)}</span></div>
          <small><a href="https://wa.me/${numeroWa(a.telephone)}" target="_blank" rel="noopener">${esc(a.telephone)}</a> · ${esc(a.email)}${a.concours ? " · " + esc(nomConcours(a.concours)) : ""} · inscrit le ${dateFr(a.inscrit_le)}${Number(a.nb_paiements) ? ` · ${a.nb_paiements} paiement${a.nb_paiements > 1 ? "s" : ""}, ${fcfa(a.total_paye)}` : ""}</small>
        </div>
        <div class="ad-actions">
          <button class="btn btn-navy btn-sm" type="button" data-action="activer">${a.actif ? "Prolonger" : "Activer"}</button>
          ${a.actif ? `<button class="btn btn-ghost btn-sm" type="button" data-action="couper">Couper l'accès</button>` : ""}
          <a class="btn btn-wa btn-sm" href="${lienWa(numeroWa(a.telephone), messageRelance(a))}" target="_blank" rel="noopener">${icone("i-wa")}${["attente", "bientot", "expire"].includes(s.cle) ? "Relancer" : "Écrire"}</a>
          <button class="btn btn-ghost btn-sm" type="button" data-action="mdp">Mot de passe</button>
          ${Number(a.nb_paiements) ? `<button class="btn btn-ghost btn-sm" type="button" data-action="historique">Historique</button>` : ""}
        </div>
        <div class="ad-zone"${retour ? "" : " hidden"}>${retour}</div>
      </article>`;
  }
  function formulaireActivation(a) {
    const debut = a.actif ? lendemain(a.fin) : auj();
    return `<form class="form ad-form" data-form="activer" novalidate>
        <p class="ad-note full">${a.actif ? `La prolongation commence le ${dateFr(debut)}, à la suite de l'abonnement en cours.` : "L'abonnement commence aujourd'hui."}</p>
        <div class="field"><label>Durée</label><select name="mois">${DUREES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
        <div class="field" data-jusqua hidden><label>Jusqu'au (inclus)</label><input type="date" name="jusqua" min="${debut}"></div>
        <div class="field"><label>Montant reçu (FCFA)</label><input type="number" name="montant" min="0" step="50" inputmode="numeric"></div>
        <div class="field"><label>Moyen de paiement</label><select name="moyen">${MOYENS.map(m => `<option>${m}</option>`).join("")}</select></div>
        <div class="field full"><label>Note (référence du paiement…)</label><input name="note" maxlength="300"></div>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold" type="submit">Valider ${a.actif ? "la prolongation" : "l'activation"}</button>
      </form>`;
  }
  function historique(uid) {
    const p = paiements.filter(x => x.user_id === uid);
    return `<ul class="ad-histo">${p.map(x => `<li><b>${x.montant != null ? fcfa(x.montant) : "Sans montant"}</b> · du ${dateFr(x.debut)} au ${dateFr(x.fin)}${x.moyen ? " · " + esc(x.moyen) : ""}<small>Enregistré le ${dateFr(x.cree_le)}${x.note ? " · " + esc(x.note) : ""}</small></li>`).join("")}</ul>`;
  }

  function panneauContenus() {
    const coches = CONC.map(c => `<label><input type="checkbox" name="concours" value="${c.id}"> ${esc(c.court)}</label>`).join("");
    return `<details class="ad-ajout"${contenus.length ? "" : " open"}>
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
          <label class="ea-accord full"><input type="checkbox" name="publie" checked><span>Publier tout de suite (sinon, le contenu reste en brouillon, invisible des abonnés)</span></label>
          <p class="ea-msg full" role="alert"></p>
          <button class="btn btn-gold" type="submit">Ajouter le contenu</button>
        </form>
      </details>
      <div class="ad-liste">${contenus.length ? contenus.map(ligneContenu).join("") : `<p class="ea-vide">Aucun contenu pour le moment.</p>`}</div>`;
  }
  function ligneContenu(c) {
    const retour = retours["c" + c.id] || "";
    return `<article class="ad-ligne" data-cid="${c.id}">
        <div class="ad-ident">
          <div class="ad-nom"><b>${esc(c.titre)}</b><span class="ad-badge ${c.publie ? "ad-actif" : "ad-attente"}">${c.publie ? "Publié" : "Brouillon"}</span></div>
          <small>${TYPES[c.type].nom}${c.matiere ? " · " + esc(c.matiere) : ""}${(c.concours || []).length ? " · " + c.concours.map(nomConcours).join(", ") : ""} · ${dateFr(c.publie_le)}</small>
        </div>
        <div class="ad-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-caction="voir">Aperçu</button>
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
        <fieldset class="full ad-concours"><legend>Concours concernés</legend>${coches}</fieldset>
        <p class="ea-msg full" role="alert"></p>
        <button class="btn btn-gold" type="submit">Enregistrer</button>
      </form>`;
  }

  function panneauPaiements() {
    const total = paiements.reduce((s, p) => s + (p.montant || 0), 0);
    return `<div class="ad-stats ad-stats-2"><div><b>${fcfa(encaisseCeMois())}</b><span>Ce mois-ci</span></div><div><b>${fcfa(total)}</b><span>Depuis l'ouverture</span></div></div>
      ${paiements.length ? `<div class="ad-tableau" role="region" aria-label="Paiements" tabindex="0"><table>
        <thead><tr><th>Enregistré le</th><th>Abonné</th><th>Période</th><th>Montant</th><th>Moyen</th><th>Note</th></tr></thead>
        <tbody>${paiements.map(p => `<tr><td>${dateFr(p.cree_le)}</td><td>${esc(p.prenom)} ${esc(p.nom)}</td><td>du ${dateFr(p.debut)} au ${dateFr(p.fin)}</td><td>${p.montant != null ? fcfa(p.montant) : ""}</td><td>${esc(p.moyen || "")}</td><td>${esc(p.note || "")}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="ea-vide">Aucun paiement enregistré pour le moment.</p>`}`;
  }

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
    const b = e.target.closest("button[data-action], button[data-caction], button[data-onglet], button[data-filtre]");
    if (!b) return;
    if (b.dataset.onglet) { onglet = b.dataset.onglet; afficher(); return; }
    if (b.dataset.filtre) { filtre = b.dataset.filtre; $("#adPanneau").innerHTML = panneauAbonnes(); return; }
    const act = b.dataset.action;
    if (act === "sortir") { await client.auth.signOut(); connexion(); return; }
    if (act === "recharger") { demarrer(); return; }
    const ligne = b.closest(".ad-ligne");
    if (act) {
      const a = abonnes.find(x => x.user_id === ligne.dataset.uid);
      if (!a) return;
      delete retours[a.user_id];
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
    if (e.target.id === "adRecherche") {
      recherche = e.target.value;
      const pos = e.target.selectionStart;
      $("#adPanneau").innerHTML = panneauAbonnes();
      const champ = $("#adRecherche");
      champ.focus();
      champ.setSelectionRange(pos, pos);
    }
  });
  racine.addEventListener("change", e => {
    const f = e.target.form;
    if (!f) return;
    if (e.target.name === "mois") $("[data-jusqua]", f).hidden = e.target.value !== "0";
    if (e.target.id === "nType") $$("[data-pour]", f).forEach(x => { x.hidden = !x.dataset.pour.split(" ").includes(e.target.value); });
  });

  racine.addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, msg = $(".ea-msg", f), bouton = $("button[type=submit]", f);
    const v = n => (f.elements[n] ? f.elements[n].value.trim() : "");
    const coches = () => $$("input[name=concours]:checked", f).map(x => x.value);
    msg.textContent = "";

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
      const mois = Number(v("mois")), jusqua = v("jusqua"), montant = v("montant");
      if (!mois && !jusqua) { msg.textContent = "Choisissez la date de fin."; return; }
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

    if (f.dataset.form === "modifier") {
      const c = contenus.find(x => String(x.id) === f.closest(".ad-ligne").dataset.cid);
      const maj = { titre: v("titre"), matiere: v("matiere") || null, description: v("description") || null, concours: coches() };
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

  client.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && moi) { moi = null; connexion(); } });
  demarrer();
})();
