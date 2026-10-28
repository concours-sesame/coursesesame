"""Vitrine publique des fiches de révision : contenu/fiches.js à partir des sources NN.md.

    python3 tools/fiches/vitrine.py <dossier des sources>

Le dépôt est public : seul ce que la vitrine affiche en sort, à savoir l'en-tête de chaque fiche (numéro, titre,
matière, concours, sources), la partie « L'essentiel en une phrase », les intitulés des parties et le nombre de
questions corrigées. Le reste de la fiche reste dans l'archive privée.
"""
import html, json, re, sys, unicodedata
from pathlib import Path


def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s.replace("œ", "oe")).strip("-")


def en_ligne(t):
    """Markdown d'une ligne (gras, italique) vers HTML, après échappement."""
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", t)


def lire(f):
    tete, corps = f.read_text(encoding="utf-8").split("\n---\n", 1)
    meta = dict(l.split(": ", 1) for l in tete.strip().splitlines() if ": " in l)
    parties = re.split(r"^## ", corps, flags=re.M)[1:]
    titres = [re.sub(r"^\d+\.\s*", "", p.split("\n", 1)[0]).strip() for p in parties]
    essentiel = parties[0].split("\n", 1)[1]
    paragraphes = [en_ligne(" ".join(p.split())) for p in re.split(r"\n\s*\n", essentiel.strip()) if p.strip()]
    testez = next((p for p, t in zip(parties, titres) if t.lower().startswith("testez")), "")
    return {
        "numero": int(meta["numero"]),
        "slug": f'{int(meta["numero"]):03d}-{slug(meta["titre"])}',
        "titre": meta["titre"],
        "matiere": meta["matiere"],
        "concours": [c.strip() for c in meta["concours"].split(",")],
        "sources": meta["sources"],
        "essentiel": paragraphes,
        "plan": titres,
        # Une question par ligne numérotée de « Testez-vous », avant le corrigé
        "questions": len(re.findall(r"^\d+\.\s", testez.split("\n", 1)[-1].split("**Corrigé**")[0], flags=re.M)),
    }


def main():
    dossier = Path(sys.argv[1])
    fiches = sorted((lire(f) for f in dossier.glob("[0-9]*.md")), key=lambda x: x["numero"])
    sortie = Path(__file__).resolve().parents[2] / "contenu" / "fiches.js"
    sortie.write_text(
        "// Vitrine des fiches de révision : généré par tools/fiches/vitrine.py, ne pas modifier à la main.\n"
        "// Seul l'essentiel de chaque fiche figure ici ; la fiche entière se lit dans l'espace abonnés.\n"
        "module.exports = " + json.dumps(fiches, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")
    print(len(fiches), "fiches ->", sortie)


if __name__ == "__main__":
    main()
