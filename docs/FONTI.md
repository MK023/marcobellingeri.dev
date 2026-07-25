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
| **NCSC-NL** (Paesi Bassi) | **CC0 1.0**: *«Tenzij anders vermeld is op de inhoud van deze website de Creative Commons zero-verklaring (CC0) van toepassing»*. Esclusi foto e loghi (non li usiamo); attribuzione non obbligatoria, la mettiamo lo stesso | [ncsc.nl/copyright](https://www.ncsc.nl/copyright) | RSS news (`feeds.ncsc.nl/nieuws.rss`) — **non** `www.ncsc.nl/rss`, che è un soft-404 (200 con HTML) |
| **NCSC NZ** | **CC BY 4.0**: *«Crown copyright material … is licensed for re-use under the Creative Commons Attribution 4.0 International Licence»* — *«you may copy, distribute, and adapt the material for any purpose, **even commercially**»*. Esclusi loghi, elementi di design e immagini | [ncsc.govt.nz/legal-privacy-and-copyright](https://www.ncsc.govt.nz/legal-privacy-and-copyright/) | Punto "difesa" **senza feed**: non ne esiste uno (vedi sotto) |
| **International AI Safety Report** | **OGL v3.0**: *«All content is available under OGL v3.0, except where otherwise stated»* · `© 2026 Crown copyright`. Stessa licenza di NCSC UK — riuso commerciale con attribuzione. Segretariato al DSIT britannico | footer di [internationalaisafetyreport.org](https://internationalaisafetyreport.org/) (verificato 24-07-2026) | Punto "IA" **senza feed**: non c'è RSS nel sorgente |
| **Casa Bianca** (Presidential Actions) | **Pubblico dominio**: *«Pursuant to federal law, government-produced materials appearing on this site are not copyright protected»*. Eccezioni: contenuti di terzi (CC BY 3.0) e submission degli utenti — non li usiamo | [whitehouse.gov/copyright](https://www.whitehouse.gov/copyright/) | Punto "regole" **senza feed** (vedi sotto il perché) |
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
| **INCIBE-CERT** (ES) | Aviso legal: la riproduzione è autorizzata solo se *«**No se pretenda un uso comercial**, quedando expresamente prohibidas su distribución, comunicación pública, transformación o descompilación»*. NonCommercial esplicito. Verificato il 25-07-2026 | [incibe.es/aviso-legal](https://www.incibe.es/aviso-legal) |
| **CERT.br** (BR) | **CC BY-NC-ND 4.0** dichiarata nel footer del sito: vieta l'uso commerciale (**NC**) *e* le opere derivate (**ND**). Doppiamente incompatibile — il Radar riusa e rielabora. Verificato il 25-07-2026 | [cert.br](https://www.cert.br/sobre/) · [deed CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.pt-br) |
| **CSA / SingCERT** (SG) | Terms of use: i contenuti *«shall not be reproduced, republished, uploaded, posted, transmitted or otherwise distributed in any way, without the prior written permission of CSA»*; l'unica eccezione è per materiali di public education, *«for **personal, non-commercial use only**»*. Il **Singapore Open Data Licence** (che il commerciale lo permetterebbe) copre i dataset di `data.gov.sg`, **non** gli alert SingCERT sul sito CSA: licenza giusta, perimetro sbagliato. Verificato il 25-07-2026 | [csa.gov.sg/terms-of-use](https://www.csa.gov.sg/terms-of-use/) · [Singapore Open Data Licence](https://data.gov.sg/open-data-licence) |
| **NCSC-IE** (Irlanda) | Solo `© NCSC 2025` nel footer, nessuna licenza di riuso dichiarata e nessun feed RSS nel sorgente. Ambiguo = fuori. Verificato il 25-07-2026 | [ncsc.gov.ie](https://www.ncsc.gov.ie/) |
| **CERT-SE** (Svezia) | Nessuna dichiarazione di licenza o copyright nel footer (solo accessibilità e contatti), e **nessun RSS** nel sorgente: la sottoscrizione è via email. Ambiguo = fuori, e comunque senza flusso. Verificato il 25-07-2026 | [cert.se](https://www.cert.se/) |
| **NCSC-FI / Traficom** (Finlandia) | Footer con il solo `© Traficom`, nessuna licenza di riuso. L'RSS **esiste** (la sezione feed è linkata), quindi il blocco è solo la licenza; la pagina copyright di Traficom risponde 404 e non è stato possibile leggere la primaria. Ambiguo = fuori. Verificato il 25-07-2026 | [kyberturvallisuuskeskus.fi](https://www.kyberturvallisuuskeskus.fi/en) |
| **Cyber Centre** (Canada) | **Chiusa per prudenza, non per licenza negativa** — decisione di Marco del 25-07-2026. Il caso è genuinamente contraddittorio: il [record ufficiale del bollettino](https://open.canada.ca/data/en/info/3a02df5a-84c9-43b4-b483-abfd8e0c24c6) sul portale Open Government dichiara **OGL-Canada**, che concede *«a worldwide, royalty-free, perpetual, non-exclusive licence to use the Information, **including for commercial purposes**»*; il boilerplate `canada.ca` parla però di *«personal and public **non-commercial** use»*, e quella pagina risponde **403** in inglese, in francese e via curl — la primaria non è stata letta. Due pagine ufficiali dello stesso governo che si contraddicono: la regola dice ambiguo = fuori. **Riapribile** se un giorno si legge la primaria e conferma l'OGL: è l'unico candidato con RSS reale e licenza potenzialmente idonea | [OGL-Canada](https://open.canada.ca/en/open-government-licence-canada) · [record del bollettino](https://open.canada.ca/data/en/info/3a02df5a-84c9-43b4-b483-abfd8e0c24c6) |
| **HKCERT** (Hong Kong) | Pagina termini **403**, licenza non verificabile. Non perseguita oltre: una fonte che non lascia leggere le proprie condizioni non entra. Tentato il 25-07-2026 | hkcert.org/terms-and-conditions |
| **CNCERT/CC** (Cina) | **Non valutata per licenza**: prima della conformità c'è una scelta editoriale. È un'agenzia statale cinese, e citarla come fonte su un sito che vende AI security in Europa è una presa di posizione visibile, non un dettaglio tecnico. Decisione di Marco del 25-07-2026: non si persegue | — |

## 🟡 Approvate ma NON cablate

Nessuna, al 24-07-2026: le fonti che hanno superato il gate delle licenze sono tutte
in uso qui sopra. Quelle senza feed entrano come **punto senza bollettini** (stile UE),
non restano in panchina — la licenza verificata è l'unica condizione d'ingresso.

### Perché tre di loro non hanno feed

| Fonte | Cosa ho verificato |
|---|---|
| **NCSC NZ** | `/rss/` e `/newsroom/rss/` rispondono **200 con una pagina "Page not found"** (soft-404). Nel sorgente non c'è un solo `application/rss+xml`: il loro *Subscribe* è una mailing list. Esiste un JSON-LD con 89 alert (url + nome) ma **senza date**: il Radar ordina per data e promette "i bollettini di oggi" — entrerebbe un elenco che non può mantenere quella promessa |
| **International AI Safety Report** | Nessun `rss` nel sorgente (verificato da Marco il 24-07-2026) |
| **Casa Bianca** | Il feed `/presidential-actions/feed/` **esiste ed è valido** (200, `application/rss+xml`, zero redirect), ma porta *tutti* gli atti presidenziali: misurato il 24-07-2026, **0 item su 30** riguardavano l'IA (l'ordine esecutivo di giugno era già fuori dalla finestra). Un filtro per parola chiave alimenterebbe un punto vuoto il 95% del tempo: meglio nessun claim di freschezza |

### ACSC (Australia) — approvata, in attesa di un feed

Licenza a posto: **CC BY 4.0**, *«All material presented on this website is provided under a
Creative Commons Attribution 4.0 International licence»*, escluse Coat of Arms, logo ACSC e
materiale di terzi ([cyber.gov.au/acsc/copyright](https://cyber.gov.au/acsc/copyright), agg.
13-01-2026). Attribuzione vincolata alla lettera: **«Australian Signals Directorate —
© Commonwealth of Australia 2026»** (porta l'anno dentro: si ricontrolla, non si genera).

Manca il feed: nessun `rss` nel sorgente della pagina alerts (verificato da Marco). E resta
un dubbio di raggiungibilità — `cyber.gov.au` non risponde dalla rete di sviluppo (3 timeout,
poi connessione fallita), quindi prima di cablarla va provata da `wrangler dev`.

## ❓ In attesa (pagina licenza non raggiungibile o non trovata — ricontrollare prima di usarle)

SANS ISC / DShield (403) · OECD AI Incidents Monitor (T&C 403) · CSIRTS.com (aggregatore
terzo: condizioni proprie da leggere).

## Come si cerca una fonte nuova (il criterio, non l'elenco)

Emerso il 25-07-2026 dopo un giro a vuoto su nove paesi: **non si cerca un CERT, si cerca una
giurisdizione**. Ogni fonte approvata qui sopra sta in un paese con una politica nazionale di
open government — OGL britannica, Licence Ouverte francese, CC0 olandese, CC BY neozelandese e
australiana. Nessuna è entrata per il fatto di essere un CERT: è entrata perché quel governo
aveva già deciso, per legge, che i suoi contenuti si riusano.

Corollario pratico: le directory di team (FIRST, indici vari) servono a **enumerare**, non a
selezionare. Percorrerle a tappeto costa una verifica a testa e produce quasi solo no — il giro
del 25-07 è finito 0 su 9. Partire invece dall'elenco dei paesi con licenza pubblica aperta, e
solo lì cercare il CERT, inverte il rapporto fra verifiche e risultati.

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
