# Visibility Monitor — design spec

- **Data:** 2026-07-18
- **Progetto:** marcobellingeri.dev — nuovo modulo `engine/`
- **Stato:** design approvato, in attesa di piano d'implementazione
- **Tipo:** occhio privato di discoverability (SEO + AEO/GEO), sola misura + referto prescrittivo

## Scopo

Un motore che **misura** dove i contenuti del sito sono trovati — dai motori di
ricerca classici (SEO) e dagli answer engine AI (AEO/GEO) — e produce un **referto
prescrittivo** che dice, pezzo per pezzo, *cosa* adattare e *perché*.

Il motore non riscrive niente. Chiude un anello di feedback: misura → referto →
Marco adatta i contenuti esistenti a mano (con la skill `humanizer`). I contenuti già
pubblicati (numero #1, `audit-di-se`, timeline, copy del sito) non sono stati scritti
pensando a come li cita un answer engine: il referto è la lista di lavoro per adattarli,
guidata dai dati e non dall'intuizione.

## Decisioni dal brainstorm (fissate)

1. **Mestiere:** monitor di discoverability, non audit on-page né ottimizzatore in pipeline.
2. **Destinazione:** occhio privato (loop) — vive in `engine/` + Supabase, lo vede solo
   Marco. Nessuna esposizione pubblica sul sito in v1 (rischio "zero citazioni in vetrina").
3. **Output:** referto **prescrittivo** ("adatta X, qui, così, perché"). L'adattamento lo
   fa Marco, non il motore.
4. **Fonti v1:** Google Search Console (SEO, gratis, first-party) + Perplexity Sonar
   (AEO, citazioni incluse nella risposta, costo pay-as-you-go in centesimi). Solo il
   proprio sito, nessun confronto competitor.
5. **Nome:** `engine/visibility.mjs`. **Cadenza:** settimanale via GitHub Actions.

## Non-obiettivi (v1)

Esplicitamente fuori scope, per non fare scope creep sulla decisione "sola misura":

- Confronto con i competitor (`consulenzacloud.it` e altri) → Fase 2.
- Altri answer engine oltre Perplexity (Claude web-search, ecc.) → Fase 2.
- **Adapter automatico** che riscrive i contenuti esistenti (era l'opzione "ottimizza in
  pipeline", rimandata) → Fase 2, da valutare quando il referto avrà mostrato se serve.
- Esposizione pubblica del cruscotto sul sito → Fase 2.

## Architettura

Il modulo ricalca il pattern del **radar competitor** (`engine/competitors.mjs`): fetch
esterno periodico → riga snapshot storica su Supabase. Riuso, non invenzione.

- **Script:** `engine/visibility.mjs` — orchestrazione: legge le query attive, interroga
  i due segnali, scrive le osservazioni, rende il referto.
- **Adattatori di segnale (nuovi lib):**
  - `engine/lib/perplexity.mjs` — client Sonar + estrazione/normalizzazione citazioni.
  - `engine/lib/gsc.mjs` — client Search Analytics (OAuth2 read-only).
- **Riuso diretto dagli idiomi esistenti:**
  - `lib/supabase.mjs` — persistenza via `pg`/`select`/`insert` (barriera PostgREST già in posa).
  - `lib/langfuse.mjs` — un trace per run, uno span per segnale/query.
  - `lib/logsafe.mjs` — sui valori loggati.
  - Guardia costo `--limit N` (con guardia anti-footgun come in `competitors.mjs`).
  - Resilienza: un segnale/una query che fallisce non ferma il run (`try/continue`).
  - `fetch` nativo Node ≥20, zero dipendenze nuove.
- **Esecuzione:**
  - Manuale: `doppler run -- node engine/visibility.mjs` (`--limit` per test/ops).
  - Schedulata: nuovo workflow GitHub Actions **settimanale** (separato dalla Backend CI).

## Modello dati

Due tabelle, speculari a `competitor_sources` / `competitor_snapshots`. Migration
Supabase versionata; RLS su entrambe; grant di tabella per il `service_role` come da
pattern esistente. Nessuna lettura pubblica (dato privato).

### `visibility_queries` — le domande target (input per Perplexity)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `text` | text | la domanda target (es. "chi è un AI security engineer in Italia") |
| `locale` | text | `it` \| `en` |
| `market` | text | `naz` \| `internaz` |
| `content_ref` | text nullable | slug del contenuto che *dovrebbe* soddisfarla (es. `audit-di-se`) — il filo gap→pezzo→prescrizione |
| `active` | boolean | default true |
| `created_at` | timestamptz | default now() |

### `visibility_observations` — serie storica (entrambi i segnali)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK | |
| `run_at` | timestamptz | timestamp del run (raggruppa un'esecuzione) |
| `engine` | text | `perplexity` \| `gsc` |
| `query_id` | uuid nullable FK → `visibility_queries.id` | valorizzato per Perplexity; per GSC nullable (le query vengono *da* GSC) |
| `present` | boolean | citato (Perplexity) / compare (GSC) |
| `rank` | numeric nullable | posizione nelle citazioni (Perplexity) / posizione media (GSC) |
| `detail` | jsonb | campi specifici per engine (URL matchato, query GSC, impression, clic, CTR) |
| `raw` | text | risposta grezza cappata (30k, come il cap markdown di competitors) |
| `created_at` | timestamptz | default now() |

## I due segnali

### Perplexity Sonar (AEO/GEO)

Per ogni `visibility_query` attiva:

1. POST all'endpoint Sonar con `text` come domanda (query template curate con
   **prompt-master** in fase di piano — IT/EN, naz/internaz).
2. Le **citazioni sono incluse gratis** nella risposta (5-10 URL fonte). Si legge
   l'array citazioni/`search_results`.
3. **Match sull'host** `marcobellingeri.dev`, normalizzato: `www.`, slash finale,
   `http`/`https`, case, sottodomini. Questo è il cuore: un match sbagliato dice
   "non citato" quando lo sei (o viceversa).
4. Si registra un'osservazione: `present` = trovato, `rank` = posizione nell'elenco
   citazioni, `detail.matched_url` = quale URL.

**Sicurezza:** la risposta Perplexity è **input non fidato** (OWASP LLM: l'output di un
motore è input non fidato). Si usa **solo** per host-match e per lo storico grezzo
cappato — mai in `eval`, mai interpolata in una query senza la barriera `pg`, mai nel DOM.

### Google Search Console (SEO)

Non si pongono domande: si interroga la propria proprietà.

1. OAuth2 **read-only** (`webmasters.readonly`), refresh token via Doppler.
2. `searchAnalytics/query` sulla proprietà, dimensioni `[query, page]`, finestra
   temporale (ultimi 28 giorni; GSC ha ~2-3 giorni di ritardo dati).
3. Si salvano le top-N righe come osservazioni `engine=gsc`, `present=true`,
   `rank=position`, `detail={query, page, impressions, clicks, ctr}`.
4. Per il referto, si tenta di **legare** la query GSC a una `visibility_query`
   confrontando il testo (best-effort), così SEO e AEO parlano dello stesso contenuto.

**Costo:** GSC gratis, nessun costo d'uso. Perplexity pay-per-token, ordine dei
centesimi a settimana per qualche decina di query. Cadenza settimanale + `--limit` per
i test mantengono il costo trascurabile (deroga free-tier-first già accettata, tipo Valyu).

## Referto prescrittivo

Markdown, raggruppato **per contenuto** (via `content_ref`) e per query. Per ogni voce:

- **AEO (Perplexity):** citato sì/no, con **trend vs run precedente** (nuovo/perso/stabile).
- **SEO (GSC):** posizione media e **delta** vs run precedente sulle query legate.
- **Prescrizione** (solo quando c'è un gap e un `content_ref`): una riga d'azione
  concreta, da un piccolo **ruleset statico** di euristiche mappate sullo stato del
  segnale. Esempi:
  - citato=no + il pezzo esiste (`content_ref` valorizzato) → *"il contenuto c'è ma non
    emerge: verifica che risponda alla domanda in modo estraibile — un H2 che è la
    domanda, risposta secca in apertura, `FAQPage` schema."*
  - nessun `content_ref` per una query attiva → *"nessun contenuto copre questa domanda:
    candidato per un nuovo pezzo d'Edicola."*
  - GSC posizione in calo → *"perdi posizione su «query»: controlla title/description e
    freschezza."*

Il ruleset è **statico e piccolo** di proposito: la prescrizione generata da LLM
(`anthropic.mjs` è in stack) è più ricca ma sconfina nell'adapter — resta Fase 2.
Le righe di osservazione restano su Supabase per lo storico; il referto è derivato.

## Contratto di test (modello MUST)

**Prima** di scrivere test o CI si leggono `~/GitHub/Atlas/concepts/pipeline-cicd.md` e
`~/GitHub/Atlas/concepts/testing-pyramid.md` (regola 10). Forma dichiarata:

- **Unit (cuore):** la **normalizzazione host / match citazione** — casi `www`, slash
  finale, `http` vs `https`, maiuscole, sottodominio, host che *contiene* la stringa ma
  non è il dominio (`marcobellingeri.dev.evil.com`). È la logica-soldi: un test che
  **cade** se la logica si rompe. Candidato a **mutation score** bloccante (coverage ≠ verifica).
- **Unit:** parsing riga GSC; selezione della prescrizione dal ruleset dato lo stato.
- **Integration:** `fetch` moccato per entrambe le API, **zero rete** — come i test
  engine esistenti (`npm test`, unit + integration).
- **Coverage:** *clean as you code* sul nuovo.
- **OWASP:** tassonomia LLM (output del motore = input non fidato) come classe di test.
- **Flaky:** N/A (nessuna rete nei test).

## Pipeline (modello MUST)

- Test unit/integration del modulo girano nella **Backend CI** esistente (`npm test`),
  come gate sulla PR.
- Il **run vero** è un workflow GitHub Actions **schedulato settimanale**, separato dalla
  CI (la CI valida il codice, non esegue il monitor).
- Il livello di maturità della pipeline resta quello dell'engine; questo modulo aggiunge
  un job schedulato + test gated. Da dichiarare in `engine/README.md`: dove la pipeline
  si ferma e perché, più il contratto di test qui sopra.
- Segreti (`PERPLEXITY_API_KEY`, credenziali OAuth GSC) su **Doppler**, mai nel repo;
  scope GSC read-only.

## Sequenza di build (bozza, per il piano)

1. Migration Supabase: `visibility_queries` + `visibility_observations`, RLS, grant.
2. `lib/perplexity.mjs` + unit test sul match-host (TDD: test prima).
3. `lib/gsc.mjs` + unit test parsing.
4. `visibility.mjs` orchestrazione + integration test con `fetch` moccato.
5. Rendering referto + ruleset prescrizioni + unit test sulla selezione.
6. Workflow GitHub Actions settimanale.
7. Aggiornamento `engine/README.md` (contratto pipeline/test) + Atlas + Notion.

Le query template Perplexity (il seed di `visibility_queries`) si disegnano con
**prompt-master** in fase di piano.

## Fonti verificate (2026-07-18)

- Perplexity Sonar — citazioni incluse in risposta, pricing pay-per-token:
  <https://docs.perplexity.ai/docs/getting-started/pricing>
- Google Search Console Search Analytics API — gratis, first-party, read-only:
  <https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics>
