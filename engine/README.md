# engine/

Backend del sito — pipeline **ingest → embed → (regole editoriali) → publish**, più il
radar competitor del Canale 2. Node/TS, una sola toolchain col sito (ADR-0004).
**Zero dipendenze npm**: usa `fetch` globale di Node ≥20.

## Principio: human-in-the-loop

L'engine raccoglie, verifica e struttura i dati. La **scrittura e l'approvazione**
del numero restano un gate umano (Marco): un numero non passa a `published` senza
approvazione. `match_article_chunks` è gated a `published` → un draft non è mai
retrievabile né pubblico.

## Segreti (via Doppler — mai in chiaro nel repo)

Ogni comando gira sotto `doppler run --`. Env attesi:

| Env | Uso |
|-----|-----|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | scrittura DB via REST |
| `EMBEDDING_API_KEY` | Voyage voyage-3.5 (embedding 1024-dim) |
| `VALYU_API_KEY` | sourcing Canale 1 |
| `FIRECRAWL_API_KEY` | scraping competitor Canale 2 |
| `DEVTO_API_KEY` | cross-post writing collection su dev.to (`devto.mjs`) |
| `LANGFUSE_BASE_URL/_PUBLIC_KEY/_SECRET_KEY` | tracing (opzionali: senza, il tracing è no-op) |

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

## Comandi

```bash
doppler run -- node engine/ingest.mjs <vertical> [--angle "<focus>"]  # Valyu proof pass -> signals
doppler run -- node engine/generate.mjs <settore> [--angle "<focus>"] # signal verify -> caso Field Notes IT+EN (status=draft)
doppler run -- node engine/embed.mjs                                   # chunk+embed article_chunks
doppler run -- node engine/export.mjs [<period YYYY-MM>]               # numero approvato -> Field Notes MD -> published
doppler run -- node engine/retrieve.mjs "<query>" [it|en]              # healthcheck RAG (gated a published)
doppler run -- node engine/competitors.mjs [--limit N]                 # Firecrawl -> snapshots -> chunks
doppler run -- node engine/visibility.mjs [--limit N]                  # monitor discoverability (SEO+AEO)
doppler run -- node engine/devto.mjs <slug> [--publish]                # cross-post writing -> dev.to (draft di default)
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
- `generate.mjs` — **stadio 2 GENERATE**: signal `verify` → un caso Field Notes IT+EN (problema/approccio/risultato/lezione) grounded solo sulle fonti → `status=draft`. NON embedda, NON pubblica (gate umano).
- `export.mjs` — **stadio 5 EXPORT**: numero `approved` → file Markdown Field Notes in `astro-project/src/content/cases/{it,en}/` → `status=published`. Mappatura inversa (application→approach, solution→result, body→lesson), ri-screening prima di scrivere nel repo. NON committa: il contenuto lo merge Marco.
- `retrieve.mjs` — read-end del RAG (query→match_article_chunks). NON è l'endpoint pubblico C1 (rate-limit/guardrail/AI-Act = roadmap).
- `visibility.mjs` — monitor discoverability: SEO (Google Search Console) + AEO (Perplexity Sonar), referto prescrittivo con trend vs run precedente, storico su Supabase (`visibility_observations`). Descope dichiarato: le righe GSC hanno `query_id` null (nessun legame best-effort con `visibility_queries`) e il referto è due liste piatte, non raggruppato per `content_ref` — si riapre se il volume lo giustifica.
- `devto.mjs` — cross-post canonical-first della writing collection su dev.to (`lib/devto.mjs`): idempotente per `canonical_url` (re-run = update), draft di default, live solo con `--publish`; un re-run senza flag non spubblica mai un pezzo già uscito. Il trigger resta umano: si pubblica quando Marco decide, lo script toglie solo il copia-incolla.

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
