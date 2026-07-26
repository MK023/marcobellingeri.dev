# ADR 0002, the monthly issue engine (human-in-the-loop, Supabase RAG)

- **Status**: Accepted, **partly absorbed and superseded by [ADR-0004](0004-sourcing-due-canali.md)**
  (2026-07-06: sourcing moved to Valyu, the engine to Node/TS, export §pipeline[5] corrected,
  open decisions resolved; the human-in-the-loop hinge and the data model still stand)
- **Date**: 2026-07-05
- **Block**: B2 (the "monthly issue" engine)
- **Depends on**: [ADR-0001](0001-architettura-hosting-i18n.md)

## Context

One "issue" a month, in the style of a 90s magazine: real articles following **case,
application, solution**, **bilingual IT+EN**. Visitors can pull up past issues (a static
archive). Marco does not have the keys yet (Firecrawl, Anthropic, Supabase, embeddings), so
this ADR fixes **the architecture**, not the implementation.

## The hinge decision: human-in-the-loop, ALWAYS

The agent produces **drafts**; **Marco approves every issue before publication**. Never
auto-publish. The reason: the site is a business card aimed at a senior English-speaking
audience, built on real cases, and a mistake published blind burns credibility. In domain
terms this becomes the states `draft → approved → published`.

## Pipeline

```
[1] COLLECT   Firecrawl scrapes SOURCES ──► signals (raw) in Supabase
[2] GENERATE  Claude drafts the articles (IT+EN), case→application→solution,
              grounded through RAG retrieval over the existing archive (avoids
              repetition, cites past cases) ──► status=draft
[3] EMBED     chunk + embed the articles ──► pgvector (for RAG and search)
[4] REVIEW    Marco reviews and corrects the drafts ──► status=approved  ◄── HUMAN GATE
[5] EXPORT    approved issue ──► bilingual Astro content collection (MD/JSON)
              ──► commit ──► Workers Build ──► deploy   (status=published)
[6] (future)  a live "ask the archive" component: the Worker queries pgvector
              through match_* over published rows only. Deferred (YAGNI).
```

- **The static/dynamic boundary**: the site is **static** and reads issues as content
  collections at build time. Supabase is the **source of truth, the draft/review workspace and
  the RAG store**, and the site does not query it at runtime (until the live component
  arrives).
- **Trigger** (detail during implementation): a monthly GitHub Action *or* a Cloudflare Cron
  Trigger. Generation only produces drafts, so there is no deploy without human approval.

## The review mechanism (step 4)

Initially **Supabase Studio** (the table editor) for approvals: zero code, zero exposed
surface. A later upgrade: an admin page behind **Cloudflare Access (Zero Trust)** if a
dedicated review UI turns out to be needed. Do not build the admin now (YAGNI).

## Data model (Supabase / Postgres + pgvector)

See `supabase/migrations/0001_init.sql`. In short:

- `issues`: one issue, with `period`, `number`, `status(draft|approved|published)` and
  lifecycle timestamps.
- `articles`: one article within an issue (slug, optional stat). The state lives on the issue
  (approval is per issue).
- `article_translations`: `(article_id, locale∈{it,en})` with
  `title/problem/application/solution/body`. A normalised translation table: EN and IT are
  peers, EN is primary ([[ADR-0001]] §3-4).
- `signals`: the raw Firecrawl output feeding generation (traceability).
- `article_chunks`: chunks plus `embedding vector(N)` for the RAG (pgvector).
- **RLS**: the service role writes everything; `anon` reads **only** rows whose issue is
  `published`. This protects the future live query path, and the export uses the service role.
- **`match_article_chunks(...)`**: cosine similarity search (`<=>`) filtered to `published`,
  for grounded generation and for the future live component.

## Open decisions (sub-nodes, to resolve during implementation)

- **Embedding model**, which sets the `vector(N)` dimension: Voyage `voyage-3` (1024, already
  used in monferrinoAI) versus OpenAI `text-embedding-3-small` (1536) versus Cohere. The schema
  parameterises the dimension; **to be decided against the docs** before implementing.
- **pgvector index**: HNSW (the recommended default for quality and latency) versus IVFFlat.
- **Trigger**: GitHub Action versus CF Cron.

## Security

- Keys (`FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, embeddings) live
  **only** in server-side secrets and env, **never** in the repo or the client. See
  `.env.example`. The `SUPABASE_SERVICE_ROLE_KEY` never touches the browser.
- RLS is on for every table; the public client (if it ever uses Supabase) sees only
  `published`.
- The gitleaks secret guard (`.githooks/`) stays as the pre-commit net.

## Target repo layout (monorepo)

```
astro-project/        frontend (static Astro site)
supabase/migrations/  DB schema (applied through the Supabase CLI)
engine/               Python pipeline (collect/generate/embed/export), B2 impl
.env.example          the environment variable contract
docs/adr/             these ADRs
```

The existing files (`astro-project/firecrawl_issue.py`, the GitHub Action) get reorganised into
`engine/` during implementation, not now (a surgical change, deferred).

## References (docs consulted)

- Supabase, vector columns (pgvector, RLS service-role/published):
  <https://supabase.com/docs/guides/ai/vector-columns>
- Astro, content collections (the export target):
  <https://docs.astro.build/en/guides/content-collections/>
