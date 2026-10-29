"""Contrôle d'un plan de la banque de plans contre sa fiche source.
Usage : python3 verifier_plans.py <plan.md> <fiche.md>
- chaque citation « … » du plan doit se lire telle quelle dans la fiche (les « [...] » séparent des morceaux) ;
- chaque numéro d'article cité dans le plan doit apparaître dans la fiche ;
- ni tiret cadratin ni demi-cadratin."""
import re, sys, unicodedata

def norm(s):
    s = unicodedata.normalize("NFC", s).replace("’", "'").replace(" ", " ").replace(" ", " ")
    s = re.sub(r"\*+", "", s)
    s = re.sub(r"^> ?", "", s, flags=re.M)
    return re.sub(r"\s+", " ", s).strip()

plan, fiche = open(sys.argv[1]).read(), open(sys.argv[2]).read()
corps = plan.split("\n---\n", 1)[1]
f = norm(fiche)
erreurs = []
for q in re.findall(r"«\s*(.+?)\s*»", corps, flags=re.S):
    for morceau in re.split(r"\s*\[\.\.\.\]\s*|\s*\[…\]\s*", norm(q)):
        if morceau and morceau not in f:
            erreurs.append("citation absente : " + morceau[:90])
def articles(t):
    out = set()
    for m in re.finditer(r"\barticles? ((?:\d+(?:er)?(?:, | et | à |, alinéas? \d+(?:er)?(?: et \d+)?,? ?)?)+)", t):
        out |= set(re.findall(r"\b(\d+)(?:er)?\b(?!e)", re.sub(r"alinéas? \d+(?:er)?(?: et \d+)?", "", m.group(1))))
    return out
manquants = articles(corps) - articles(fiche) - set(re.findall(r"\b(\d+)\b", re.sub(r"[^\n]*sources:[^\n]*", "", fiche)))
for a in sorted(manquants, key=int):
    erreurs.append(f"article {a} cité dans le plan, absent de la fiche")
if re.search("[—–]", plan):
    erreurs.append("tiret cadratin ou demi-cadratin")
print("\n".join(erreurs) if erreurs else "OK")
sys.exit(1 if erreurs else 0)
