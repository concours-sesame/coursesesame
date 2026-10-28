# Plan Facebook des semaines 2 à 14 (4 novembre 2026 au 27 janvier 2027) : deux posts par jour, 7 h 30 et 19 h 30.
# Chaque texte est tiré d'un contenu déjà vérifié du site : scripts des vidéos (tools/videos/scripts), QCM par matière,
# sujets corrigés, fiches des ouvrages, épreuves des concours blancs (fichier exporté de la base), règles de méthode de
# l'éditeur. Usage : python3 tools/facebook/plan.py <donnees.json> <sortie.json>
# donnees.json = { qcm: [...], sujets: [...], ouvrages: [...], videos: [...], sog: [...] } (préparé depuis le site et la base)
import json, re, sys, datetime

D = json.load(open(sys.argv[1]))
QCM = {m["slug"]: m for m in D["qcm"]}
SUJETS = {s["adresse"]: s for s in D["sujets"]}
OUVR = {o["t"]: o for o in D["ouvrages"]}
VID = {v["fichier"]: v for v in D["videos"]}
SOG = {(s["concours"], s["serie"]): s for s in D["sog"]}
SCRIPTS = "tools/videos/scripts/"
SITE = "https://coursesesame.com/"
SIGNE = "Les Cours Sésame et SAJ"
WA = "Commande sur WhatsApp : +225 01 60 86 05 37"

NOMS_CONC = {"magistrature": "Magistrature", "greffe_cs": "Greffe, cycle supérieur", "greffe_cms": "Greffe, cycle moyen supérieur",
  "greffe_cm": "Greffe, cycle moyen", "penitentiaire_cs": "Pénitentiaire, cycle supérieur", "penitentiaire_cms": "Pénitentiaire, cycle moyen supérieur",
  "penitentiaire_cm": "Pénitentiaire, cycle moyen", "eppjej_cs": "EPPJEJ, cycle supérieur", "eppjej_cms": "EPPJEJ, cycle moyen supérieur",
  "eppjej_cm": "EPPJEJ, cycle moyen", "ena_cs": "ENA, cycle supérieur", "ena_cms": "ENA, cycle moyen supérieur", "ena_cm": "ENA, cycle moyen"}
CONC_TAG = {"magistrature": ["infj"], "greffe": ["greffe"], "penitentiaire": ["penitentiaire"], "eppjej": ["eppjej"], "ena": ["ena"]}
TOUS = ["infj", "greffe", "penitentiaire", "eppjej", "ena"]

def net(t):
    return re.sub(r"\*(.+?)\*", r"\1", t)

def minus(t):
    # Minuscule initiale, sauf sigle
    return t if re.match(r"^[A-Z]{2,}", t) else t[0].lower() + t[1:]

def script(nom):
    return json.load(open(SCRIPTS + nom + ".json"))

def rub(d):
    return {"Droit commercial OHADA": "droit commercial OHADA", "Droit OHADA": "droit OHADA"}.get(d["rubrique"], minus(d["rubrique"]))

def scene(d, typ):
    return [s for s in d["scenes"] if s["type"] == typ]

# Après les deux-points, minuscule, sauf pour un nom propre (relevé dans les scripts : mot à majuscule en milieu de
# phrase), un sigle, ou Mme et M.
def _noms():
    import glob
    noms = set()
    for f in glob.glob(SCRIPTS + "*.json"):
        texte = json.dumps(json.load(open(f)), ensure_ascii=False)
        for m in re.finditer(r"[a-zà-ÿ,] ([A-ZÀ-Ý][a-zà-ÿ]+)", texte):
            noms.add(m.group(1))
    return noms
NOMS = _noms()
def suite(t):
    m = re.match(r"([A-Za-zÀ-ÿ.]+)", t)
    if not m or m.group(1) in NOMS or m.group(1) in ("Mme", "M.") or re.match(r"^[A-Z]{2,}", t):
        return t
    return minus(t)

def item(it):
    if not it.get("d"):
        return it["t"]
    return f"{it['t']} {suite(it['d'])}" if it["t"].endswith("?") else f"{it['t']} : {suite(it['d'])}"

# ---------- Notions et pièges, d'après les scripts vérifiés des vidéos ----------
def notion(nom):
    d = script(nom)
    out = [f"Une notion de {rub(d)} : {minus(d['titre'])}"]
    out[0] += "" if out[0].endswith("?") else "."
    for s in d["scenes"]:
        t = s["type"]
        if t in ("intro", "outro"):
            continue
        dit = " ".join(net(x) for x in s["dit"])
        if t == "question":
            out.append(dit)
        elif t == "article":
            out.append(dit)
            if s.get("citation"):
                out.append("Le texte : « " + s["citation"].strip("« »") + " »")
        elif t == "etapes":
            out.append("\n".join(f"{i + 1}. {item(it)}" for i, it in enumerate(s["items"])))
        elif t in ("blocs", "cas"):
            out.append("\n".join("• " + item(it) for it in s["items"]))
        elif t == "piege":
            out.append(dit)
    out.append(SIGNE)
    pts = (scene(d, "etapes") or scene(d, "blocs"))[0]["items"][:3]
    art = scene(d, "article")
    v = {"fond": "navy", "etiquette": f"Une notion de {rub(d)}", "titre": d["titre"],
         "points": [[it["t"], it.get("d") or ""] for it in pts], "pied": art[0].get("titre") if art and art[0].get("titre") else d["rubrique"]}
    return {"rubrique": "Une notion de droit", "titre": "Notion : " + minus(d["titre"]), "message": "\n\n".join(out), "visuel": v}

def piege(nom):
    d = script(nom)
    p = scene(d, "piege")[0]
    out = [f"Le piège des concours, en {rub(d)} : {minus(d['titre'])}" + ("" if d["titre"].endswith("?") else ".")]
    for typ in ("question", "article"):
        for sc in scene(d, typ)[:1]:
            out.append(" ".join(net(x) for x in sc["dit"]))
    out.append(" ".join(net(x) for x in p["dit"]))
    out.append(SIGNE)
    its = p.get("items", [])
    v = {"fond": "navy", "etiquette": "Le piège des concours", "titre": its[0]["t"] if its else d["titre"],
         "sous": its[0].get("d") if its else None, "pied": d["titre"]}
    if len(its) > 1:
        v["points"] = [[it["t"], it.get("d") or ""] for it in its[1:3]]
    return {"rubrique": "Le piège des concours", "titre": "Piège : " + minus(d["titre"]), "message": "\n\n".join(out), "visuel": v}

# ---------- QCM ----------
def sans_source(t):
    return re.sub(r"\s*Source : [^.]*\.?$", "", t).strip()

def qcm(slug, i):
    m = QCM[slug]; q = m["questions"][i]
    lettres = "ABCD"
    opts = "\n".join(f"{lettres[k]}. {o}" for k, o in enumerate(q["options"]))
    matin = {"rubrique": "QCM du jour", "titre": "QCM : " + q["q"][:70],
             "message": f"QCM du jour, {minus(m['nom'])}.\n\n{q['q']}\n\n{opts}\n\nDonnez votre réponse en commentaire. La correction arrive ce soir à 19 h 30.\n\n{SIGNE}",
             "visuel": {"fond": "navy", "etiquette": f"QCM du jour, {minus(m['nom'])}", "titre": q["q"], "options": q["options"], "pied": "Réponse ce soir à 19 h 30"}}
    b = q["bonne"]
    soir = {"rubrique": "Correction du QCM", "titre": "Correction du QCM : " + q["q"][:60],
            "message": f"Correction du QCM de ce matin : la bonne réponse est la {lettres[b]}, « {q['options'][b]} ».\n\n{sans_source(q['explication'])}\n\nTestez-vous sur les dix questions du QCM gratuit « {m['nom']} », avec la correction expliquée de chaque réponse :",
            "lien": f"{SITE}qcm/{slug}/",
            "visuel": {"fond": "cream", "etiquette": "Correction du QCM de ce matin", "titre": f"Réponse {lettres[b]} : {q['options'][b]}",
                       "points": [["L'explication", sans_source(q["explication"])]], "pied": f"Dix questions gratuites : coursesesame.com/qcm/{slug}"}}
    return matin, soir

def point(slug, i):
    m = QCM[slug]; q = m["questions"][i]; b = q["bonne"]
    lib = "culture générale" if slug == "culture-generale" else minus(m["nom"])
    return {"rubrique": "Une notion de droit" if slug != "culture-generale" else "Culture générale", "titre": "Le point : " + q["q"][:70],
            "message": f"Le point du jour, {lib}.\n\n{q['q']}\n\nRéponse : {suite(q['options'][b])}" + ("" if q["options"][b].endswith((".", "?")) else ".") + f"\n\n{sans_source(q['explication'])}\n\nPour aller plus loin, le QCM gratuit « {m['nom']} », avec la correction de chaque réponse :",
            "lien": f"{SITE}qcm/{slug}/",
            "visuel": {"fond": "navy", "etiquette": f"Le point du jour, {lib}", "titre": q["q"], "points": [["La réponse", q["options"][b]]], "pied": f"coursesesame.com/qcm/{slug}"}}

# ---------- Vidéos gratuites ----------
def video(f):
    v = VID[f]
    entete = {"Une notion, une minute": f"Une notion, une minute : {minus(v['titre'])}", "Un article, une minute": f"Un article, une minute : {minus(v['titre'])}",
              "Annales décryptées": f"Annales décryptées : {v['titre']}", "Nos ouvrages": f"Nos ouvrages en vidéo : {v['titre']}",
              "Présentation": "Découvrez Les Cours Sésame et SAJ en vidéo"}[v["tag"]]
    entete += "" if entete.endswith("?") else "."
    return {"rubrique": "Vidéo", "titre": "Vidéo : " + minus(v["titre"]),
            "message": f"{entete}\n\n{v['desc']}\n\nToutes nos vidéos gratuites sont sur le site : {SITE}#videos\n\n{SIGNE}",
            "video": f"{SITE}assets/video/{f}.mp4", "video_titre": f"{v['tag']} : {v['titre']}"}

# ---------- SOG du week-end (concours blancs) ----------
def sog(conc, serie):
    s = SOG[(conc, serie)]
    lignes = [l for l in s["sujet"].split("\n") if l.strip()]
    nom = NOMS_CONC[conc]
    return {"rubrique": "Sujet de SOG", "titre": f"SOG : {nom}, série {serie}",
            "message": f"Le sujet de SOG du week-end, tiré de nos concours blancs ({nom}, série {serie}) :\n\n" + "\n".join(lignes) +
                       "\n\nAvant de composer, prenez vingt minutes : relevez les termes clés, identifiez le type de sujet, puis formulez le problème qu'il soulève."
                       "\n\nComposez-le gratuitement, en 4 heures, chronomètre lancé. Le corrigé-type et la grille de notation sur 20 sont réservés aux abonnés, dès 2 000 FCFA la semaine :",
            "lien": f"{SITE}concours-blancs/",
            "visuel": {"fond": "navy", "etiquette": "Le sujet de SOG du week-end", "titre": lignes[0], "sous": " ".join(lignes[1:]) or None,
                       "pied": f"Concours blanc, {nom}, série {serie}"}}

# ---------- Sujets corrigés du site ----------
def sujet(a):
    s = SUJETS[a]
    ses = f" ({s['session']})" if s.get("session") else ""
    acces = ("Le début du corrigé est en accès libre ; le corrigé intégral est réservé aux abonnés :" if s.get("reserve")
             else "À lire en accès libre :")
    return {"rubrique": "Sujet corrigé", "titre": "Sujet corrigé : " + s["titre"][:80],
            "message": f"Un sujet corrigé pour votre week-end : {s['titre']}{ses}.\n\n{s['epreuve']}, {minus(s['matiere'])}. {s['resume']}\n\n{acces}",
            "lien": f"{SITE}sujets/{a}/"}

# ---------- Ouvrages ----------
def ouvrage(t, premier):
    o = OUVR[t]
    intro = f"L'ouvrage de la semaine : {t}." if premier else f"À découvrir aussi : {t}."
    l = [intro, o["d"], f"Prix : {o['p']} FCFA." + (" Version numérique uniquement." if o["num"] else "")]
    extra = []
    if o["extrait"]:
        extra.append("Un extrait gratuit est à lire sur la page de l'ouvrage.")
    if o["abo"]:
        extra.append("Il est aussi compris dans l'espace VIP de l'espace abonnés.")
    if extra:
        l.append(" ".join(extra))
    l += [WA, "La page de l'ouvrage :"]
    return {"rubrique": "Ouvrage", "titre": "Ouvrage : " + t, "message": "\n\n".join(l), "lien": f"{SITE}ouvrages/{o['slug']}/"}

# ---------- Concours blancs ----------
CYCLES = {
  "greffe": ("Greffe : 15 séries de concours blancs", [
    ("Administrateurs, cycle supérieur", "SOG (4 h), organisation judiciaire (2 h), droit administratif (3 h), droit civil (3 h), informatique et bureautique (2 h)"),
    ("Attachés, cycle moyen supérieur", "SOG (4 h), organisation politique, administrative et judiciaire (3 h), droit administratif (3 h), informatique et bureautique (2 h)"),
    ("Secrétaires, cycle moyen", "SOG (4 h), organisation judiciaire (3 h), organisation politique, économique et administrative (3 h), informatique et bureautique (2 h)")]),
  "penitentiaire": ("Pénitentiaire : 15 séries de concours blancs", [
    ("Administrateurs, cycle supérieur", "SOG (4 h), droit pénal (3 h), droit pénitentiaire (3 h), organisation judiciaire (2 h)"),
    ("Attachés, cycle moyen supérieur", "SOG (4 h), droit pénitentiaire (3 h), organisation politique, administrative et judiciaire (3 h), informatique et bureautique (2 h)"),
    ("Agents d'encadrement, cycle moyen", "administration pénitentiaire (2 h), étude de texte (3 h), organisation politique, économique et administrative (3 h), informatique et bureautique (2 h)")]),
  "eppjej": ("EPPJEJ : 15 séries de concours blancs", [
    ("Cycle supérieur", "SOG (4 h), droits de l'enfant (3 h), organisation judiciaire (2 h), statut et déontologie de la fonction publique (2 h), informatique et bureautique (2 h)"),
    ("Cycle moyen supérieur", "SOG (4 h), droits de l'enfant (3 h), organisation politique, administrative et judiciaire (3 h), informatique et bureautique (2 h)"),
    ("Cycle moyen", "SOG (4 h), droits de l'enfant (3 h), organisation politique, économique et administrative (3 h), informatique et bureautique (2 h)")]),
  "ena": ("ENA : 15 séries de concours blancs", [
    ("Cycle supérieur", "présélection en vrai ou faux (2 h), note de synthèse (5 h), SOG (4 h), problèmes économiques et sociaux (3 h), droit administratif (3 h)"),
    ("Cycle moyen supérieur", "présélection en vrai ou faux (2 h), SOG (4 h), problèmes économiques et sociaux (3 h), droit constitutionnel (3 h), résumé de texte (3 h)"),
    ("Cycle moyen", "présélection en vrai ou faux (2 h), SOG (4 h), connaissance du monde contemporain en QCM (2 h)")]),
}
def blancs(famille, bis=False):
    if famille == "magistrature":
        msg = ("Concours de la magistrature : " + ("vous avez composé ? Il reste encore des séries à faire. " if bis else "") +
               "10 séries complètes de concours blancs, gratuites.\n\nChaque série suit le concours direct : la présélection en 2 heures, puis cinq épreuves écrites de 4 heures (sujet d'ordre général, droit civil, droit commercial et OHADA, droit pénal et procédure pénale, droit administratif).\n\n"
               "Vous composez sans créer de compte, avec le chronomètre. Le corrigé-type et la grille de notation sur 20 sont réservés aux abonnés, dès 2 000 FCFA la semaine.\n\nChoisissez votre série :")
        v = {"fond": "navy", "etiquette": "Concours blancs gratuits", "titre": "Magistrature : 10 séries complètes",
             "etapes": [["La présélection", "En 2 heures"], ["Cinq épreuves écrites", "En 4 heures chacune"], ["Le corrigé et la grille sur 20", "Pour les abonnés, dès 2 000 FCFA la semaine"]], "pied": "coursesesame.com/concours-blancs"}
        return {"rubrique": "Concours blancs", "titre": "Concours blancs de la magistrature", "message": msg, "lien": f"{SITE}concours-blancs/", "visuel": v}
    titre, cyc = CYCLES[famille]
    msg = (titre + ", cinq par cycle, gratuites et aux durées officielles." + (" Une nouvelle semaine pour composer !" if bis else "") + "\n\n" +
           "\n".join(f"• {c} : {e}." for c, e in cyc) +
           "\n\nVous composez sans créer de compte, avec le chronomètre. Le corrigé-type et la grille de notation sur 20 sont réservés aux abonnés, dès 2 000 FCFA la semaine.\n\nChoisissez votre cycle et votre série :")
    v = {"fond": "navy", "etiquette": "Concours blancs gratuits", "titre": titre.replace(" de concours blancs", ""),
         "etapes": [[c, e[0].upper() + e[1:]] for c, e in cyc], "pied": "coursesesame.com/concours-blancs"}
    return {"rubrique": "Concours blancs", "titre": titre, "message": msg, "lien": f"{SITE}concours-blancs/", "visuel": v}

# ---------- Textes rédigés : espace abonnés, méthodes, conseils ----------
ESPACE_FIN = "Créez votre compte en une minute :"
ESPACE = [
 ("Textes officiels", "Les textes officiels, toujours sous la main",
  "Dans l'espace abonnés, plus de 50 textes officiels et décisions : la Constitution et les lois organiques, le Code pénal et le Code de procédure pénale, les lois de 2019 sur la famille, le Traité OHADA et les actes uniformes, les arrêts de la CCJA et des décisions de droit administratif.\n\nUne recherche dans le texte vous mène directement à la page qui vous intéresse. Ces textes se lisent sans limite de pages et se téléchargent en entier.",
  [["Plus de 50 textes", "Constitution, codes, lois, actes uniformes"], ["La jurisprudence", "Arrêts de la CCJA et du droit administratif"], ["La recherche", "Directement à la bonne page"]]),
 ("Corrigés des concours blancs", "Le corrigé, juste après votre copie",
  "Vous avez composé un concours blanc ? Dans l'espace abonnés, le corrigé s'ouvre dès votre copie rendue ou le temps écoulé : le corrigé-type intégral et la grille de notation sur 20 pour les épreuves écrites, les réponses justifiées et votre note pour la présélection.\n\nC'est le cas pour les 315 épreuves des cinq concours, à partir de la formule d'une semaine (2 000 FCFA).",
  [["Épreuves écrites", "Corrigé-type intégral et grille sur 20"], ["Présélection", "Réponses justifiées et note calculée"], ["315 épreuves", "Dès la formule d'une semaine"]]),
 ("Vidéos réservées", "Une notion, une minute",
  "Onze vidéos « Une notion, une minute » sont réservées aux abonnés VIP : la tentative punissable, l'immunité familiale, la récidive, la prescription de l'action publique, les vices du consentement, l'autorité parentale, les trois principes du service public, le recours pour excès de pouvoir, la police administrative, l'injonction de payer et le cautionnement.\n\nChaque vidéo cite le texte mot pour mot, avec un exemple et le piège à éviter. Elles se regardent dans l'espace VIP, dès 1 500 FCFA la journée.",
  [["Onze vidéos", "Droit pénal, civil, administratif et OHADA"], ["Le texte exact", "Cité mot pour mot"], ["Un exemple et un piège", "Dans chaque vidéo"]]),
 ("Révision du jour", "La révision du jour",
  "Chaque jour, l'espace abonnés vous propose quelques questions de QCM à travailler. Une question bien réussie revient de plus en plus tard ; une question manquée revient dès le lendemain. C'est la méthode des boîtes : vous révisez ce que vous oubliez, pas ce que vous savez déjà.",
  [["Quelques questions par jour", "Tirées des QCM de l'espace"], ["Une erreur ?", "La question revient le lendemain"], ["Une bonne réponse ?", "Elle revient plus tard"]]),
 ("Grand oral", "Le simulateur de grand oral",
  "Préparez l'oral face au jury : une question est tirée au sort, vous avez une minute de préparation, puis trois minutes pour répondre à voix haute, avec le chronomètre et l'enregistrement. Vous vous évaluez ensuite avec une grille.",
  [["Une question tirée au sort", "Comme devant le jury"], ["Une minute de préparation", "Puis trois minutes de réponse"], ["Chrono et enregistrement", "Et une grille pour vous évaluer"]]),
 ("Sujet de la semaine", "Le sujet de la semaine",
  "Chaque lundi, l'espace abonnés met en avant un nouveau sujet corrigé, le même pour tous les abonnés. Composez-le dans la semaine, puis comparez votre copie au corrigé : un rendez-vous régulier pour progresser.",
  [["Un sujet corrigé", "Le même pour tous"], ["Chaque lundi", "Un nouveau sujet"], ["Composez, puis comparez", "Au corrigé de l'espace"]]),
 ("Tableau de bord", "Votre tableau de bord",
  "Dans votre espace, le tableau de bord suit votre préparation : le nombre de jours de révision d'affilée, le compte à rebours avant votre concours, votre progression, votre planning et vos badges.",
  [["Jours d'affilée", "Votre régularité"], ["J moins combien ?", "Le compte à rebours du concours"], ["Progression et badges", "Pour garder le rythme"]]),
 ("Parrainage", "Parrainez, gagnez une semaine",
  "Chaque abonné a un code de parrainage. Quand une personne s'inscrit avec votre code puis prend son premier abonnement, vous recevez 7 jours d'accès offerts, ajoutés à la fin de votre abonnement. Une récompense par filleul.",
  [["Votre code", "Dans votre espace abonné"], ["Un filleul s'abonne", "Pour la première fois"], ["7 jours offerts", "Pour vous, à chaque filleul"]]),
 ("Ouvrages complets", "Nos ouvrages, en entier, en ligne",
  "Avec l'abonnement VIP, dès 1 500 FCFA la journée ou 15 000 FCFA le mois, vous lisez en ligne la version intégrale de nos ouvrages : guides méthodologiques, annales corrigées, résumés, cas pratiques corrigés et fiches d'arrêts, selon votre concours.",
  [["Version intégrale", "Lecture en ligne"], ["Méthodes, annales, résumés", "Selon votre concours"], ["Dès 1 500 FCFA", "L'abonnement VIP, à la journée"]]),
 ("Formules", "Une formule pour chaque besoin",
  "Les formules de l'espace abonnés :\n\n• 1 jour : 500 FCFA\n• 1 semaine : 2 000 FCFA\n• 2 semaines : 3 500 FCFA\n• 1 mois : 5 000 FCFA\n• 2 mois : 9 000 FCFA\n• 3 mois : 12 500 FCFA\n• 6 mois : 22 500 FCFA\n• 12 mois : 40 000 FCFA\n\nLes corrigés des concours blancs sont ouverts à partir d'une semaine. L'abonnement VIP, avec les ouvrages complets et les vidéos réservées, coûte le triple : de 1 500 FCFA pour un jour à 120 000 FCFA pour douze mois. La durée court à partir de l'activation, pas du paiement.",
  [["Dès 500 FCFA", "La journée"], ["Dès 2 000 FCFA", "Les corrigés des concours blancs"], ["VIP dès 1 500 FCFA", "Ouvrages complets et vidéos"]]),
 ("Bibliothèque", "Une bibliothèque rangée pour vous",
  "Votre bibliothèque est classée par concours et par rubrique : ouvrages complets, sujets corrigés, fiches de révision, QCM, vidéos, textes officiels et jurisprudence. Et quand vous rouvrez un document, la lecture reprend là où vous vous étiez arrêté.",
  [["Par concours", "Ce qui vous concerne d'abord"], ["Par rubrique", "Ouvrages, sujets, fiches, QCM, vidéos, textes"], ["Reprise de lecture", "À la page où vous étiez"]]),
 ("Tout l'espace", "Tout pour réviser, au même endroit",
  "Un résumé de l'espace abonnés : sujets corrigés, fiches de révision et QCM, révision du jour, simulateur de grand oral, sujet de la semaine, corrigés des 315 épreuves de concours blancs, textes officiels et jurisprudence, et dans l'espace VIP, nos ouvrages complets et les vidéos réservées.\n\nDès 500 FCFA la journée.",
  [["Réviser", "Sujets, fiches, QCM, révision du jour"], ["S'entraîner", "Concours blancs corrigés, grand oral"], ["Approfondir", "Textes officiels, vidéos, ouvrages"]]),
]
def espace(i):
    r, titre, texte, pts = ESPACE[i]
    return {"rubrique": "Espace abonnés", "titre": "Espace abonnés : " + minus(r), "message": f"{texte}\n\n{ESPACE_FIN}", "lien": f"{SITE}espace-abonnes/",
            "visuel": {"fond": "cream", "etiquette": "L'espace abonnés", "titre": titre, "points": pts, "pied": "Dès 500 FCFA la journée"}}

METHODES = [
 ("Dissertation : l'introduction", [["Aucun article, aucun arrêt", "Ils sont réservés au développement"], ["Un plan binaire", "Deux parties, I et II"], ["L'annonce du plan", "Avec les repères (I) et (II)"]],
  "La méthode du mardi : l'introduction de la dissertation juridique.\n\nTrois règles à respecter :\n1. Aucun article de loi ni aucun arrêt dans l'introduction : ils sont réservés au développement.\n2. Le plan est binaire : deux parties, I et II.\n3. L'annonce du plan se fait avec les repères (I) et (II), placés après chaque partie annoncée.\n\nUne introduction qui cite déjà les textes donne l'impression d'un développement commencé trop tôt : le correcteur le sanctionne."),
 ("SOG : identifier le type de sujet", [["Deux unités de sens", "Par exemple « Discipline et réussite » : type 3"], ["« Commentez » seul", "Sans antithèse intégrée : plan d'inventaire"], ["Une consigne trompeuse", "Elle se traite en type 1"]],
  "La méthode du mardi : identifier le type de sujet en SOG.\n\nAvant tout plan, lisez la consigne et les termes du sujet :\n• deux unités de sens reliées, par exemple « Discipline et réussite », donnent un sujet de type 3 ;\n• la consigne « Commentez » seule, sans antithèse intégrée dans la citation, appelle un plan d'inventaire ;\n• une consigne trompeuse se traite en type 1.\n\nSe tromper de type, c'est se tromper de plan : c'est l'erreur qui coûte le plus de points."),
 ("Cas pratique pénal : les intitulés", [["Trois temps", "Et le quadriptyque"], ["Des intitulés factuels", "« Sur le fait pour X d'avoir… »"], ["Une sous-partie par fait", "Ou par infraction"]],
  "La méthode du mardi : le cas pratique de droit pénal.\n\nIl se traite en trois temps, avec le quadriptyque. La partie sur la qualification juridique porte des intitulés factuels : « I. Sur le fait pour Koudjéla d'avoir subtilisé le téléphone de Tébalo », et jamais « I. Le vol aggravé ». Prévoyez une sous-partie par fait ou par infraction.\n\nCette règle vaut pour le droit pénal. En droit administratif, on garde les intitulés du plan de la méthode."),
 ("Commentaire : la méthode SEC", [["Le sens", "Ce que dit le texte"], ["L'explication", "Ses conditions et ses effets"], ["Le commentaire", "Sa portée et ses limites"]],
  "La méthode du mardi : le commentaire d'article, selon la méthode SEC.\n\nTrois mouvements : le Sens du texte, son Explication, puis son Commentaire. Deux exigences de forme : les mots du texte se citent entre guillemets, et les parties s'enchaînent par des transitions.\n\nÀ retenir : le commentaire ne comporte pas de conclusion générale."),
 ("Dissertation : le plan et les transitions", [["Deux parties", "Le plan binaire"], ["Des transitions", "Entre les parties"], ["Une conclusion", "En trois mouvements"]],
  "La méthode du mardi : le développement de la dissertation juridique.\n\nLe plan est binaire, en deux parties. Chaque passage d'une partie à l'autre se fait par une transition, qui résume ce qui précède et annonce ce qui suit. La conclusion, en trois mouvements, commence par « La question était de savoir… ».\n\nSans transitions, le correcteur lit deux blocs juxtaposés, et non une démonstration."),
 ("SOG : l'introduction", [["Un seul bloc", "De 10 à 15 lignes"], ["Le problème", "Puis trois questions"], ["La phrase de clôture", "« La réponse à ces questions… »"]],
  "La méthode du mardi : l'introduction du SOG.\n\nElle tient en un seul bloc de 10 à 15 lignes. Elle pose le problème, formule trois questions, puis se termine par la phrase exacte : « La réponse à ces questions constituera la trame de la présente réflexion. »\n\nPas de plan annoncé en I, II, III : les trois questions en tiennent lieu."),
 ("SOG : le développement", [["Trois parties", "Sans titres visibles"], ["Un chapeau", "Au début de chaque partie"], ["Une conclusion partielle", "À la fin de chaque partie"]],
  "La méthode du mardi : le développement du SOG.\n\nIl compte trois parties, sans titres visibles. Chaque partie s'ouvre par un chapeau, qui annonce son idée, et se ferme par une conclusion partielle, qui la résume et prépare la suite.\n\nLe correcteur doit pouvoir suivre votre raisonnement sans titres : c'est le rôle des chapeaux et des conclusions partielles."),
 ("Cas pratique pénal : la répression", [["Qualité, non-imputabilité, excuses", "Les trois premières étapes"], ["Faits justificatifs, circonstances aggravantes", "Les deux suivantes"], ["La peine, puis le cumul", "Les deux dernières"]],
  "La méthode du mardi : la répression dans le cas pratique de droit pénal.\n\nUne fois l'infraction qualifiée, la répression s'examine en sept étapes, dans cet ordre :\n1. la qualité de l'auteur ;\n2. la non-imputabilité ;\n3. les excuses ;\n4. les faits justificatifs ;\n5. les circonstances aggravantes ;\n6. la peine ;\n7. le cumul.\n\nSauter une étape, c'est risquer d'oublier une cause d'irresponsabilité ou une aggravation."),
 ("SOG : l'argument", [["Affirmation", "L'idée, en une phrase"], ["Explication et illustration", "Un exemple nommé et daté"], ["Conclusion", "Ce que l'exemple démontre"]],
  "La méthode du mardi : construire un argument en SOG.\n\nChaque argument tient en cinq à sept phrases : une affirmation, son explication, une illustration, puis une conclusion. L'illustration est un exemple précis, nommé et daté, et non une généralité.\n\nUn exemple vague (« dans certains pays… ») ne prouve rien ; un exemple daté montre au correcteur que vous maîtrisez votre sujet."),
 ("Dissertation : la conclusion", [["Trois mouvements", "Une conclusion construite"], ["La formule d'ouverture", "« La question était de savoir… »"], ["Aucune idée nouvelle", "Elle ferme la démonstration"]],
  "La méthode du mardi : la conclusion de la dissertation juridique.\n\nElle se construit en trois mouvements et commence par la formule « La question était de savoir… ». Elle rappelle la question posée, puis la réponse que le devoir y a apportée.\n\nC'est la dernière impression laissée au correcteur : ne la rédigez pas dans les dernières minutes."),
 ("Cas pratique : le syllogisme", [["La majeure", "La règle, avec l'article exact"], ["La mineure", "Chaque fait confronté à chaque condition"], ["Pas de conclusion générale", "La solution conclut chaque problème"]],
  "La méthode du mardi : le cas pratique, problème par problème.\n\nChaque problème se résout par un syllogisme : la majeure (la règle, avec l'article exact), la mineure (chaque fait confronté à chaque condition, « en l'espèce »), puis la solution (« par conséquent »).\n\nLe cas pratique ne comporte pas de conclusion générale. En droit administratif, gardez les intitulés du plan de la méthode, par exemple « Mesures légales » et « Mesures illégales »."),
 ("SOG : la conclusion", [["Un seul bloc", "De 10 à 15 lignes"], ["Un bilan", "De la réflexion menée"], ["Pas de titre", "Comme l'introduction"]],
  "La méthode du mardi : la conclusion du SOG.\n\nComme l'introduction, elle tient en un seul bloc de 10 à 15 lignes, sans titre. Elle dresse le bilan de la réflexion menée dans les trois parties.\n\nGardez-lui le temps nécessaire : une conclusion bâclée affaiblit tout le devoir."),
]
def methode(i):
    t, pts, msg = METHODES[i]
    return {"rubrique": "Méthode", "titre": "Méthode : " + minus(t), "message": msg + f"\n\n{SIGNE}",
            "visuel": {"fond": "cream", "etiquette": "La méthode du mardi", "titre": t, "etapes": pts, "pied": "La méthode des Cours Sésame et SAJ"}}

CONSEILS = [
 ("Un planning de la semaine", [["Une matière par jour", "Et un jour de révision générale"], ["Des séances courtes", "Mais tous les jours"], ["Une épreuve chronométrée", "Une fois par semaine"]],
  "Le conseil du dimanche : faites votre planning de la semaine.\n\nCe soir, prenez dix minutes pour répartir vos matières sur les sept jours qui viennent. Prévoyez une matière par jour, un jour de révision générale, et une épreuve complète en temps réel. Des séances courtes mais quotidiennes valent mieux qu'une longue journée isolée."),
 ("Lisez l'actualité", [["Chaque jour", "Quelques articles de presse"], ["Notez les exemples", "Avec leur date"], ["Classez-les", "Par grand thème"]],
  "Le conseil du dimanche : lisez l'actualité pour le SOG.\n\nUn bon argument repose sur un exemple précis, nommé et daté. Chaque jour, lisez quelques articles, notez les faits marquants avec leur date et classez-les par thème : éducation, santé, environnement, justice, intégration africaine. Le jour du concours, vous aurez vos exemples sous la main."),
 ("Des fiches qui servent", [["Une notion par fiche", "Pas un chapitre entier"], ["L'article exact", "Avec son numéro"], ["Un exemple et un piège", "Pour chaque notion"]],
  "Le conseil du dimanche : faites des fiches qui servent.\n\nUne fiche, c'est une notion : sa définition, l'article exact avec son numéro, les conditions, un exemple et le piège à éviter. Relisez-la le lendemain, puis une semaine plus tard. Une fiche trop longue ne se relit pas."),
 ("Les articles clés", [["Le numéro de l'article", "Il fait la différence"], ["Les mots exacts", "Pour les notions centrales"], ["Une révision régulière", "Quelques articles par jour"]],
  "Le conseil du dimanche : apprenez les articles clés.\n\nDans un cas pratique, la majeure exige l'article exact. Pour les notions qui reviennent souvent, retenez le numéro et les mots clés du texte : légitime défense, tentative, complicité, garde à vue, conditions du mariage. Quelques articles par jour suffisent."),
 ("Gérez votre temps", [["Analyser", "Lire le sujet et chercher"], ["Construire", "Le plan au brouillon"], ["Rédiger et relire", "Garder du temps pour la relecture"]],
  "Le conseil du dimanche : gérez le temps de l'épreuve.\n\nAvant le jour J, décidez de votre découpage : le temps de l'analyse du sujet, celui du plan au brouillon, celui de la rédaction, et quelques minutes de relecture. Testez ce découpage sur un concours blanc chronométré, puis ajustez-le."),
 ("Révisez à plusieurs", [["Interrogez-vous", "Les uns les autres"], ["Échangez vos copies", "Et corrigez-les"], ["Expliquez une notion", "C'est la meilleure révision"]],
  "Le conseil du dimanche : révisez à plusieurs.\n\nRetrouvez-vous une fois par semaine avec d'autres candidats : interrogez-vous sur les notions, échangez vos copies de concours blancs et corrigez-les avec la grille. Expliquer une notion à quelqu'un est la meilleure façon de vérifier qu'on la maîtrise."),
 ("La présélection", [["La vitesse", "Peu de temps par question"], ["La régularité", "Un peu chaque jour"], ["Les conditions réelles", "Chronomètre lancé"]],
  "Le conseil du dimanche : préparez la présélection.\n\nÀ la présélection, le temps par question est court : la vitesse se travaille. Entraînez-vous un peu chaque jour, chronomètre lancé, et notez les thèmes où vous hésitez. Nos concours blancs comprennent des épreuves de présélection gratuites."),
 ("Pendant les fêtes", [["Des séances courtes", "Même pendant les fêtes"], ["Un objectif par jour", "Une notion, un QCM"], ["Gardez le rythme", "Pour la rentrée"]],
  "Le conseil du dimanche : ne coupez pas tout pendant les fêtes.\n\nProfitez de vos proches, mais gardez une petite séance chaque jour : une notion relue, un QCM, une fiche. Trente minutes suffisent pour ne pas perdre le rythme avant la rentrée."),
 ("Vos objectifs de l'année", [["Une date", "Celle de votre concours"], ["Des objectifs chiffrés", "Par mois"], ["Un bilan", "Chaque fin de mois"]],
  "Le conseil du dimanche : fixez vos objectifs pour la nouvelle année.\n\nNotez la date de votre concours, puis des objectifs précis pour chaque mois : nombre de concours blancs composés, fiches terminées, matières revues. Faites le bilan à la fin de chaque mois et ajustez."),
 ("Soignez votre copie", [["Une écriture lisible", "Le correcteur doit vous lire"], ["Des paragraphes aérés", "Une idée par paragraphe"], ["Des marges", "Et une copie propre"]],
  "Le conseil du dimanche : soignez la présentation de votre copie.\n\nLe correcteur lit des dizaines de copies : une écriture lisible, des paragraphes aérés et une copie propre l'aident à suivre votre raisonnement. Entraînez-vous à rédiger proprement dès vos concours blancs."),
 ("Gérez le stress", [["Des concours blancs", "Dans les conditions réelles"], ["Une routine", "Le jour de l'épreuve"], ["Le sommeil", "Avant tout"]],
  "Le conseil du dimanche : apprivoisez le stress.\n\nLe meilleur remède, c'est l'habitude : composez des concours blancs dans les conditions réelles, à l'heure de l'épreuve. Préparez votre routine du jour J (affaires, trajet, repas) et dormez suffisamment la veille."),
 ("La dernière ligne droite", [["Relisez vos fiches", "Pas de nouveau chapitre"], ["Revoyez vos erreurs", "Celles des concours blancs"], ["Reposez-vous", "La veille de l'épreuve"]],
  "Le conseil du dimanche : la dernière ligne droite.\n\nLes derniers jours, n'ouvrez pas de nouveau chapitre : relisez vos fiches et revoyez les erreurs relevées dans vos concours blancs. La veille, reposez-vous. Vous avez travaillé : faites-vous confiance."),
]
def conseil(i):
    t, pts, msg = CONSEILS[i]
    return {"rubrique": "Conseil de préparation", "titre": "Conseil : " + minus(t), "message": msg + "\n\nNos concours blancs gratuits :",
            "lien": f"{SITE}concours-blancs/",
            "visuel": {"fond": "cream", "etiquette": "Le conseil du dimanche", "titre": t, "etapes": pts, "pied": "coursesesame.com/concours-blancs"}}

# ---------- Les semaines ----------
SEMAINES = [
 # concours, QCM (matière, n°), piège, vidéo, notion vendredi, SOG, sujet corrigé, ouvrages, notion lundi
 ("greffe", ("organisation-judiciaire", 5), "14-deux-ordres-de-juridiction", "notion-deux-ordres-de-juridiction", ("s", "07-flagrant-delit"), ("greffe_cs", 1), "dissertation-specificite-justice-penale-mineurs", ["Les Annales des Anciens Sujets Corrigés INFJ, Édition 2027", "Le Guide Méthodologique INFJ, Édition 2026"], ("s", "09-prescription-action-publique")),
 ("ena", ("culture-generale", 0), "15-principes-du-service-public", "presentation-les-cours-sesame-et-saj", ("s", "17-police-administrative"), ("ena_cs", 1), "refere-administratif", ["Les Annales des Anciens Sujets Corrigés de SOG", "Le Résumé de Note de Synthèse aux Concours Administratifs"], ("s", "18-qui-est-commercant")),
 ("penitentiaire", ("procedure-penale", 7), "06-recidive", "annales-sog-penitentiaire-2019", ("s", "02-legitime-defense"), ("penitentiaire_cs", 2), "cas-pratique-responsabilite-penale-mineur", ["Le Résumé d'Organisation Judiciaire aux Concours Administratifs", "Le Résumé de Droit Administratif aux Concours Administratifs"], ("s", "05-immunite-familiale")),
 ("eppjej", ("droits-de-l-enfant", 0), "13-autorite-parentale", "notion-personnalite-juridique", ("s", "10-personnalite-juridique"), ("eppjej_cs", 2), "droits-enfant-eppjej-2026", ["Le Résumé des Droits de l'Enfant aux Concours Administratifs", "Le Résumé d'Informatique aux Concours Administratifs"], ("q", "droits-de-l-enfant", 6)),
 ("magistrature", ("droit-civil", 0), "11-vices-du-consentement", "notion-auteur-ou-complice", ("s", "20-cautionnement"), ("magistrature", 2), "cas-pratique-accident-cause-par-un-mineur", ["Le Résumé de Droit Civil au Concours de la Magistrature", "Le Sésame de Droit Pénal au Concours de la Magistrature"], ("s", "06-recidive")),
 ("greffe", ("droit-administratif", 4), "08-garde-a-vue", "notion-garde-a-vue", ("s", "14-deux-ordres-de-juridiction"), ("greffe_cms", 1), "greffe-organisation-judiciaire-2026", ["Le Résumé d'OPEAJ aux Concours Administratifs", "Le Petit Manuel d'Organisation Judiciaire et Informatique"], ("q", "organisation-judiciaire", 1)),
 ("ena", ("culture-generale", 2), "16-recours-exces-de-pouvoir", "notion-qui-est-commercant", ("s", "15-principes-du-service-public"), ("ena_cms", 2), "sog-ivoirien-nouveau-developpement-durable", ["Le Résumé de PECOS aux Concours Administratifs", "La Logique aux Concours Administratifs"], ("q", "droit-administratif", 0)),
 ("penitentiaire", ("droit-penal", 4), "04-tentative-punissable", "notion-flagrant-delit", ("s", "08-garde-a-vue"), ("penitentiaire_cs", 3), "penitentiaire-dissertation-amnistie-grace-2026", ["Le Résumé de SOG aux Concours Administratifs", "Les Annales des Anciens Sujets Corrigés de SOG aux Concours Administratifs"], ("q", "procedure-penale", 0)),
 ("eppjej", ("droits-de-l-enfant", 7), "10-personnalite-juridique", "notion-syllogisme-juridique", ("s", "13-autorite-parentale"), ("eppjej_cms", 3), "commentaire-article-45-loi-divorce-autorite-parentale", ["Le Résumé d'Aptitude Verbale aux Concours Administratifs", "1000 Fiches de Cours pour Réussir l'Écrit de la Magistrature"], ("q", "droits-de-l-enfant", 9)),
 ("magistrature", ("droit-ohada", 0), "19-injonction-de-payer", "article-1376-un-article-une-minute", ("s", "11-vices-du-consentement"), ("magistrature", 4), "plan-garde-a-vue-droit-ivoirien", ["Les Fiches d'Arrêts de Droit Administratif, Édition 2026", "Le Résumé de Droit Commercial au Concours de la Magistrature"], ("q", "droit-ohada", 6)),
 ("greffe", ("organisation-judiciaire", 9), "07-flagrant-delit", "resume-droit-civil-2027", ("s", "16-recours-exces-de-pouvoir"), ("greffe_cs", 4), "greffe-opeaj-2026", ["Le Petit Manuel de Droit Pénal", "Le Petit Manuel de Droit Civil"], ("q", "droit-civil", 1)),
 ("ena", ("droit-administratif", 3), "17-police-administrative", "annales-sog-magistrature-2019", ("q", "droit-administratif", 5), ("ena_cs", 3), "dissertation-controle-hierarchique-controle-de-tutelle", ["Le Droit Administratif en 125 Dissertations Corrigées, Tome I", "Le Droit Administratif en 125 Dissertations Corrigées, Tome II"], ("q", "culture-generale", 9)),
]

def notion_de(x):
    return notion(x[1]) if x[0] == "s" else point(x[1], x[2])

posts = []
def ajoute(jour, creneau, p, n, conc):
    h = "07:30" if creneau == "matin" else "19:30"
    p.update({"n": n, "prevue": f"{jour.isoformat()}T{h}:00Z", "creneau": creneau, "concours": conc})
    posts.append(p)

debut = datetime.date(2026, 11, 4)
vus = {}
for k, (fam, q, pg, vid, nv, sg, sj, ouv, nl) in enumerate(SEMAINES):
    w = k + 2
    j = debut + datetime.timedelta(days=7 * k)
    conc = CONC_TAG[fam]
    bis = fam in vus; vus[fam] = 1
    m, s = qcm(*q)
    ajoute(j, "matin", m, f"s{w:02d}-01", TOUS)
    ajoute(j, "soir", s, f"s{w:02d}-02", TOUS)
    ajoute(j + datetime.timedelta(1), "matin", piege(pg), f"s{w:02d}-03", TOUS)
    ajoute(j + datetime.timedelta(1), "soir", video(vid), f"s{w:02d}-04", TOUS)
    ajoute(j + datetime.timedelta(2), "matin", notion_de(nv), f"s{w:02d}-05", TOUS)
    ajoute(j + datetime.timedelta(2), "soir", espace(k), f"s{w:02d}-06", TOUS)
    ajoute(j + datetime.timedelta(3), "matin", sog(*sg), f"s{w:02d}-07", conc)
    ajoute(j + datetime.timedelta(3), "soir", sujet(sj), f"s{w:02d}-08", conc)
    ajoute(j + datetime.timedelta(4), "matin", conseil(k), f"s{w:02d}-09", TOUS)
    ajoute(j + datetime.timedelta(4), "soir", ouvrage(ouv[0], True), f"s{w:02d}-10", conc)
    ajoute(j + datetime.timedelta(5), "matin", notion_de(nl), f"s{w:02d}-11", TOUS)
    ajoute(j + datetime.timedelta(5), "soir", ouvrage(ouv[1], False), f"s{w:02d}-12", conc)
    ajoute(j + datetime.timedelta(6), "matin", methode(k), f"s{w:02d}-13", TOUS)
    ajoute(j + datetime.timedelta(6), "soir", blancs(fam, bis), f"s{w:02d}-14", conc)
# Dernier jour du plan : mercredi 27 janvier 2027
m, s = qcm("droit-civil", 9)
ajoute(datetime.date(2027, 1, 27), "matin", m, "s14-01", TOUS)
ajoute(datetime.date(2027, 1, 27), "soir", s, "s14-02", TOUS)

for p in posts:
    for k in ("message", "titre"):
        assert "—" not in p[k] and "–" not in p[k], (p["n"], k)
json.dump(posts, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print(len(posts), "publications,", sum(1 for p in posts if p.get("visuel")), "visuels")
