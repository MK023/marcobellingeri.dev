# ADR 0001 — Architettura: hosting, i18n, rilevamento lingua, motore mensile

- **Stato**: Accettato
- **Data**: 2026-07-05
- **Decisori**: Marco (navigator), Claude
- **Blocco**: B1 (architettura → decide l'hosting)

## Contesto

`marcobellingeri.dev` è la **business card tecnica** di Marco per un progetto più
grande (in arrivo): un **canale YouTube** — casi reali di applicazione e uso di
IA/tecnologia, rivolto a un pubblico **over/senior anglosassone** che ancora non
padroneggia questi strumenti, con estetica **noir** coerente col sito. Il sito
gli farà da hub/landing.

Vincoli che guidano l'architettura:

- **Bilingue IT/EN** con **SEO e AEO internazionali** come obiettivo primario
  (target principale anglosassone).
- **Rilevamento automatico della lingua** in base a chi richiede (geo/IP + lingua
  browser).
- **Security by design**, piattaforma coerente col mondo di Marco (già usa
  Cloudflare Zero Trust altrove).
- Evoluzione di un sito Astro già esistente (identità "90s magazine", numeri
  mensili, archivio via Firecrawl), **non** un rifacimento.
- **Numeri mensili** ("magazine anni '90"): ogni mese un numero, articoli reali
  (caso → applicazione → soluzione); i visitatori possono **richiamare numeri
  precedenti**.

## Decisioni

### 1. Hosting: Cloudflare **Workers** (static assets) + adapter `@astrojs/cloudflare`
Non Pages. I docs Cloudflare indicano Workers come strada moderna (Pages ha già
una guida di migrazione → Workers); Workers aggiunge **Cron Triggers**,
osservabilità e accesso nativo a **Workers AI / Vectorize** sulla stessa
piattaforma — utile per il RAG futuro. Astro è framework first-class su CF.

### 2. Rendering: **static-first, prerender per-lingua**
Nessun backend a runtime finché non serve (YAGNI). HTML statico pulito e veloce =
ottimale per SEO **e AEO** (gli answer-engine vogliono contenuto crawlabile, non
RAG dietro JavaScript). Il "progetto collegato" (canale YT) potrà aggiungere
in seguito **una** funzione edge, non un backend sempre attivo.

### 3. i18n: Astro nativo, `prefixDefaultLocale: true`
URL `/it/…` e `/en/…` **entrambi prefissati** → nessun default ambiguo, hreflang
espliciti, migliore per SEO internazionale. Aggiungere `x-default`, **sitemap per
lingua**, e uno **switcher lingua visibile**. Contenuti (numeri passati e nuovi) =
**content collections bilingui**; l'archivio e il richiamo dei numeri precedenti
sono **rotte statiche crawlabili**.

### 4. Rilevamento lingua per geo/IP: **sì, ma SEO-safe**
Tensione nota: Google **sconsiglia l'auto-redirect per IP/browser** — Googlebot
crawla da IP USA e verrebbe sempre dirottato su `/en/`, mancando l'indicizzazione
di `/it/`. Reconciliazione adottata:

- Entrambe le lingue restano **URL statici sempre crawlabili** con hreflang +
  `x-default`.
- Il geo-redirect vive **solo sul root `/`**, tramite un **Worker** che legge
  `request.cf.country` + `Accept-Language`.
- **Solo per utenti umani**: i crawler noti (Googlebot, bingbot, ecc.) **non**
  vengono redirezionati.
- **Override utente** via cookie (la scelta manuale vince sul geo) + switcher
  visibile.
- Redirect solo su `/` (302), **mai** sulle URL di lingua già risolte.

### 5. Motore del numero mensile (dettaglio in B2)
Agente/i AI generano il numero → commit → **Workers Build** auto-deploy. Trigger:
**GitHub Action** (come ora) *oppure* **Cloudflare Cron Trigger** — deciso in B2.

### 6. RAG: **differito** (YAGNI)
Quando il componente live / il canale YT lo richiederà: **Cloudflare Vectorize +
Workers AI** (nativo, un'unica piattaforma, coerente col "security by design").
Alternativa: **Supabase pgvector** (già padroneggiato in monferrinoAI/rubble).

### 7. Security by design
WAF/managed rules Cloudflare; header di sicurezza portati da `vercel.json` →
Workers/`_headers`; secret in **Workers env** (mai in repo); repo **privata durante
il build → pubblica al go-live** (sblocca secret scanning + push protection +
ruleset gratis).

## Note — uso di Firecrawl

- **Ruolo**: scraping strutturato delle fonti (competitor/mercato/security) che
  alimenta la generazione del numero. Oggi: `astro-project/firecrawl_issue.py`,
  eseguito da GitHub Action mensile, scrive JSON statici in
  `public/data/issues/` letti dal browser.
- **Fonti** (`SOURCES` nello script): Troy Hunt, Julia Evans, Simon Willison,
  Corey Quinn (Last Week in AWS), ecc. — da rivedere per il posizionamento reale.
- **Chiave**: `FIRECRAWL_API_KEY` **solo** nei secret (GitHub Secrets oggi →
  Workers env in futuro), **mai** nel repo. Nello script è letta via
  `os.environ`; il `fc-xxxxxxxx` nei commenti è un placeholder.
- **Evoluzione (B2)**: da "scrape → JSON" a "scrape → generazione con LLM →
  store (RAG) → numero bilingue". Firecrawl resta lo strato di raccolta; sopra si
  aggiunge la generazione (Claude/Python) e l'eventuale indicizzazione Vectorize.
- **Precondizione**: mantenere Firecrawl entro la CSP/allowlist e loggare cosa
  viene raccolto (tracciabilità).

## Conseguenze

**Pro**: un'unica piattaforma (Workers) per statico + edge + AI/RAG futuro; SEO/AEO
massimizzati dallo statico + hreflang; geo-lang senza sacrificare l'indicizzazione;
superficie d'attacco minima finché non serve un runtime; portabilità del contenuto
(content collections) indipendente dall'host.

**Contro / da presidiare**: il Worker di geo-redirect va testato contro i crawler
(rischio SEO se mal fatto); la migrazione degli header da `vercel.json` a CF va
verificata; Vectorize/Workers AI sono nuovi nello stack di Marco (docs prima
dell'uso).

## Riferimenti (docs consultati)

- Cloudflare — Deploy Astro / Workers static assets / migrazione Pages→Workers:
  <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>
- Cloudflare — Pages framework guide (Astro):
  <https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/>
- Astro — Internationalization (i18n) routing:
  <https://docs.astro.build/en/guides/internationalization/>
- Google Search Central — Managing multi-regional and multilingual sites
  (sconsiglia l'auto-redirect per IP; usa hreflang + scelta utente):
  <https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites>
