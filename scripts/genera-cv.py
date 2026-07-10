"""Da .docx a PDF, senza riscrivere una parola del contenuto.

Uso:  python3 scripts/genera-cv.py astro-project/public
      (poi rinominare cv_it.pdf/cv_en.pdf in cv-it.pdf/cv-en.pdf)

Non gira in CI: i .docx sorgente stanno sulla scrivania di Marco, non nel repo —
e non devono entrarci, perché contengono cellulare, data di nascita e Gmail.
Serve macOS (`textutil`) e Google Chrome per la stampa in PDF.

textutil converte fedelmente; qui si tolgono solo i dati che non vanno su una pagina
pubblica (cellulare, data di nascita, Gmail personale) e si applica il foglio di stile
del sito. Chrome headless stampa in PDF.

Ogni riga rimossa viene stampata a terminale: la sanificazione dev'essere visibile,
non implicita.
"""

import html as html_mod
import re
import subprocess
import sys
from pathlib import Path

FONTS = Path("/Users/marcobellingeri/GitHub/marcobellingeri.dev/astro-project/dist/_astro")
ANTON = next(FONTS.glob("anton-latin-400-normal.*.woff2"))
MONO = next(FONTS.glob("jetbrains-mono-latin-400-normal.*.woff2"))
SERIF = next(FONTS.glob("source-serif-4-latin-400-normal.*.woff2"))
SERIF_B = next(FONTS.glob("source-serif-4-latin-600-normal.*.woff2"), SERIF)

# Righe da NON pubblicare. Il sito espone mkdevpy@proton.me ovunque, non la Gmail.
#
# Il confronto NON è legato al formato: `348-450-7859`, `(348) 450 7859` e
# `1991-04-03` devono cadere quanto le grafie di oggi. Si normalizza il testo
# (via separatori e punteggiatura) e si cerca sulla forma canonica — una regex
# sul formato esatto lascia passare il primo .docx riscritto diversamente, e
# l'unica rete sarebbe una riga di log che NON compare.
CIFRE_TELEFONO = "3484507859"
CIFRE_DATA = {"03041991", "04031991", "19910403", "19910304"}


def contiene_dato_sensibile(testo: str) -> bool:
    cifre = re.sub(r"\D", "", testo)
    if CIFRE_TELEFONO in cifre:
        return True
    if any(d in cifre for d in CIFRE_DATA):
        return True
    # Gmail ignora i punti nella parte locale: si confronta senza.
    compatto = re.sub(r"[\s.]", "", testo.lower())
    return "marcobellingeri@gmail" in compatto

CONTATTI = {
    "it": "mkdevpy@proton.me &nbsp;·&nbsp; github.com/MK023 &nbsp;·&nbsp; "
          "linkedin.com/in/marco-bellingeri &nbsp;·&nbsp; credly.com/users/marco-bellingeri",
    "en": "mkdevpy@proton.me &nbsp;·&nbsp; github.com/MK023 &nbsp;·&nbsp; "
          "linkedin.com/in/marco-bellingeri &nbsp;·&nbsp; credly.com/users/marco-bellingeri",
}

CSS = f"""
@font-face{{font-family:Anton;src:url("file://{ANTON}") format("woff2");}}
@font-face{{font-family:JB;src:url("file://{MONO}") format("woff2");}}
@font-face{{font-family:Serif;src:url("file://{SERIF}") format("woff2");font-weight:400;}}
@font-face{{font-family:Serif;src:url("file://{SERIF_B}") format("woff2");font-weight:600;}}
@page{{size:A4;margin:11mm 13mm 12mm;}}
*{{box-sizing:border-box}}
body{{font-family:Serif;font-size:8.9pt;line-height:1.33;color:#181410;margin:0;}}
header{{border-bottom:2pt solid #181410;padding-bottom:5pt;margin-bottom:8pt;}}
h1{{font-family:Anton;font-size:26pt;letter-spacing:.01em;margin:0 0 4pt;line-height:.95;}}
.contatti{{font-family:JB;font-size:7.4pt;letter-spacing:.02em;color:#3a332c;}}
h2{{font-family:JB;font-size:8.2pt;letter-spacing:.15em;text-transform:uppercase;
   margin:8pt 0 4pt;padding-bottom:2pt;border-bottom:.6pt solid #b9b2a6;
   color:#B8420F;break-after:avoid;}}
p{{margin:0 0 2.6pt;orphans:2;widows:2;}}
b{{font-weight:600;}}
ul{{margin:0 0 4pt;padding-left:10pt;}}
li{{margin:0 0 1.5pt;break-inside:avoid;}}
li::marker{{color:#FF5A1F;}}
"""


def sanifica(corpo: str, etichetta: str) -> str:
    # via gli span di servizio di textutil, conservandone il testo
    corpo = re.sub(r"<span[^>]*>", "", corpo)
    corpo = corpo.replace("</span>", "")
    corpo = re.sub(r'\s(class|style)="[^"]*"', "", corpo)

    tenuti = []
    for riga in re.findall(r"<(?:p|ul|li)[^>]*>[\s\S]*?</(?:p|ul|li)>|<ul>[\s\S]*?</ul>", corpo):
        testo = html_mod.unescape(re.sub(r"<[^>]+>", "", riga)).strip()
        if contiene_dato_sensibile(testo):
            print(f"  [{etichetta}] rimossa: {testo[:78]}")
            continue
        if testo and set(testo) <= {"─", " "}:  # i righelli del docx
            continue
        tenuti.append(riga)
    return "\n".join(tenuti)


def costruisci(lingua: str) -> Path:
    sorgente = Path.home() / "Desktop" / f"marco_bellingeri_cv_{lingua.upper()}.docx"
    grezzo = subprocess.run(
        ["textutil", "-convert", "html", "-stdout", str(sorgente)],
        capture_output=True, text=True, check=True,
    ).stdout
    corpo = re.search(r"<body[^>]*>([\s\S]*)</body>", grezzo).group(1)
    corpo = sanifica(corpo, lingua)

    # Il nome va tolto PRIMA di convertire i titoli: è tutto maiuscolo anche lui, e
    # diventerebbe un <h2>, azzerando il preambolo che si vuole scartare qui sotto.
    corpo = re.sub(r"<p><b>MARCO BELLINGERI</b></p>\s*", "", corpo, count=1)

    # i titoli di sezione sono paragrafi tutti maiuscoli
    corpo = re.sub(
        r"<p>(?:<b>)?([A-ZÀ-Ü&;\s/,\.\-]{4,})(?:</b>)?</p>",
        lambda m: f"<h2>{m.group(1).strip()}</h2>",
        corpo,
    )

    # Tutto ciò che precede la prima sezione è l'intestazione del .docx: nome e
    # contatti, che qui vengono ridisegnati. Lasciarlo significherebbe stamparli due
    # volte, e una delle due copie conterrebbe i link che ho appena sanificato a mano.
    prima_sezione = corpo.index("<h2>")
    scartato = re.sub(r"<[^>]+>", " ", corpo[:prima_sezione])
    for riga in filter(None, (r.strip() for r in scartato.split("  "))):
        print(f"  [{lingua}] intestazione originale scartata: {riga[:70]}")
    corpo = corpo[prima_sezione:]

    pagina = f"""<!doctype html><html lang="{lingua}"><head><meta charset="utf-8">
<title>Marco Bellingeri — CV</title><style>{CSS}</style></head><body>
<header><h1>MARCO BELLINGERI</h1><div class="contatti">{CONTATTI[lingua]}</div></header>
{corpo}
</body></html>"""

    # Guardia finale sull'INTERA pagina, non sui singoli blocchi: se un dato
    # sensibile è arrivato fin qui per una strada non prevista, lo script muore
    # ad alta voce. L'assenza di una riga di log non la nota nessuno; un exit 1 sì.
    if contiene_dato_sensibile(pagina):
        raise SystemExit(
            f"ABORT: un dato sensibile è sopravvissuto alla sanificazione ({lingua}). "
            "Niente è stato scritto su public/. Controlla il .docx sorgente."
        )

    out = Path(sys.argv[1]) / f"cv_{lingua}.html"
    out.write_text(pagina, encoding="utf-8")
    return out


for lingua in ("it", "en"):
    print(f"== {lingua.upper()} ==")
    print(f"  scritto {costruisci(lingua)}")
