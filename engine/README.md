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

## Comandi

```bash
doppler run -- node engine/ingest.mjs <vertical> [--angle "<focus>"]  # Valyu proof pass -> signals
doppler run -- node engine/embed.mjs                                   # chunk+embed article_chunks
doppler run -- node engine/retrieve.mjs "<query>" [it|en]              # healthcheck RAG (gated a published)
doppler run -- node engine/competitors.mjs [--limit N]                 # Firecrawl -> snapshots -> chunks
node engine/lib/voyage.mjs                                             # self-check del chunker (no rete)
```

## Moduli

- `lib/supabase.mjs` — REST client PostgREST (service_role): `select/insert/update/remove/rpc`.
- `lib/voyage.mjs` — `chunk()` paragraph-aware + `embed()` voyage-3.5 (`document`/`query`) + `toVector()`.
- `lib/valyu.mjs` — `search()` su `/v1/search` (motore di sourcing primario).
- `primary-sources.json` — registro allowlist fonti primarie (proof pass); curato a mano.
- `retrieve.mjs` — read-end del RAG (query→match_article_chunks). NON è l'endpoint pubblico C1 (rate-limit/guardrail/AI-Act = roadmap).

## Test

```bash
npm test                              # unit + integration (zero rete, e2e skippa)
doppler run -- npm run test:e2e       # e2e live: dati sintetici 9999-01 + teardown
```

- **Unit**: chunker, registro fonti, guardie CLI. **Integration** (fetch mockato):
  invarianti editoriali della discovery, allowlist, batching Voyage, client.
- **E2E (gated)**: prova che il **publish gate a DB** (migration 0006) morde a ogni
  anello mancante — niente prova Tier-1/2-indip, niente articolo it+en, niente
  embedding → publish rifiutato; catena completa → passa, draft mai retrievabile.
- NB: dev e prd Doppler puntano oggi allo **stesso** progetto Supabase; lo split
  vero (progetto prod dedicato) avverra' al go-live — migrations+seed lo rendono
  un'operazione da minuti.

## Sicurezza

- Il testo scrapato di terzi (`signals.raw_content`, summary competitor) è **dato non
  fidato**: in generazione va trattato come contenuto, mai come istruzioni (delimitatori).
- Il gate umano pre-publish è la mitigazione principale.
