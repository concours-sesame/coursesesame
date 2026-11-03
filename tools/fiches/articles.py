"""Affiche des articles du texte officiel : python3 tools/fiches/articles.py <source.txt> 4 37-50 106"""
import re, sys
t = open(sys.argv[1]).read()
t = re.sub(r"\n\s*Acte Uniforme relatif[^\n]*\n[^\n]*\n", "\n", t)
t = re.sub(r"(?m)^.*Journal Officiel de l.Organisation[^\n]*$", "", t)
parts = re.split(r"(?m)^\s*Article\s+(\d+(?:-\d+)?)\s*:?\s*$", t)
arts = {}
for i in range(1, len(parts) - 1, 2):
    arts.setdefault(parts[i], parts[i + 1])
for spec in sys.argv[2:]:
    a, _, b = spec.partition("-")
    nums = [str(n) for n in range(int(a), int(b or a) + 1)] if not re.search(r"\d-\d+$", spec) or b.isdigit() and int(b) > int(a) else [spec]
    for n in nums:
        if n in arts:
            print(f"[{n}] " + re.sub(r"\s+", " ", arts[n]).strip()[:1500])
