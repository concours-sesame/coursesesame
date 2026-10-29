"""Vérifie les citations « … » d'une fiche contre le texte officiel (PDF du Journal officiel ou de l'OHADA, passé en texte).
Usage : python3 tools/fiches/verifier_citations.py <fiche.md> <source.txt> [<source2.txt> …]
Pour chaque citation : l'article du texte officiel où elle se lit (contrôle du numéro cité), ou ABSENTE.
Normalisation : sans accents ni ponctuation, « Ie »/« I' » de la reconnaissance de caractères lus « le »/« l' »."""
import re, sys, unicodedata
def sans_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
def norm(s, ocr=False):
    s = s.replace("’", "'").replace("‘", "'").replace("œ", "oe").replace("Œ", "Oe")
    if ocr:
        s = re.sub(r"\bIe\b", "le", s); s = re.sub(r"(?<=[a-z])I'", " l'", s); s = re.sub(r"\bI'", "l'", s); s = re.sub(r"\bIa\b", "la", s); s = re.sub(r"\bIes\b", "les", s); s = re.sub(r"\bit\b", "a", s); s = re.sub(r"\bII\b", "Il", s); s = re.sub(r"\b11(?=[a-z])", "Il ", s); s = re.sub(r"(?<=[a-zA-Z])6(?=[a-z])", "o", s)
    s = sans_accents(s).lower()
    return re.sub(r"[^a-z0-9]", "", s)
fiche = open(sys.argv[1]).read()
corps = fiche.split("\n---\n", 1)[1]
sources = []
for f in sys.argv[2:]:
    t = open(f).read()
    # repères d'articles : position (dans le texte normalisé) -> numéro
    reperes, morceaux, pos = [], [], 0
    for m in re.split(r"(?m)^\s*(Article\s+\d+(?:-\d+)?(?:\s*(?:bis|nouveau))?)\s*:?\s*$", t):
        if re.match(r"\s*Article\s+\d", m):
            reperes.append((pos, re.sub(r"\s+", " ", m.strip())))
        else:
            n = norm(m, True); morceaux.append(n); pos += len(n)
    sources.append((f.split("/")[-1], "".join(morceaux), reperes))
def article(reperes, p):
    a = "?"
    for q, nom in reperes:
        if q <= p: a = nom
        else: break
    return a
txt = re.sub(r"\n> ", " ", corps)
bad = 0
for q in re.findall(r"«\s*(.+?)\s*»", txt, re.S):
    for part in re.split(r"\[[^\]]*\]|…", q):
        n = norm(part)
        if len(n) < 12: continue
        trouve = None
        for nom, t, rep in sources:
            arts, p = [], t.find(n)
            while p >= 0 and len(arts) < 6:
                arts.append(article(rep, p).replace("Article ", "art. ")); p = t.find(n, p + 1)
            if arts: trouve = f"{nom} {', '.join(dict.fromkeys(arts))}"; break
        if not trouve: bad += 1
        print(("OK   " + trouve) if trouve else "ABSENTE", "|", part.strip()[:110])
for ch in "—–":
    if ch in fiche: print("TIRET", ch); bad += 1
print(f"== {bad} problème(s)")
sys.exit(1 if bad else 0)
