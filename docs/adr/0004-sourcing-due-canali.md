# ADR 0004, Valyu-driven sourcing and a two-channel architecture

- **Status**: Accepted (implemented, backend live)
- **Date**: 2026-07-06
- **Block**: B2 (implementation)
- **Depends on**: [ADR-0002](0002-motore-numero-mensile.md), whose open decisions it resolves and whose pipeline it updates

## Context

ADR-0002 fixed the architecture of the monthly issue with Firecrawl as the collector and
several decisions deferred to implementation. Implementation (2026-07-06) tested the tools
empirically on real cases (the insurance vertical) and surfaced a second, distinct flow:
competitor monitoring. This ADR records what changed against the design, and why.

## Decision 1: two channels, separate tables, same RAG database

| | **Channel 1, the monthly issue** | **Channel 2, competitor watch** |
|---|---|---|
| Purpose | public site content | Marco's internal radar (never published) |
| Tables | `issues / articles / article_translations / signals / article_chunks` | `competitor_sources / snapshots / chunks` |
| Exposure | RLS: anon reads only `published` | RLS deny-all (no anon policy) |
| Migration | `0001_init.sql` | `0002_channel2_competitors.sql` |

The Channel 2 roster is balanced **60% tech, 40% editorial AI-for-decision-makers** (Marco's
choice). Both channels embed into the RAG (pgvector, 1024).

## Decision 2: sourcing, with Valyu as the primary engine

Tested empirically (web/news/paper search plus deep research on the real case):

- **Valyu** is the **primary engine** for targeted discovery, verification and research. Noise
  is roughly zero, and it surfaces primary sources (Tier-1: NAIC, arXiv, PubMed) with a
  relevance score. Pay-as-you-go is negligible (about $0.0075/search, $0.10/deep research), a
  conscious departure from the free-tier constraint (variable cost proportional to use, no
  fixed cost). The `answer` mode is excluded (SSE-only, incompatible with the CLI wrapper).
- **last30days** provides **colour and practitioner voice only** (a Reddit anecdote for the
  narrative hook, the one thing Valyu structurally does not give). Tightly configured: pure
  Reddit-practitioner, model-planned. It yields Tier-3 leads, never proof.
- **Firecrawl** **stays in the stack** as the active scraper (Marco's decision, 2026-07-06):
  multi-page crawling and `changeTracking` ("summarise only if it changed") are things Valyu
  Contents does not offer, which gives it a natural role in the continuous monitoring of
  Channel 2 (`engine/competitors.mjs`). Note: `firecrawl_issue.py` (the old *editorial model*,
  not the service) has been **removed**; only `public/data/issues/` remains until
  `ArchiveSection` is rewritten DB-backed.

A three-tier verification bar (an editorial ADR, see the project memory): nothing gets published
without at least one Tier-1 source or an independent Tier-2. Noise is discarded before the
insert: only on-vertical signals (`stage=discovery`) and verified sources (`stage=verify` plus
`tier` plus `independent`) enter `signals`.

## Decision 3: ADR-0002's open decisions, resolved

- **Embeddings**: Voyage **`voyage-3.5`** (1024 dim, `input_type=document`, cross-lingual IT/EN
  verified at roughly 0.87 similarity). Note: "voyage-3" in the earlier notes is stale, and the
  current Voyage docs say 3.5.
- **Index**: **HNSW** (`vector_cosine_ops`), confirmed.
- **Trigger**: **GitHub Actions** (free; CF Containers rejected as paid).
- **Engine**: **Node/TS** in `engine/` (Marco's choice: one toolchain shared with the site),
  not Python as assumed in ADR-0002 §layout.

## Decision 4: rendering, a course correction

The export towards an "Astro content collection" described in ADR-0002 §pipeline[5] is
**wrong**: the existing `cases` collection holds Marco's **personal Field Notes** (work cases in
the first person), not the B2 issue. The issue will be rendered by a **rewrite of
`ArchiveSection.astro`** (today legacy JSON) as DB-backed. **A security constraint from the
2026-07-06 security audit**: the rewrite must use escaping or `textContent` on every field and
validate `source_url` (`http(s):` only). The current component uses unescaped `innerHTML`,
mitigated only by the CSP.

## Security (post-audit additions)

- Hardening in `0003_security_hardening.sql`: a pinned `search_path` on the RPC, `TRUNCATE`,
  `REFERENCES` and `TRIGGER` revoked from `anon` and `authenticated` (TRUNCATE bypasses RLS),
  explicit execute grants, FK indexes.
- **An operational gotcha**: tables created through the Supabase MCP do not receive the standard
  privileges, so after every migration: explicit grants, revoke the useless verbs, and
  `set search_path` on the functions.
- **Untrusted grounding**: `signals.raw_content` and the Channel 2 summaries are scraped
  third-party text, so during generation they are treated as data (delimiters, never executing
  instructions from the context). The pre-publish human gate remains the main mitigation.

## Implementation status

**2026-07-06 (evening), backend consolidated.** The engine is now **in the repo** (`engine/`,
Node, zero npm dependencies): `ingest.mjs` (Valyu to discovery signals), `embed.mjs` (chunk plus
voyage-3.5 to article_chunks), `competitors.mjs` (Firecrawl v2 to competitor_snapshots/chunks),
with shared `supabase/voyage/valyu` libraries. The DB was **rebuilt from scratch** from the
migrations (0001 to 0004, with reproducible grants and competitor seed), validating that the
committed migrations produce the live schema. The draft #1 data was **thrown away on purpose**
so as to restart cleanly. CI: `competitor-radar.yml` (Channel 2, monthly). Still to do: the
DB-backed rewrite of `ArchiveSection` (with escaping, §4) and the **writing, gate and publish**
of issue #1 (human-in-the-loop).

**2026-07-06 (afternoon), first backend.** Issue #1 in draft plus a live RAG (a prototype built
with session scripts, later consolidated into the engine).

## References (docs consulted)

- Valyu API reference: <https://docs.valyu.ai/api-reference/overview>
- Voyage AI embeddings: <https://docs.voyageai.com/reference/embeddings-api>
- Supabase database linter (advisor): <https://supabase.com/docs/guides/database/database-linter>
