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
| **MITRE ATLAS** | **Apache License 2.0** (`Copyright 2021-2026 MITRE`): commerciale, ridistribuzione e modifica OK conservando licenza e copyright | [github.com/mitre-atlas/atlas-data/LICENSE](https://github.com/mitre-atlas/atlas-data/blob/main/LICENSE) | **Strato "IA" del globo**: i case study, committati in `src/data/radar-atlas.js` e rigenerati da `engine/atlas.mjs`. Non è un feed: è una tassonomia versionata (release `2026.06`) |
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
| **Artificial Analysis** (Data API) | ToS §2.1: licenza *«solely for your own personal, **noncommercial** use»*; §2.2(a) vieta di *«commercially exploit … any content displayed on the Site»* e (d) di *«republish»*; §2.5: *«There are **no implied licenses**»*. Gli apidocs confermano: *«for **redistribution rights** … contact the team»* — la ridistribuzione si negozia, non è nel tier. Valutata il 24-07-2026 | [Terms-of-Use.pdf](https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf) (v1.0, 28-04-2024) · [data-api/docs](https://artificialanalysis.ai/data-api/docs) |
| **BSI / CERT-Bund** (DE) | Nutzungsbedingungen: *«Software und Veröffentlichungen, die zum kostenfreien Download angeboten werden, dürfen **nur zu nicht kommerziellen Zwecken** verwendet werden»* e *«Eine weitergehende, insbesondere **kommerzielle** oder publizistische Verwendung bedarf der vorherigen Zustimmung durch das BSI»*. Verificato il 24-07-2026 (era "in attesa" per un 404: l'URL giusto è sotto `/Service/`, non `/Service-Navi/`) | [bsi.bund.de — Nutzungsbedingungen](https://www.bsi.bund.de/DE/Service/Nutzungsbedingungen/Nutzungsbedingungen.html) |
| **NCSC-NL — advisories** | Il feed `advisories.ncsc.nl/rss/advisories` è reale e funzionante, ma sta su un **host diverso** da quello coperto dal CC0 e dichiara `<copyright>Copyright 2026 - NCSC-NL</copyright>`: leggibile come il *«tenzij anders vermeld»* che esclude il CC0. Ambiguo = fuori, senza interpretazioni comode. (Il feed **news** su `www.ncsc.nl` resta dentro) | [advisories.ncsc.nl/rss/advisories](https://advisories.ncsc.nl/rss/advisories) |

## 🟡 Licenza VERIFICATA, in attesa del feed (24-07-2026)

Queste hanno superato il gate della licenza ma non sono ancora cablate: manca l'URL di un
feed che risponda davvero. **Attenzione ai soft-404**: `www.ncsc.nl/rss` risponde 200
servendo HTML, e i candidati NZ rispondono 200 con una pagina "Page not found". Un 200 che
non è un feed è peggio di un errore — `r.ok` è vero, il parser restituisce lista vuota e la
fonte esce viva e vuota.

| Fonte | Licenza | Dove sta scritto | Cosa manca |
|---|---|---|---|
| **NCSC-NL** (news) | **CC0 1.0**: *«Tenzij anders vermeld is op de inhoud van deze website de Creative Commons zero-verklaring (CC0) van toepassing»*. Esclusi foto e loghi (non li usiamo); attribuzione non obbligatoria | [ncsc.nl/copyright](https://www.ncsc.nl/copyright) | Niente: feed `feeds.ncsc.nl/nieuws.rss` verificato 200, RSS reale, zero redirect. Pronta da cablare |
| **NCSC NZ** | **CC BY 4.0**: *«Crown copyright material on the NCSC and Own Your Online websites is licensed for re-use under the Creative Commons Attribution 4.0 International Licence»* — *«you may copy, distribute, and adapt the material for any purpose, **even commercially**»*. Esclusi loghi, elementi di design e immagini | [ncsc.govt.nz/legal-privacy-and-copyright](https://www.ncsc.govt.nz/legal-privacy-and-copyright/) | **L'URL del feed**: `/rss/` e `/newsroom/rss/` sono soft-404 |
| **ACSC** (AU) | **CC BY 4.0**: *«All material presented on this website is provided under a Creative Commons Attribution 4.0 International licence»*, escluse Coat of Arms, logo ACSC e materiale di terzi. Attribuzione vincolata alla lettera: **«Australian Signals Directorate — © Commonwealth of Australia 2026»** (porta l'anno dentro: si ricontrolla, non si genera) | [cyber.gov.au/acsc/copyright](https://cyber.gov.au/acsc/copyright) (agg. 13-01-2026) | **L'URL del feed**. E una verifica di raggiungibilità: il dominio non risponde dalla rete di sviluppo (3 timeout, poi connessione fallita) — da provare con `wrangler dev` prima del merge, o la fonte finisce in `mancanti` per sempre |

## ❓ In attesa (pagina licenza non raggiungibile o non trovata — ricontrollare prima di usarle)

SANS ISC / DShield (403) · OECD AI Incidents Monitor (T&C 403) · CSIRTS.com (aggregatore
terzo: condizioni proprie da leggere).

## Come si aggiunge una fonte

1. Trovare la **pagina di licenza/termini reale** e leggerla (non fidarsi di ricerche o riassunti).
2. La licenza permette per iscritto l'uso commerciale? No o ambiguo → non entra.
3. Aggiungere la voce qui (con quote e link) **e** in `astro-project/src/data/radar-fonti.js`
   (con `hostsAmmessi`: i link dei feed vengono scartati se puntano fuori dai domini della fonte).
4. Il test `radar.test.mjs` («ogni fonte del registro ha licenza scritta») fa da guardia:
   una fonte senza `licenza.nome`/`licenza.url` non passa la CI.
5. **Verificare il feed eseguendo, non leggendo**: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}"`.
   Serve un 200 **senza redirect** (`scarica()` usa `redirect: 'manual'`) e un corpo che sia
   davvero XML — un 200 che serve HTML è un soft-404 e produce una fonte viva e vuota.

**Fonti che non sono un flusso.** Se la fonte è una tassonomia versionata invece di un feed
(caso MITRE ATLAS), il dato si committa: uno script in `engine/` lo scarica e scrive un
modulo in `src/data/`, e la voce del registro usa `itemsStatici` invece di `feeds`. Gli item
committati passano dalla **stessa** barriera `hostsAmmessi` di quelli dei feed, e due test lo
verificano — uno sul dato generato, uno sulla barriera.
