# ADR 0002 — Motore del numero mensile (human-in-the-loop, Supabase RAG)

- **Stato**: Accettato (design; implementazione differita — nessuna key ancora)
- **Data**: 2026-07-05
- **Blocco**: B2 (motore del "numero mensile")
- **Dipende da**: [ADR-0001](0001-architettura-hosting-i18n.md)

## Contesto

Ogni mese un "numero" (stile magazine anni '90): articoli reali **caso →
applicazione → soluzione**, **bilingui IT+EN**. I visitatori possono richiamare i
numeri precedenti (archivio statico). Marco non ha ancora le chiavi (Firecrawl,
Anthropic, Supabase, embedding): questo ADR fissa **l'architettura**, non
l'implementazione.

## Decisione cardine: human-in-the-loop, SEMPRE

L'agente produce **bozze**; **Marco approva ogni numero prima della
pubblicazione**. Mai auto-publish. Motivo: il sito è una business card verso un
pubblico senior anglosassone su casi reali — un errore pubblicato al buio brucia
credibilità. Questo si traduce in stati di dominio: `draft → approved →
published`.

## Pipeline

```
[1] COLLECT   Firecrawl scrape SOURCES ──► signals (raw) in Supabase
[2] GENERATE  Claude redige bozza articoli (IT+EN), caso→applicazione→soluzione,
              grounded via RAG retrieval sull'archivio esistente (evita
              ripetizioni, cita casi passati) ──► status=draft
[3] EMBED     chunk + embedding degli articoli ──► pgvector (per RAG e ricerca)
[4] REVIEW    Marco rivede/corregge le bozze ──► status=approved   ◄── GATE UMANO
[5] EXPORT    numero approvato ──► content collection Astro bilingue (MD/JSON)
              ──► commit ──► Workers Build ──► deploy   (status=published)
[6] (futuro)  componente live "chiedi all'archivio": Worker interroga pgvector
              via match_* — solo righe published. Differito (YAGNI).
```

- **Confine statico/dinamico**: il sito è **statico**; legge i numeri come content
  collections al build. Supabase è **source-of-truth + draft/review + RAG store**,
  non interrogato a runtime dal sito (finché non arriva il componente live).
- **Trigger** (dettaglio in implementazione): GitHub Action mensile *oppure*
  Cloudflare Cron Trigger. La generazione produce solo bozze: nessun deploy senza
  l'approvazione umana.

## Meccanismo di review (step 4)

Inizialmente **Supabase Studio** (table editor) per approvare — zero codice, zero
superficie esposta. Upgrade successivo: pagina admin dietro **Cloudflare Access
(Zero Trust)** se serve una UI di review dedicata. Non costruire l'admin ora
(YAGNI).

## Modello dati (Supabase / Postgres + pgvector)

Vedi `supabase/migrations/0001_init.sql`. In sintesi:

- `issues` — un numero: `period`, `number`, `status(draft|approved|published)`,
  timestamp di ciclo vita.
- `articles` — un articolo del numero (slug, stat opzionale). Lo stato vive sul
  numero (approvazione per-numero).
- `article_translations` — `(article_id, locale∈{it,en})` con
  `title/problem/application/solution/body`. Tabella di traduzione normalizzata:
  EN e IT pari livello, EN primario ([[ADR-0001]] §3-4).
- `signals` — output grezzo Firecrawl che alimenta la generazione (tracciabilità).
- `article_chunks` — chunk + `embedding vector(N)` per il RAG (pgvector).
- **RLS**: service role scrive tutto; `anon` legge **solo** ciò il cui numero è
  `published`. Protegge il futuro percorso di query live; l'export usa il service
  role.
- **`match_article_chunks(...)`**: similarity search cosine (`<=>`) filtrata a
  `published` — per la generazione grounded e per il componente live futuro.

## Decisioni aperte (sub-nodi, da sciogliere in implementazione)

- **Modello di embedding** → dimensione del `vector(N)`: Voyage `voyage-3` (1024,
  già usato in monferrinoAI) vs OpenAI `text-embedding-3-small` (1536) vs Cohere.
  Lo schema parametrizza la dimensione; **da decidere con i docs** prima di
  implementare.
- **Indice pgvector**: HNSW (default consigliato per qualità/latency) vs IVFFlat.
- **Trigger**: GitHub Action vs CF Cron.

## Sicurezza

- Chiavi (`FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  embedding) **solo** in secret/env server-side, **mai** nel repo né nel client.
  Vedi `.env.example`. Il `SUPABASE_SERVICE_ROLE_KEY` non tocca mai il browser.
- RLS attiva su tutte le tabelle; il client pubblico (se mai userà Supabase)
  vede solo `published`.
- Il secret-guard gitleaks (`.githooks/`) resta la rete pre-commit.

## Layout target del repo (monorepo)

```
astro-project/        frontend (sito statico Astro)
supabase/migrations/  schema DB (applicato via Supabase CLI)
engine/               pipeline Python (collect/generate/embed/export) — B2 impl
.env.example          contratto delle variabili d'ambiente
docs/adr/             questi ADR
```

I file esistenti (`astro-project/firecrawl_issue.py`, la GitHub Action) si
riorganizzano in `engine/` in fase di implementazione — non ora (cambio
chirurgico rimandato).

## Riferimenti (docs consultati)

- Supabase — Vector columns (pgvector, RLS service-role/published):
  <https://supabase.com/docs/guides/ai/vector-columns>
- Astro — Content Collections (target dell'export):
  <https://docs.astro.build/en/guides/content-collections/>
