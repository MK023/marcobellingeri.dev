# ADR 0004 — Sourcing a motore Valyu e architettura a due canali

- **Stato**: Accettato (implementato — backend live)
- **Data**: 2026-07-06
- **Blocco**: B2 (implementazione)
- **Dipende da**: [ADR-0002](0002-motore-numero-mensile.md) — ne scioglie le decisioni aperte e ne aggiorna la pipeline

## Contesto

ADR-0002 fissava l'architettura del numero mensile con Firecrawl come collector
e diverse decisioni rimandate all'implementazione. L'implementazione (2026-07-06)
ha validato empiricamente gli strumenti su casi reali (verticale insurance) e
ha fatto emergere un secondo flusso distinto: il monitoraggio concorrenti.
Questo ADR registra cosa è cambiato rispetto al design e perché.

## Decisione 1 — Due canali, tabelle separate, stesso DB RAG

| | **Canale 1 — numero mensile** | **Canale 2 — competitor watch** |
|---|---|---|
| Scopo | contenuto pubblico del sito | radar interno di Marco (mai pubblicato) |
| Tabelle | `issues / articles / article_translations / signals / article_chunks` | `competitor_sources / snapshots / chunks` |
| Esposizione | RLS: anon legge solo `published` | RLS deny-all (nessuna policy anon) |
| Migration | `0001_init.sql` | `0002_channel2_competitors.sql` |

Roster Canale 2: bilanciato **60% tech / 40% editoriale-AI-per-decisori**
(scelta di Marco). Entrambi i canali embeddano nel RAG (pgvector, 1024).

## Decisione 2 — Sourcing: Valyu motore primario

Testato empiricamente (search web/news/paper + deepresearch sul caso reale):

- **Valyu** = **motore primario** di discovery mirata, verify e research.
  Rumore ~zero, surfaces fonti primarie (Tier-1: NAIC, arXiv, PubMed) con
  relevance score. Pay-as-you-go trascurabile (~$0.0075/search, $0.10/deep
  research) — deroga consapevole al vincolo free-tier (costo variabile ∝ uso,
  nessun costo fisso). Modalità `answer` esclusa (SSE-only, wrapper CLI incompatibile).
- **last30days** = solo **colore/voce dei praticanti** (aneddoto Reddit per il
  gancio narrativo — l'unica cosa che Valyu strutturalmente non dà). Config
  stretta: Reddit-praticanti puro, model-planned. Dà lead Tier-3, mai prova.
- **Firecrawl** = **resta nello stack** come scraper attivo (decisione Marco,
  2026-07-06): crawling multi-pagina e `changeTracking` ("riassumi solo se
  cambiato") che Valyu Contents non offre — ruolo naturale: monitoraggio
  continuo del Canale 2 (`engine/competitors.mjs`). NB: `firecrawl_issue.py` (il
  vecchio *modello editoriale*, non il servizio) è stato **rimosso**; resta solo
  `public/data/issues/` finché `ArchiveSection` non è riscritto DB-backed.

Barra di verifica a 3 tier (ADR editoriale, vedi memoria progetto): si
pubblica solo con ≥1 fonte Tier-1 o Tier-2 indipendente. Il rumore si scarta
prima dell'insert: in `signals` entrano solo segnali on-vertical
(`stage=discovery`) e fonti verificate (`stage=verify` + `tier` + `independent`).

## Decisione 3 — Decisioni aperte di ADR-0002: sciolte

- **Embedding**: Voyage **`voyage-3.5`** (1024 dim, `input_type=document`,
  cross-lingual IT/EN verificato ~0.87 sim). NB: "voyage-3" nelle note
  precedenti è stale — i docs Voyage attuali indicano 3.5.
- **Indice**: **HNSW** (`vector_cosine_ops`), confermato.
- **Trigger**: **GitHub Actions** (free; CF Containers scartato = a pagamento).
- **Engine**: **Node/TS** in `engine/` (scelta di Marco: una sola toolchain
  col sito) — non Python come ipotizzato in ADR-0002 §layout.

## Decisione 4 — Rendering: correzione di rotta

L'export previsto da ADR-0002 §pipeline[5] verso "content collection Astro" è
**errato**: la collection `cases` esistente è le **Field Notes personali** di
Marco (casi di lavoro in prima persona), non il numero B2. Il numero verrà
renderizzato da un **rewrite di `ArchiveSection.astro`** (oggi legacy-JSON)
DB-backed. **Vincolo di sicurezza dal security-audit 2026-07-06**: il rewrite
deve usare escaping/`textContent` su ogni campo e validare `source_url`
(`http(s):` only) — il componente attuale usa `innerHTML` non-escapato,
mitigato solo dalla CSP.

## Sicurezza (integrazioni post-audit)

- Hardening in `0003_security_hardening.sql`: `search_path` pinnato sulla
  RPC, revoke `TRUNCATE/REFERENCES/TRIGGER` da `anon`+`authenticated`
  (TRUNCATE bypassa RLS), execute esplicito, indici FK.
- **Gotcha operativo**: le tabelle create via Supabase MCP non ricevono i
  privilegi standard → dopo ogni migration: grant espliciti + revoke dei
  verbi inutili + `set search_path` sulle funzioni.
- **Grounding non fidato**: `signals.raw_content` e i summary del Canale 2
  sono testo scrapato di terzi → nella generazione vanno trattati come dati
  (delimitatori, mai eseguire istruzioni dal contesto). Il gate umano
  pre-publish resta la mitigazione principale.

## Stato dell'implementazione

**2026-07-06 (sera) — backend consolidato.** Engine ora **nel repo** (`engine/`,
Node, zero dipendenze npm): `ingest.mjs` (Valyu → signals discovery),
`embed.mjs` (chunk + voyage-3.5 → article_chunks), `competitors.mjs` (Firecrawl
v2 → competitor_snapshots/chunks), lib condivise `supabase/voyage/valyu`. DB
**ricostruito da zero** dalle migration (0001→0004, con grant e seed competitor
riproducibili): validato che le migration committate producano lo schema live.
I dati del #1 draft sono stati **buttati di proposito** per ripartire ordinati.
CI: `competitor-radar.yml` (Canale 2 mensile). Restano: rewrite DB-backed di
`ArchiveSection` (con escaping, §4) e **scrittura + gate + publish** del #1
(human-in-the-loop).

**2026-07-06 (pomeriggio) — primo backend.** Numero #1 in draft + RAG live
(prototipo con script di sessione, poi consolidato nell'engine).

## Riferimenti (docs consultati)

- Valyu API reference: <https://docs.valyu.ai/api-reference/overview>
- Voyage AI embeddings: <https://docs.voyageai.com/reference/embeddings-api>
- Supabase database linter (advisor): <https://supabase.com/docs/guides/database/database-linter>
