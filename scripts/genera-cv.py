"""Dal CV sorgente al PDF del sito, senza riscrivere una parola del contenuto.

Uso:  python3 scripts/genera-cv.py astro-project/public
      (poi rinominare cv_it.pdf/cv_en.pdf in cv-it.pdf/cv-en.pdf)

Non gira in CI: i CV sorgente stanno sulla scrivania di Marco, non nel repo —
e non devono entrarci, perché contengono cellulare, data di nascita e Gmail.
Serve `pdftotext` (poppler) e Google Chrome per la stampa in PDF.

La sorgente è il PDF prodotto dal generatore di CV di Marco (`~/Desktop/CV/`).
Prima erano .docx via `textutil`: quel formato non esiste più a monte, il
generatore emette solo PDF. Cambia il modo di leggere, non cosa si legge —
`pdftotext -layout` restituisce le stesse tre forme che il resto dello script
si aspetta (titolo di sezione in maiuscolo, riga-azienda, elenco puntato).

Qui si tolgono solo i dati che non vanno su una pagina pubblica (cellulare,
data di nascita, Gmail personale) e si applica il foglio di stile del sito.
Chrome headless stampa in PDF.

Ogni riga rimossa viene stampata a terminale: la sanificazione dev'essere visibile,
non implicita.
"""

import hashlib
import html as html_mod
import os
import re
import subprocess
import sys
from pathlib import Path

# S8707: la destinazione arriva dalla CLI e finisce in un write. Si accetta solo
# una directory esistente DENTRO il repo: un argomento sbagliato (umano o di un
# agente) non deve poter scrivere fuori dall'albero del progetto.
REPO = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit("uso: python3 scripts/genera-cv.py astro-project/public")
DEST = Path(sys.argv[1]).resolve()
if not DEST.is_dir() or not DEST.is_relative_to(REPO):
    raise SystemExit(f"destinazione non valida: {sys.argv[1]!r} — serve una directory esistente dentro {REPO}")

FONTS = Path("/Users/marcobellingeri/GitHub/marcobellingeri.dev/astro-project/dist/_astro")
ANTON = next(FONTS.glob("anton-latin-400-normal.*.woff2"))
MONO = next(FONTS.glob("jetbrains-mono-latin-400-normal.*.woff2"))
SERIF = next(FONTS.glob("source-serif-4-latin-400-normal.*.woff2"))
SERIF_B = next(FONTS.glob("source-serif-4-latin-600-normal.*.woff2"), SERIF)

# Righe da NON pubblicare. Il sito espone mkdevpy@proton.me ovunque, non la Gmail.
#
# Il confronto NON è legato al formato: telefono e data di nascita devono cadere
# in qualunque grafia. Si normalizza il testo (via separatori e punteggiatura) e
# si confronta sulla forma canonica — a FINESTRE HASHATE: i valori in chiaro non
# vivono in questo file, che sta in un repo PUBBLICO (il paradosso del sanificatore
# che pubblica ciò che censura — audit 2026-07-12). Qui stanno solo i sha256.
# ponytail: sha256 su dati a bassa entropia ferma la lettura casuale, non il
# brute-force mirato; upgrade: valori da Doppler/Keychain se mai servisse di più.
SHA_TELEFONO = "5e326356284a6d7ccca6447c99ecb9a50c5a57c85844ce4e83b219d0006f70e0"  # 10 cifre
SHA_DATA = {  # 8 cifre, le 4 permutazioni note
    "d2f157c8465b6ae1c00dd729f7d30dba02fd7d58fb522b9747e2a539cae69c9d",
    "16ce369ed8c57e72b1b589326f73b2c8fc8bb0ac552b64879e29327fee9cf4d7",
    "2fa6ade2fff56377bacb7aa6415612d074c8632882c0141849662000a85db933",
    "f177b4256836dfbf7934761604ab2ac44cc12e4f0f26b0fe055fe9f0c3a81cb7",
}
SHA_GMAIL = "075f7b0c1c2e02b1aa1b6c417b19f5f3227934f4d782c375f41cd16e2bdc6083"  # 21 char
LEN_TELEFONO, LEN_DATA, LEN_GMAIL = 10, 8, 21


TAG_RE = re.compile(r"<[^>]+>")


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _finestra_hashata(testo: str, lunghezza: int, attesi: set[str]) -> bool:
    """Cerca una sottostringa di data lunghezza il cui sha256 è tra gli attesi."""
    return any(_sha(testo[i : i + lunghezza]) in attesi for i in range(len(testo) - lunghezza + 1))


def contiene_dato_sensibile(testo: str) -> bool:
    cifre = re.sub(r"\D", "", testo)
    if _finestra_hashata(cifre, LEN_TELEFONO, {SHA_TELEFONO}):
        return True
    if _finestra_hashata(cifre, LEN_DATA, SHA_DATA):
        return True
    # Gmail ignora i punti nella parte locale: si confronta senza.
    compatto = re.sub(r"[\s.]", "", testo.lower())
    return _finestra_hashata(compatto, LEN_GMAIL, {SHA_GMAIL})

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
.ruolo{{font-family:JB;font-size:9pt;letter-spacing:.06em;text-transform:uppercase;
   color:#B8420F;margin:0 0 3pt;}}
.contatti{{font-family:JB;font-size:7.4pt;letter-spacing:.02em;color:#3a332c;}}
h2{{font-family:JB;font-size:8.2pt;letter-spacing:.15em;text-transform:uppercase;
   margin:8pt 0 4pt;padding-bottom:2pt;border-bottom:.6pt solid #b9b2a6;
   color:#B8420F;break-after:avoid;}}
p{{margin:0 0 2.6pt;orphans:2;widows:2;}}
b{{font-weight:600;}}
/* UN solo linguaggio di lista, a qualunque profondità il docx la annidi:
   marker quadrato arancione, indent fisso. `ul ul` a padding zero SPEGNE la
   cascata verso destra (ogni progetto scivolava più a destra del precedente). */
ul{{margin:0 0 4pt;padding-left:10pt;list-style:square;}}
ul ul{{margin:0;padding-left:0;}}
li{{margin:0 0 1.5pt;break-inside:avoid;}}
li::marker{{color:#FF5A1F;}}
/* La riga dell'azienda respira: separa i blocchi di esperienza senza righelli. */
.azienda{{margin-top:7pt;break-after:avoid;}}
/* Patente + GDPR: piè di pagina, non contenuto. */
.footer-legale{{margin-top:8pt;font-family:JB;font-size:6.6pt;color:#6d665c;}}
"""


def sanifica(corpo: str, etichetta: str) -> str:
    # via gli span di servizio di textutil, conservandone il testo
    corpo = re.sub(r"<span[^>]*>", "", corpo)
    corpo = corpo.replace("</span>", "")
    corpo = re.sub(r'\s(class|style)="[^"]*"', "", corpo)

    tenuti = []
    for riga in re.findall(r"<(?:p|ul|li)[^>]*>[\s\S]*?</(?:p|ul|li)>|<ul>[\s\S]*?</ul>", corpo):
        testo = html_mod.unescape(TAG_RE.sub("", riga)).strip()
        if contiene_dato_sensibile(testo):
            print(f"  [{etichetta}] rimossa: {testo[:78]}")
            continue
        if testo and set(testo) <= {"─", " "}:  # i righelli del docx
            continue
        tenuti.append(riga)
    return "\n".join(tenuti)


# Un titolo di sezione nel PDF è una riga corta, tutta maiuscola e senza "|"
# (la barra separa azienda e ruolo, che maiuscolo lo è solo in parte).
#
# Le due condizioni in coda non sono zelo: "CI/CD." è la coda di un punto elenco
# andata a capo, ed è tutta maiuscola. Senza, diventava un titolo di sezione e
# si portava via il resto del bullet — sei lettere minime e nessun punto fermo
# la escludono, mentre il titolo più corto che esiste davvero ("LINGUE",
# "LANGUAGES") passa.
def _e_titolo_sezione(riga: str) -> bool:
    lettere = [c for c in riga if c.isalpha()]
    return (
        len(lettere) >= 6
        and len(riga) <= 42
        and "|" not in riga
        and "." not in riga
        and all(c.isupper() for c in lettere)
    )


# La testatina che il generatore ripete su ogni pagina ("Marco Bellingeri |
# <ruolo>") e il numero di pagina: nel testo estratto sono righe come le altre,
# e senza questo filtro finirebbero in mezzo al contenuto a ogni salto pagina.
#
# Due pattern e non un'alternanza sola: in `^(a|b$)` l'ancora di coda vale solo
# per il secondo ramo, e chi legge deve fermarsi a chiederselo. Separati, ogni
# ancora dice a cosa si riferisce.
TESTATINA = re.compile(r"^marco bellingeri\s*\|", re.I)
NUMERO_PAGINA = re.compile(r"^\d+\s*/\s*\d+$")


def _e_ripetuta(riga: str) -> bool:
    return bool(TESTATINA.match(riga) or NUMERO_PAGINA.match(riga))

# "Etichetta: valore" apre un blocco nuovo. Serve dove il PDF non lascia una
# riga vuota fra una voce e l'altra (competenze, certificazioni): senza,
# "Cloud & Platform:" verrebbe incollata alla riga di "Backend & API".
ETICHETTA = re.compile(r"^[A-ZÀ-Ü][^:]{1,40}:\s")


def _e_bullet(riga: str) -> bool:
    return riga[:1] in ("•", "·", "●")


def _continua_bullet(riga: str, indent: int, tipo: str | None, indent_li: int) -> bool:
    """Coda di un punto elenco: più indentata del suo bullet, e senza bullet suo."""
    return tipo == "li" and indent > indent_li and not _e_bullet(riga)


def _apre_capoverso(riga: str) -> bool:
    """Segnali che interrompono un capoverso: "|" (azienda/ruolo/date) e "Etichetta:"."""
    return "|" in riga or bool(ETICHETTA.match(riga))


def leggi_pdf(sorgente: Path) -> str:
    """PDF del generatore -> lo stesso HTML che prima usciva da textutil.

    `-layout` conserva l'indentazione, e da lì si leggono le forme del
    documento. Il punto delicato è che il PDF va a capo a larghezza di colonna,
    non a senso: una riga NON è un blocco. Un blocco nuovo comincia solo su un
    segnale esplicito (riga vuota, titolo tutto maiuscolo, bullet, "Etichetta:",
    o una riga con "|" — che in questo generatore separa azienda, ruolo e
    date). Tutto il resto è la continuazione di quello che c'era prima, e va
    ricucito, altrimenti mezzo CV diventa un elenco di frammenti.

    Le continuazioni di un punto elenco si riconoscono dall'indentazione
    MAGGIORE di quella del suo bullet, non da una soglia fissa: nelle esperienze
    recenti il bullet sta a 2 e la continuazione a 4, in quelle precedenti a 1 e 3.
    """
    testo = subprocess.run(
        ["pdftotext", "-layout", str(sorgente), "-"],
        capture_output=True, text=True, check=True,
    ).stdout

    blocchi: list[str] = []
    corrente: list[str] = []   # righe del blocco in costruzione
    tipo = None                # "li" | "p" | None
    indent_li = 0              # indentazione del bullet aperto

    def _chiudi() -> None:
        nonlocal tipo
        if corrente:
            unito = html_mod.escape(" ".join(corrente))
            blocchi.append(f"<p>• {unito}</p>" if tipo == "li" else f"<p>{unito}</p>")
            corrente.clear()
        tipo = None

    for riga_grezza in testo.split("\n"):
        riga = riga_grezza.strip()
        indent = len(riga_grezza) - len(riga_grezza.lstrip())
        if not riga or _e_ripetuta(riga):
            _chiudi()
        # La continuazione di un punto elenco si controlla PRIMA del titolo:
        # una coda andata a capo può essere tutta maiuscola, e in quel caso
        # vince il fatto che sta sotto un bullet aperto.
        elif _continua_bullet(riga, indent, tipo, indent_li):
            corrente.append(riga)
        elif _e_titolo_sezione(riga):
            _chiudi()
            blocchi.append(f"<p><b>{html_mod.escape(riga)}</b></p>")
        elif _e_bullet(riga):
            _chiudi()
            tipo, indent_li = "li", indent
            corrente.append(riga[1:].strip())
        elif tipo == "p" and not _apre_capoverso(riga):
            corrente.append(riga)
        else:
            _chiudi()
            tipo = "p"
            corrente.append(riga)
    _chiudi()
    return "\n".join(blocchi)


def costruisci(lingua: str) -> Path:
    # CV_SRC: dove stanno i PDF sorgente (default: ~/Desktop/CV). Serve quando
    # il TCC di macOS nega la scrivania al processo e si lavora su una copia.
    sorgente = Path(os.environ.get("CV_SRC", Path.home() / "Desktop" / "CV")) / f"marco_bellingeri_cv_{lingua.upper()}.pdf"
    corpo = leggi_pdf(sorgente)
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

    # ELENCHI PUNTATI, UN SOLO LINGUAGGIO (audit CV 22-07): nel docx alcune
    # esperienze usano "•" LETTERALI dentro paragrafi — sulla pagina diventano
    # un terzo stile di lista, nero e disallineato. Sanifica() emette un blocco
    # per riga: si lavora A RIGHE (lineare — la versione a regex con
    # quantificatori annidati era superlineare, Sonar S8786) e ogni run
    # contiguo di paragrafi-puntato diventa una <ul> vera. Le liste già vere
    # non vengono toccate: niente doppio wrapping.
    # il docx mette il bullet DENTRO il grassetto (<p><b>• Etichetta:</b>):
    # lo si porta fuori, così il riconoscimento sotto lo vede e il <b> resta
    corpo = re.sub(r"<p>\s*<b>\s*([•·●])\s*", r"<p>\1 <b>", corpo)

    PUNTATO = re.compile(r"<p>\s*[•·●]\s*([\s\S]*?)</p>")
    righe_out: list[str] = []
    run: list[str] = []

    def _chiudi_run() -> None:
        if run:
            righe_out.append("<ul>" + "".join(f"<li>{v}</li>" for v in run) + "</ul>")
            run.clear()

    for riga in corpo.split("\n"):
        m = PUNTATO.fullmatch(riga.strip())
        if m:
            run.append(m.group(1))
        else:
            _chiudi_run()
            righe_out.append(riga)
    _chiudi_run()
    corpo = "\n".join(righe_out)

    # La riga dell'azienda (bold tutto maiuscolo) prende aria sopra: i blocchi
    # di esperienza erano incollati l'uno all'altro.
    def _azienda(m: "re.Match[str]") -> str:
        testo = m.group(1)
        senza_tag = TAG_RE.sub("", testo)
        lettere = [c for c in senza_tag if c.isalpha()]
        if len(lettere) >= 5 and sum(c.isupper() for c in lettere) / len(lettere) > 0.8:
            return f'<p class="azienda"><b>{testo}</b>'
        return m.group(0)

    corpo = re.sub(r"<p><b>([\s\S]*?)</b>", _azienda, corpo)

    # Patente + autorizzazione GDPR: piè di pagina discreto, non un capoverso.
    corpo = re.sub(
        r"<p>((?:(?!</p>).)*?(?:Autorizzo il trattamento|I authorize the processing)[\s\S]*?)</p>",
        r'<p class="footer-legale">\1</p>',
        corpo,
    )

    # Tutto ciò che precede la prima sezione è l'intestazione del .docx: nome e
    # contatti, che qui vengono ridisegnati. Lasciarlo significherebbe stamparli due
    # volte, e una delle due copie conterrebbe i link che ho appena sanificato a mano.
    prima_sezione = corpo.index("<h2>")
    righe_intestazione = [
        html_mod.unescape(TAG_RE.sub("", blocco)).strip()
        for blocco in re.findall(r"<p[^>]*>[\s\S]*?</p>", corpo[:prima_sezione])
    ]
    righe_intestazione = [r for r in righe_intestazione if r]
    for riga in righe_intestazione:
        print(f"  [{lingua}] intestazione originale scartata: {riga[:70]}")
    corpo = corpo[prima_sezione:]

    # Il ruolo si RIPRENDE dall'intestazione scartata invece di essere scritto
    # qui: e' la prima riga sotto il nome che non sia un elenco di contatti, e
    # nel CV nuovo e' il posizionamento ("Cloud Platform & AI Security
    # Engineer"). Scriverlo a mano nello script vorrebbe dire che il giorno che
    # Marco lo cambia nel suo CV, il sito continua a dire quello vecchio.
    ruolo = next(
        (r for r in righe_intestazione if "|" not in r and "@" not in r and not r.isupper()),
        "",
    )
    riga_ruolo = f'<div class="ruolo">{html_mod.escape(ruolo)}</div>' if ruolo else ""
    if not ruolo:
        print(f"  [{lingua}] ATTENZIONE: nessuna riga di ruolo trovata sotto il nome")

    pagina = f"""<!doctype html><html lang="{lingua}"><head><meta charset="utf-8">
<title>Marco Bellingeri — CV</title><style>{CSS}</style></head><body>
<header><h1>MARCO BELLINGERI</h1>{riga_ruolo}<div class="contatti">{CONTATTI[lingua]}</div></header>
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

    out = DEST / f"cv_{lingua}.html"
    out.write_text(pagina, encoding="utf-8")
    return out


for lingua in ("it", "en"):
    print(f"== {lingua.upper()} ==")
    print(f"  scritto {costruisci(lingua)}")
