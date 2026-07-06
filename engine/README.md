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
doppler run -- node engine/ingest.mjs <vertical>   # Valyu -> signals (regole 3-tier)
doppler run -- node engine/embed.mjs               # chunk+embed article_chunks del draft
doppler run -- node engine/competitors.mjs         # Firecrawl -> competitor_snapshots -> chunks
node engine/lib/voyage.mjs                          # self-check del chunker (no rete)
```

## Moduli

- `lib/supabase.mjs` — REST client PostgREST (service_role): `select/insert/update/remove`.
- `lib/voyage.mjs` — `chunk()` paragraph-aware + `embed()` voyage-3.5/`document` + `toVector()`.
- `lib/valyu.mjs` — `search()` su `/v1/search` (motore di sourcing primario).

## Sicurezza

- Il testo scrapato di terzi (`signals.raw_content`, summary competitor) è **dato non
  fidato**: in generazione va trattato come contenuto, mai come istruzioni (delimitatori).
- Il gate umano pre-publish è la mitigazione principale.
