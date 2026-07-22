# FONTI.md — registro delle fonti dati del Radar

> **La regola di ammissione** (decisa il 22-07-2026): una fonte entra solo se la sua
> licenza permette **per iscritto** il riuso su un sito commerciale — questo sito
> vende (Servizi, Booking). Ambiguo = fuori, senza interpretazioni comode.
> L'attribuzione non è cortesia: le licenze qui sotto concedono l'uso **in cambio**
> della citazione. Questo file è la prova di conformità, versionata e datata.
>
> Ogni verdetto è stato preso leggendo la **pagina di licenza reale** della fonte
> (non gli apidocs, non un blog, non a memoria), il 22-07-2026.

## ✅ Fonti in uso

| Fonte | Licenza | Dove sta scritto | Cosa usiamo |
|---|---|---|---|
| **CISA** (US) | Opera del governo federale USA: **pubblico dominio** (17 U.S.C. §105). Il catalogo KEV è pubblicato esplicitamente in **CC0 1.0** | [github.com/cisagov/kev-data](https://github.com/cisagov/kev-data) | RSS advisories (`cybersecurity-advisories/all.xml`) + KEV JSON |
| **NCSC UK** | **Open Government Licence v3.0** — riuso anche commerciale, con attribuzione e link alla OGL. Esclusi loghi e materiali di terzi (non li usiamo) | [Terms and conditions NCSC](https://www.ncsc.gov.uk/section/about-this-website/terms-and-conditions) · [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) | RSS report + news |
| **CERT-FR** (ANSSI) | **Licence Ouverte 2.0 (Etalab)**: *«free to reuse the Information: for free or for a fee, for commercial or non-commercial purposes»*, con menzione della fonte. Mentions légales: *«Sauf mention explicite contraire, les contenus … sont couverts par la Licence ouverte / open licence, version 2.0»* | [cert.ssi.gouv.fr/mentions-legales](https://www.cert.ssi.gouv.fr/mentions-legales/) · [testo LO 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) | RSS alerte + avis |
| **Commissione europea** | **Decisione 2011/833/UE**: riuso dei documenti della Commissione libero anche a fini commerciali, senza autorizzazione preventiva, con attribuzione e senza distorcerne il senso | [EUR-Lex 32011D0833](https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32011D0833) | Punto "regole" sul globo → link alla pagina AI Act (nessun feed in v1: nessun RSS ufficiale verificato) |
| **MITRE ATLAS** | **Apache License 2.0** (`Copyright 2021-2026 MITRE`): commerciale, ridistribuzione e modifica OK conservando licenza e copyright | [github.com/mitre-atlas/atlas-data/LICENSE](https://github.com/mitre-atlas/atlas-data/blob/main/LICENSE) | Approvata; non ancora cablata (candidata: strato IA + sourcing magazine) |
| **Natural Earth** (contorni del globo) | **Pubblico dominio**; il file `land-110m.json` arriva dal pacchetto world-atlas (**ISC**) | [naturalearthdata.com](https://www.naturalearthdata.com/about/terms-of-use/) · [world-atlas](https://github.com/topojson/world-atlas) | `src/data/land-110m.json`, committato e versionato |

## ❌ Fonti valutate e SCARTATE (e perché)

| Fonte | Motivo del no | Verificato su |
|---|---|---|
| **ACN / CSIRT Italia** | Note legali: *«non è concesso … utilizzarli a scopo commerciale senza preventiva autorizzazione scritta»*. L'agenzia italiana, ironicamente, è la più chiusa del lotto. (La ricerca web diceva "CC BY 4.0": la pagina primaria dice l'opposto — sempre la pagina primaria.) | [acn.gov.it/portale/note-legali](https://www.acn.gov.it/portale/note-legali) |
| **CERT-EU** | *«© CERT-EU. All rights reserved»* — nessuna licenza di riuso | cert.europa.eu |
| **JPCERT/CC** | Solo *«All Rights Reserved»*, nessuna policy di riuso trovata | jpcert.or.jp |
| **Cloudflare Radar** | **CC BY-NC 4.0** — NonCommercial | developers.cloudflare.com/radar |
| **abuse.ch** (URLhaus, ThreatFox, Feodo) | Uso commerciale = abbonamento a pagamento (Spamhaus); vietate le opere derivate senza consenso | abuse.ch/terms-of-use |
| **ransomware.live** | Il repo GitHub è Unlicense ma copre **lo scraper, non i dati**; la pagina termini del sito è 404. Dato non licenziato = fuori | ransomware.live |
| **AI Incident Database** | CC BY-SA 4.0 sui dati **ma** le ToS vietano di *«sell or commercially exploit any aspect of the Site»*: licenza e ToS si contraddicono → fuori | incidentdatabase.ai/terms-of-use |

## ❓ In attesa (pagina licenza non raggiungibile o non trovata — ricontrollare prima di usarle)

NCSC-NL (redirect/404) · BSI/CERT-Bund (404) · ACSC Australia (timeout) · NCSC NZ (404) ·
SANS ISC / DShield (403) · OECD AI Incidents Monitor (T&C 403) · CSIRTS.com (aggregatore
terzo: condizioni proprie da leggere).

## Come si aggiunge una fonte

1. Trovare la **pagina di licenza/termini reale** e leggerla (non fidarsi di ricerche o riassunti).
2. La licenza permette per iscritto l'uso commerciale? No o ambiguo → non entra.
3. Aggiungere la voce qui (con quote e link) **e** in `astro-project/src/data/radar-fonti.js`
   (con `hostsAmmessi`: i link dei feed vengono scartati se puntano fuori dai domini della fonte).
4. Il test `radar.test.mjs` («ogni fonte del registro ha licenza scritta») fa da guardia:
   una fonte senza `licenza.nome`/`licenza.url` non passa la CI.
