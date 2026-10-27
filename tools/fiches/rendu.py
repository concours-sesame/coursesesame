"""Fiches de révision : Markdown simple vers HTML imprimable (charte Sésame), un fichier par fiche.
Usage : python3 tools/fiches/rendu.py <dossier> ; lit <dossier>/NN.md, écrit <dossier>/NN.html (voir README.md)."""
import html, re, sys, pathlib

SITE = pathlib.Path(__file__).resolve().parents[2]
LOGO = (SITE / 'assets/img/favicon.svg').read_text()
FONTS = SITE / 'assets/fonts'

def typo(t):
    # Espaces insécables françaises (le texte source n'en contient pas)
    t = re.sub(r'«\s*', '«\u00a0', t)
    t = re.sub(r'\s*»', '\u00a0»', t)
    t = re.sub(r'\s+([;?!])', '\u202f\\1', t)
    t = re.sub(r'(?<=\S) :', '\u00a0:', t)
    t = re.sub(r'n° ', 'n°\u00a0', t)
    t = re.sub(r'(\d)\.(\d{3})', '\\1\u202f\\2', t)  # 360.000 -> 360 000 (espace fine)
    return t

def enligne(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', t)
    return typo(t)

def corps(md):
    out, lignes, i = [], md.split('\n'), 0
    while i < len(lignes):
        l = lignes[i]
        if not l.strip():
            i += 1; continue
        if l.startswith('## '):
            out.append(f'<h2>{enligne(l[3:])}</h2>'); i += 1; continue
        if l.startswith('> '):
            bloc = []
            while i < len(lignes) and lignes[i].startswith('> '):
                bloc.append(enligne(lignes[i][2:])); i += 1
            out.append('<blockquote>' + '<br>'.join(bloc) + '</blockquote>'); continue
        if l.startswith('|'):
            rangs = []
            while i < len(lignes) and lignes[i].startswith('|'):
                rangs.append([c.strip() for c in lignes[i].strip('|').split('|')]); i += 1
            tete, rangs = rangs[0], [r for r in rangs[1:] if not set(''.join(r)) <= set('-: ')]
            out.append('<table><thead><tr>' + ''.join(f'<th>{enligne(c)}</th>' for c in tete) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{enligne(c)}</td>' for c in r) + '</tr>' for r in rangs) + '</tbody></table>')
            continue
        m = re.match(r'(- |\d+\. )', l)
        if m:
            ordre = m.group(1) != '- '
            items = []
            while i < len(lignes) and re.match(r'(- |\d+\. )', lignes[i]) and (lignes[i].startswith('- ') != ordre):
                items.append(enligne(re.sub(r'^(- |\d+\. )', '', lignes[i]))); i += 1
            tag = 'ol' if ordre else 'ul'
            out.append(f'<{tag}>' + ''.join(f'<li>{x}</li>' for x in items) + f'</{tag}>'); continue
        para = []
        while i < len(lignes) and lignes[i].strip() and not re.match(r'(## |> |\||- |\d+\. )', lignes[i]):
            para.append(lignes[i]); i += 1
        out.append(f'<p>{enligne(" ".join(para))}</p>')
    return '\n'.join(out)

def lire(f):
    tete, md = f.read_text().split('\n---\n', 1)
    meta = dict(l.split(': ', 1) for l in tete.strip().split('\n'))
    return meta, md

# Mention de bas de fiche par défaut ; une fiche peut la remplacer par une ligne « note: … » dans son en-tête
NOTE = "Les articles sont cités d'après le texte publié au Journal officiel et, pour les dispositions modifiées, d'après la loi modificative."

CONCOURS = {'infj': 'Magistrature', 'greffe': 'Greffe', 'penitentiaire': 'Pénitentiaire', 'eppjej': 'EPPJEJ', 'ena': 'ENA'}

def page(meta, md):
    police = lambda nom, f, w, s='normal': f'@font-face{{font-family:"{nom}";font-weight:{w};font-style:{s};src:url("file://{FONTS / f}")}}'
    concours = ' · '.join(CONCOURS[c.strip()] for c in meta['concours'].split(','))
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche n° {meta['numero']} · {html.escape(meta['titre'])}</title><style>
{police('Serif', 'source-serif-4-latin-400-normal.woff2', 400)}{police('Serif', 'source-serif-4-latin-600-normal.woff2', 600)}
{police('Serif', 'source-serif-4-latin-700-normal.woff2', 700)}{police('Serif', 'source-serif-4-latin-400-italic.woff2', 400, 'italic')}
{police('Sans', 'source-sans-3-latin-400-normal.woff2', 400)}{police('Sans', 'source-sans-3-latin-600-normal.woff2', 600)}
{police('Sans', 'source-sans-3-latin-700-normal.woff2', 700)}{police('Sans', 'source-sans-3-latin-400-italic.woff2', 400, 'italic')}
:root{{--navy:#0f2a5c;--gold:#e8a62b;--gold-ink:#8a5a00;--ink:#18202f;--muted:#566074;--cream:#f3f5f8;--line:#dde2ea}}
@page{{size:A4;margin:18mm 17mm 20mm}}
*{{box-sizing:border-box}}
body{{margin:0;font:10.6pt/1.5 "Sans",sans-serif;color:var(--ink)}}
.bandeau{{display:flex;align-items:center;gap:10px;background:var(--navy);color:#fff;padding:10px 14px;border-radius:6px}}
.bandeau svg{{width:34px;height:34px;flex:none}}
.bandeau .nom{{font:600 12.5pt "Serif",serif;letter-spacing:.2px}}
.bandeau .base{{font:600 7pt "Sans",sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:var(--gold)}}
.bandeau .num{{margin-left:auto;font:700 9pt "Sans",sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:var(--gold);text-align:right}}
.matiere{{margin:16px 0 2px;font:700 8pt "Sans",sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold-ink)}}
h1{{margin:0;font:700 21pt/1.18 "Serif",serif;color:var(--navy)}}
.filet{{height:3px;width:64px;background:var(--gold);margin:10px 0 10px}}
.meta{{font-size:9pt;color:var(--muted);margin:0 0 4px}}
.meta b{{color:var(--ink)}}
h2{{font:700 13pt/1.25 "Serif",serif;color:var(--navy);margin:18px 0 6px;padding-left:9px;border-left:4px solid var(--gold);break-after:avoid}}
p{{margin:5px 0 7px}}
ul,ol{{margin:4px 0 8px;padding-left:20px}}
li{{margin:3px 0}}
li::marker{{color:var(--gold-ink);font-weight:700}}
blockquote{{margin:6px 0 10px;padding:9px 12px;background:var(--cream);border-left:3px solid var(--navy);border-radius:0 5px 5px 0;font:10.4pt/1.5 "Serif",serif;break-inside:avoid}}
table{{width:100%;border-collapse:collapse;margin:8px 0 10px;font-size:9.4pt;break-inside:avoid}}
th{{background:var(--navy);color:#fff;text-align:left;font-weight:600;padding:5px 7px}}
td{{padding:5px 7px;border-bottom:1px solid var(--line);vertical-align:top}}
tr:nth-child(even) td{{background:var(--cream)}}
b{{font-weight:700}}
h2+p,h2+ul,h2+ol,h2+blockquote{{break-before:avoid}}
.fin{{margin-top:12px;padding-top:6px;border-top:1px solid var(--line);font-size:8.2pt;color:var(--muted);break-before:avoid;break-inside:avoid}}
ol:last-of-type li:last-child,p:has(+ .fin){{break-after:avoid}}
</style></head><body>
<div class="bandeau">{LOGO}<div><div class="nom">Les Cours Sésame et SAJ</div><div class="base">Formation juridique · Concours &amp; excellence</div></div><div class="num">Fiche n°&nbsp;{meta['numero']}<br>Fiches de révision</div></div>
<div class="matiere">{html.escape(meta['matiere'])}</div>
<h1>{enligne(meta['titre'])}</h1>
<div class="filet"></div>
<p class="meta"><b>Concours :</b> {concours}</p>
<p class="meta"><b>Sources :</b> {enligne(meta['sources'])}</p>
{corps(md)}
<p class="fin">Fiche réservée aux abonnés des Cours Sésame et SAJ, pour un usage personnel. {enligne(meta.get('note', NOTE))}</p>
</body></html>'''

if __name__ == '__main__':
    ICI = pathlib.Path(sys.argv[1])
    for f in sorted(x for x in ICI.glob('*.md') if x.stem.isdigit()):
        meta, md = lire(f)
        (ICI / f'{f.stem}.html').write_text(page(meta, md))
        print(f.stem, meta['titre'])
