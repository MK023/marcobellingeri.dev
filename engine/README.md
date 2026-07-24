# engine/

Backend del sito — pipeline **ingest → embed → (regole editoriali) → publish**, più il
radar competitor del Canale 2. Node/TS, una sola toolchain col sito (ADR-0004).
**Zero dipendenze npm**: usa `fetch` globale di Node ≥20.

> **Cosa produce questo engine, e cosa no.** L'engine scrive **solo** il *magazine*
> (`content/magazine/`): casi di adozione dell'IA in aziende terze, ricavati dalle
> fonti. Le altre due sezioni editoriali del sito non hanno pipeline e non ne
> vogliono una: **Field Notes** (`content/cases/`) sono i casi di lavoro di Marco e
> **Edicola** (`content/writing/`) sono i pezzi sui suoi progetti — entrambe scritte
> a mano, perché la fonte è lui. Di `writing` l'engine automatizza la sola
> *distribuzione* (`devto.mjs`, `edicola.mjs`), mai la scrittura.

## Principio: human-in-the-loop

L'engine raccoglie, verifica e struttura i dati. La **scrittura e l'approvazione**
del numero restano un gate umano (Marco): un numero non passa a `published` senza
approvazione. `match_article_chunks` è gated a `published` → un draft non è mai
retrievabile né pubblico.

Dal 2026-07-21 il ciclo è in **autopilot** (workflow `magazine-ingest` mensile +
`magazine-advance` giornaliero): l'automazione esegue solo lo stadio che l'ultimo
gesto umano in Studio ha sbloccato — verify dei signal → `generate`, approvazione
→ `embed`+`export` → PR di contenuto. I gate non si spostano: si spostano i
copia-incolla.

## Segreti (via Doppler — mai in chiaro nel repo)

Ogni comando gira sotto `doppler run --`. Env attesi:

| Env | Uso |
|-----|-----|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | scrittura DB via REST |
| `EMBEDDING_API_KEY` | Voyage voyage-3.5 (embedding 1024-dim) |
| `VALYU_API_KEY` | sourcing Canale 1 |
| `FIRECRAWL_API_KEY` | scraping competitor Canale 2 |
| `DEVTO_API_KEY` | cross-post writing collection su dev.to (`devto.mjs`, `edicola.mjs`) |
| `PERPLEXITY_API_KEY`, `GSC_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GSC_SITE_URL` | monitor discoverability (`visibility.mjs`) |
| `LANGFUSE_BASE_URL/_PUBLIC_KEY/_SECRET_KEY` | tracing (opzionali: senza, il tracing è no-op) |
| `SENTRY_DSN` | error tracking (opzionale: senza, `lib/sentry.mjs` è no-op) |

## Osservabilità

Ogni script emette una **trace Langfuse** via endpoint OTel (`lib/langfuse.mjs`,
OTLP HTTP/JSON, zero deps): `ingest-proof-pass`, `embed-articles`,
`competitor-radar` (in CI: ogni run mensile del radar = una trace ispezionabile).
**Fail-open by design**: senza chiavi = disattivo; un errore di invio non rompe
mai la pipeline. Input/output degli span = riassunti piccoli, mai `raw_content`
di terzi. I cron (radar, keepalive) aprono una **GitHub Issue automatica** se
falliscono — nessun rosso silenzioso.

Un fallimento però non fa rumore: quello in cui il cron **non parte affatto**
(GitHub spegne gli schedule dopo 60 giorni di inattività sul repo). L'issue
automatica scatta se il ping *fallisce*, non se non arriva mai — ed è proprio
l'assenza che manda in pausa il database. Per questo il keepalive fa anche un
**check-in a un cron monitor Sentry**, che si allarma sul silenzio e sta *fuori*
da GitHub: un guardiano dentro lo stesso dominio di guasto che sorveglia non è un
guardiano. Il check-in non può far fallire il ping.

Gli **errori** vanno a Sentry: ogni script ha un catch top-level
(`lib/sentry.mjs`, envelope API via fetch, zero deps) che manda stack, nome
dello script ed environment `engine` prima di uscire con exit 1 — stessa
semantica esterna di un crash nudo, la CI e le issue automatiche non vedono
differenza. Fail-open come Langfuse: senza `SENTRY_DSN` è un no-op, e un invio
fallito non aggiunge mai danno a uno script già in errore. Da lì il flusso
onesto: errore → Sentry → Seer analizza → fix in PR.

## Comandi

```bash
doppler run -- node engine/ingest.mjs <vertical> [--angle "<focus>"]  # Valyu proof pass -> signals
doppler run -- node engine/generate.mjs <settore> [--angle "<focus>"] # signal verify -> caso del magazine IT+EN (status=draft)
doppler run -- node engine/embed.mjs                                   # chunk+embed article_chunks
doppler run -- node engine/export.mjs [<period YYYY-MM>]               # numero approvato -> MD del magazine -> published
doppler run -- node engine/retrieve.mjs "<query>" [it|en]              # healthcheck RAG (gated a published)
doppler run -- node engine/competitors.mjs [--limit N]                 # Firecrawl -> snapshots -> chunks
doppler run -- node engine/visibility.mjs [--limit N]                  # monitor discoverability (SEO+AEO)
doppler run -- node engine/devto.mjs <slug> [--publish]                # cross-post writing -> dev.to (draft di default)
doppler run -- node engine/devto.mjs --due                             # uscita programmata: pubblica i pezzi con la data arrivata
doppler run -- node engine/edicola.mjs                                 # card Edicola dagli articoli pubblicati su dev.to
doppler run -- node engine/advance.mjs                                 # decide lo stadio del magazine da eseguire (stampa e basta)
doppler run -- node engine/judge.mjs <period YYYY-MM>                  # LLM-as-a-judge sul numero esportato (referto + exit code)
doppler run -- node engine/radar-signals.mjs [--dry]                   # bollettini del Radar -> candidati-prova sul numero draft (dopo ingest)
node engine/lib/voyage.mjs                                             # self-check del chunker (no rete)
node engine/lib/guardrails.mjs                                         # self-check barriere di contenuto (no rete)
node engine/export.mjs --selfcheck                                     # self-check frontmatter/mappatura (no rete)
```

## Moduli

- `lib/supabase.mjs` — REST client PostgREST (service_role): `select/insert/update/remove/rpc`.
- `lib/voyage.mjs` — `chunk()` paragraph-aware + `embed()` voyage-3.5 (`document`/`query`) + `toVector()`.
- `lib/valyu.mjs` — `search()` su `/v1/search` (motore di sourcing primario).
- `lib/anthropic.mjs` — client Messages zero-dep: `generateJson()` (structured output) + `countTokens()`, con retry/backoff e rate-limit. Modello: `claude-sonnet-5`.
- `lib/guardrails.mjs` — barriere di contenuto SEMPRE attive: `sanitizeSource`/`sourceIsPoisoned` (input di terzi), `screen`/`validateArticle` (output prima del DB), `slugify`.
- `primary-sources.json` — registro allowlist fonti primarie (proof pass); curato a mano.
- `blocklist.json` — blacklist editoriale (termini/regex) curata a mano; livello aggiuntivo sopra i `DENY_PATTERNS` anti-injection di `guardrails.mjs`.
- `generate.mjs` — **stadio 2 GENERATE**: signal `verify` → un caso del magazine IT+EN (problema/approccio/risultato/lezione) grounded solo sulle fonti → `status=draft`. NON embedda, NON pubblica (gate umano).
- `export.mjs` — **stadio 5 EXPORT**: numero `approved` → file Markdown in `astro-project/src/content/magazine/{it,en}/` → `status=published`. Mappatura inversa (application→approach, solution→result, body→lesson), ri-screening prima di scrivere nel repo. NON committa: il contenuto lo merge Marco.
- `retrieve.mjs` — read-end del RAG (query→match_article_chunks). NON è l'endpoint pubblico C1 (rate-limit/guardrail/AI-Act = roadmap).
- `visibility.mjs` — monitor discoverability: SEO (Google Search Console) + AEO (Perplexity Sonar), referto prescrittivo con trend vs run precedente, storico su Supabase (`visibility_observations`). Descope dichiarato: le righe GSC hanno `query_id` null (nessun legame best-effort con `visibility_queries`) e il referto è due liste piatte, non raggruppato per `content_ref` — si riapre se il volume lo giustifica.
- `devto.mjs` — cross-post canonical-first della writing collection su dev.to (`lib/devto.mjs`): idempotente per `canonical_url` (re-run = update), draft di default, live solo con `--publish`; un re-run senza flag non spubblica mai un pezzo già uscito. Il draft parte da solo in CI al merge di un articolo (`devto-draft.yml`). Con `--due` è l'**uscita programmata**: il decisore puro `inUscita()` (testato a secco) sceglie i pezzi la cui `date` è arrivata e che non sono ancora live, il cron `devto-publish-due.yml` li pubblica e apre il preavviso di 24h per quelli di domani. L'approvazione umana resta **una sola**, al merge della PR.
- `edicola.mjs` — card automatiche dell'Edicola: interroga dev.to (articoli **pubblicati** con canonical sul sito) e aggiunge le card mancanti a `src/data/edicola.json` (merge puro in `lib/edicola.mjs`, dedupe per slug e per url; etichetta dal frontmatter `edicola` o dal titolo). Il cron `edicola-card.yml` apre la PR e la porta in produzione a gate verdi.
- `radar-signals.mjs` — i bollettini che il Radar già aggrega (licenze verificate in `docs/FONTI.md`) entrano come candidati-prova `stage='discovery'` sul numero draft del periodo, `category='radar'`, tier NULL: il verify umano e il gate 0006 non cambiano. Gira dopo ingest nello stesso workflow; senza numero draft esce a mani vuote. Mapping puro in `lib/radar-signals.mjs`. Il KEV resta fuori (niente url per voce).
- `advance.mjs` — il decisore del magazine automatico: legge lo stato a DB e stampa lo stadio da eseguire (`export <period>` | `embed` | `generate <sector>` | `niente`). Decisione pura in `lib/advance.mjs` (testata a secco); l'esecuzione sta nel workflow `magazine-advance.yml`. Stati anomali → «serve un occhio umano», mai loop.
- `judge.mjs` — **LLM-as-a-judge sulla PR di contenuto** (workflow `magazine-judge.yml`, dispatchato da advance): rubrica a 5 criteri ancorati (parità IT/EN, ancoraggio delle cifre, answer-first, stile anti-slop, lezione trasferibile) con structured output, tracciata su Langfuse. **La politica del gate è scritta in `lib/judge.mjs` ed è testata**: bocciano i difetti deterministici, i voti ≤2 e i criteri assenti (fail-closed); il 3 è un avviso non bloccante — il gate boccia il rotto, non il migliorabile. Il judge valuta la **coerenza interna** (attribuzioni presenti nel testo), non la verità sulle fonti: quella resta al gate umano in Studio, che le fonti le ha. Il referto va in commento sulla PR; il merge resta di Marco. Renderlo check obbligatorio nel ruleset = click di Marco (accensione documentata). Un caso che contiene istruzioni al giudice prende 1 in stile: l'injection tentata È un difetto editoriale.

## Test

```bash
npm test                              # unit + integration (zero rete, e2e skippa)
doppler run -- npm run test:e2e       # e2e live: dati sintetici 9999-01 + teardown
```

- **Unit**: chunker, registro fonti, guardie CLI. **Integration** (fetch mockato):
  invarianti editoriali della discovery, allowlist, batching Voyage, client.
- **Visibility** (contratto pipeline/test): unit sul match host/citazione
  (`lib/urlmatch.mjs`, suffix-attack incluso) e sul ruleset prescrizioni
  (`lib/referto.mjs`); integration a spawn con `fetch` moccato
  (`test/visibility.test.mjs`). Il run reale è schedulato settimanale (GitHub
  Actions), non in CI: query verso Perplexity/GSC costano e non sono
  deterministiche. Segreti Perplexity/GSC su Doppler, scope GSC read-only.
- **E2E (gated)**: prova che il **publish gate a DB** (migration 0006) morde a ogni
  anello mancante — niente prova Tier-1/2-indip, niente articolo it+en, niente
  embedding → publish rifiutato; catena completa → passa, draft mai retrievabile.
- NB: dev e prd Doppler puntano oggi allo **stesso** progetto Supabase; lo split
  vero (progetto prod dedicato) avverra' al go-live — migrations+seed lo rendono
  un'operazione da minuti.

## Sicurezza

- Il testo scrapato di terzi (`signals.raw_content`, summary competitor) è **dato non
  fidato**: in generazione va trattato come contenuto, mai come istruzioni (delimitatori).
  In `generate.mjs` questo è **imposto**, non solo raccomandato: `lib/guardrails.mjs`
  sanifica e screena le fonti in ingresso (scarta quelle con injection palese) e
  **valida + screena l'output prima di scrivere a DB** (script attivo, injection,
  blacklist, lunghezze, malformazioni → la scrittura si blocca).
- Difesa in profondità: structured output a schema, `count_tokens` con tetto duro,
  segreto solo in header (mai loggato), nessun eval/shell.
- Il gate umano pre-publish resta la mitigazione principale: `generate.mjs` scrive
  solo `status=draft`.
