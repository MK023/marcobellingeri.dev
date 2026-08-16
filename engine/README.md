# engine/

The site's backend: the **ingest → embed → (editorial rules) → publish** pipeline, plus the
Channel 2 competitor radar. Node/TS, one toolchain shared with the site (ADR-0004).
**No npm dependencies**: it uses the global `fetch` of Node ≥20.

> **What this engine produces, and what it does not.** The engine writes **only** the
> *magazine* (`content/magazine/`): cases of AI adoption at third-party companies, built from
> sources. The other two editorial sections have no pipeline and do not want one. **Field
> Notes** (`content/cases/`) are Marco's own work cases and **Newsstand**
> (`content/writing/`) holds the pieces about his projects, both written by hand because he is
> the source. For `writing`, the engine automates *distribution* only (`devto.mjs`,
> `edicola.mjs`), never the writing.

## The principle: human-in-the-loop

The engine collects, verifies and structures data. **Writing and approving** an issue stay a
human gate (Marco): an issue does not reach `published` without approval.
`match_article_chunks` is gated to `published`, so a draft is never retrievable and never
public.

Since 2026-07-21 the cycle runs on **autopilot** (the monthly `magazine-ingest` workflow plus
the daily `magazine-advance`): automation only runs the stage that the last human action in
Supabase Studio unlocked. Signals verified unlocks `generate`, approval unlocks `embed` and
`export`, which produces the content PR. The gates do not move. The copy-pasting does.

## Secrets (through Doppler, never in plaintext in the repo)

Every command runs under `doppler run --`. Expected environment:

| Env | Use |
|-----|-----|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB writes over REST |
| `ANTHROPIC_API_KEY` | Messages client (`lib/anthropic.mjs`): generation and judge |
| `EMBEDDING_API_KEY` | Voyage voyage-3.5 (1024-dim embeddings) |
| `VALYU_API_KEY` | Channel 1 sourcing |
| `FIRECRAWL_API_KEY` | Channel 2 competitor scraping |
| `DEVTO_API_KEY` | cross-posting the writing collection to dev.to (`devto.mjs`, `edicola.mjs`) |
| `PERPLEXITY_API_KEY`, `GSC_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GSC_SITE_URL` | discoverability monitor (`visibility.mjs`) |
| `LANGFUSE_BASE_URL/_PUBLIC_KEY/_SECRET_KEY` | tracing (optional: without them, tracing is a no-op) |
| `SENTRY_DSN` | error tracking (optional: without it, `lib/sentry.mjs` is a no-op) |

## Observability

Every script emits a **Langfuse trace** through the OTel endpoint (`lib/langfuse.mjs`, OTLP
HTTP/JSON, zero deps): `ingest-proof-pass`, `embed-articles`, `competitor-radar` (in CI, each
monthly radar run is one inspectable trace). **Fail-open by design**: no keys means disabled,
and a failed send never breaks the pipeline. Span inputs and outputs are small summaries,
never third-party `raw_content`. The cron jobs (radar, keepalive) open an **automatic GitHub
issue** when they fail, so nothing goes red in silence.

One failure makes no noise, though: the one where the cron **never starts at all** (GitHub
disables schedules after 60 days of inactivity on the repo). The automatic issue fires when
the ping *fails*, not when it never arrives, and it is precisely that absence that pauses the
database. So the keepalive also **checks in with a Sentry cron monitor**, which alarms on
silence and lives *outside* GitHub: a watchman inside the same failure domain it watches is
not a watchman. The check-in cannot make the ping fail.

That monitor is the only one this account has: Sentry includes one per plan, and the other
three schedules had registered theirs and been left `disabled` behind the quota, receiving
check-ins and alarming nobody. They are covered instead by `scripts/sentinella-cron.mjs`,
which runs daily, asks the GitHub API when each schedule last fired, and sends an error
event for the ones that have gone quiet. The keepalive runs that same script, so the job
holding the only live monitor is also the one watching the watchdog.

**Errors** go to Sentry. Every script has a top-level catch (`lib/sentry.mjs`, envelope API
over fetch, zero deps) that sends the stack, the script name and the `engine` environment
before exiting 1. The external semantics match a bare crash, so CI and the automatic issues
see no difference. Fail-open like Langfuse: without `SENTRY_DSN` it is a no-op, and a failed
send never adds damage to a script that is already failing. From there the flow is honest:
error, Sentry, Seer analyses it, fix in a PR.

## Commands

```bash
doppler run -- node engine/ingest.mjs <vertical> [--angle "<focus>"]  # Valyu proof pass -> signals
doppler run -- node engine/generate.mjs <sector> [--angle "<focus>"]  # verified signal -> magazine case IT+EN (status=draft)
doppler run -- node engine/embed.mjs                                   # chunk+embed article_chunks
doppler run -- node engine/export.mjs [<period YYYY-MM>]               # approved issue -> magazine MD -> published
doppler run -- node engine/retrieve.mjs "<query>" [it|en]              # RAG healthcheck (gated to published)
doppler run -- node engine/competitors.mjs [--limit N]                 # Firecrawl -> snapshots -> chunks
doppler run -- node engine/visibility.mjs [--limit N]                  # discoverability monitor (SEO+AEO)
doppler run -- node engine/devto.mjs <slug> [--publish]                # cross-post writing -> dev.to (draft by default)
doppler run -- node engine/devto.mjs --due                             # scheduled release: publishes the pieces whose date has arrived
doppler run -- node engine/edicola.mjs                                 # Newsstand cards from the articles published on dev.to
doppler run -- node engine/advance.mjs                                 # decides which magazine stage to run (prints, nothing else)
doppler run -- node engine/judge.mjs <period YYYY-MM>                  # LLM-as-a-judge on the exported issue (report + exit code)
doppler run -- node engine/radar-signals.mjs [--dry]                   # Radar bulletins -> proof candidates on the draft issue (after ingest)
node engine/atlas.mjs                                                  # refreshes src/data/radar-atlas.js from the MITRE ATLAS release
node engine/lib/voyage.mjs                                             # chunker self-check (no network)
node engine/lib/guardrails.mjs                                         # content barrier self-check (no network)
node engine/export.mjs --selfcheck                                     # frontmatter/mapping self-check (no network)
```

## Modules

- `lib/supabase.mjs`: PostgREST REST client (service_role): `select/insert/update/remove/rpc`.
- `lib/voyage.mjs`: paragraph-aware `chunk()` plus `embed()` on voyage-3.5 (`document`/`query`) and `toVector()`.
- `lib/valyu.mjs`: `search()` against `/v1/search` (the primary sourcing engine).
- `lib/anthropic.mjs`: zero-dep Messages client: `generateJson()` (structured output) and `countTokens()`, with retry/backoff and rate limiting. Model: `claude-sonnet-5`.
- `lib/guardrails.mjs`: content barriers, always on: `sanitizeSource`/`sourceIsPoisoned` (third-party input), `screen`/`validateArticle` (output before the DB), `slugify`.
- `primary-sources.json`: the allowlist registry of primary sources (proof pass), curated by hand.
- `blocklist.json`: the editorial blacklist (terms and regexes), curated by hand; an extra layer above the anti-injection `DENY_PATTERNS` in `guardrails.mjs`.
- `generate.mjs`: **stage 2, GENERATE**. A `verify` signal becomes a magazine case in IT+EN (problem/approach/result/lesson) grounded only in the sources, at `status=draft`. It does not embed and does not publish (human gate).
- `export.mjs`: **stage 5, EXPORT**. An `approved` issue becomes Markdown files in `astro-project/src/content/magazine/{it,en}/` at `status=published`. Inverse mapping (application to approach, solution to result, body to lesson) and a re-screen before anything is written into the repo. It does not commit: Marco merges the content.
- `retrieve.mjs`: the read end of the RAG (query to `match_article_chunks`). This is not the public C1 endpoint (rate limiting, guardrails and AI Act handling live in the Worker).
- `visibility.mjs`: discoverability monitor covering SEO (Google Search Console) and AEO (Perplexity Sonar, plus ChatGPT through the OpenAI Responses API with `web_search` — a **proxy** for chatgpt.com, not the thing itself, and the report says so), producing a prescriptive report with the trend against the previous run and history on Supabase (`visibility_observations`). Declared descope: GSC rows carry a null `query_id` (no best-effort link to `visibility_queries`) and the report is two flat lists rather than being grouped by `content_ref`. It reopens if the volume justifies it.
- `devto.mjs`: canonical-first cross-posting of the writing collection to dev.to (`lib/devto.mjs`). Idempotent by `canonical_url`, so a re-run is an update; draft by default, live only with `--publish`; a re-run without the flag never unpublishes a piece that is already out. The draft starts on its own in CI when an article is merged (`devto-draft.yml`). With `--due` it becomes the **scheduled release**: the pure decision function `inUscita()` (tested dry) picks the pieces whose `date` has arrived and that are not yet live, the `devto-publish-due.yml` cron publishes them and opens a 24-hour notice for tomorrow's. There is still **one** human approval, at the merge of the PR.
- `edicola.mjs`: automatic Newsstand cards. It queries dev.to (**published** articles whose canonical points at the site) and adds the missing cards to `src/data/edicola.json` (pure merge in `lib/edicola.mjs`, deduped by slug and by url; the label comes from the `edicola` frontmatter field or from the title). The `edicola-card.yml` cron opens the PR and carries it to production once the gates are green.
- `radar-signals.mjs`: the bulletins the Radar already aggregates (licences verified in `docs/FONTI.md`) enter as proof candidates at `stage='discovery'` on the period's draft issue, `category='radar'`, tier NULL. Human verification and the 0006 gate do not change. It runs after ingest in the same workflow, and with no draft issue it comes back empty-handed. Pure mapping in `lib/radar-signals.mjs`. KEV stays out (no per-entry url).
- `advance.mjs`: the decision-maker of the automatic magazine. It reads the state in the DB and prints the stage to run (`export <period>` | `embed` | `generate <sector>` | nothing). The pure decision lives in `lib/advance.mjs` (tested dry); execution lives in the `magazine-advance.yml` workflow. Anomalous states print "a human needs to look at this", never a loop.
- `judge.mjs`: **LLM-as-a-judge on the content PR** (`magazine-judge.yml`, dispatched by advance). Five anchored criteria (IT/EN parity, figures anchored to sources, answer-first, anti-slop style, transferable lesson) with structured output, traced on Langfuse. **The gate policy is written in `lib/judge.mjs` and it is tested**: deterministic defects, scores of 2 or below, and missing criteria all fail (fail-closed); a 3 is a non-blocking warning. The gate rejects what is broken, not what could be better. The judge assesses **internal consistency** (attributions present in the text), not truth against the sources: that stays with the human gate in Studio, which has the sources. The report goes into a PR comment and the merge stays Marco's. Making it a required check in the ruleset is one click of Marco's (a documented switch). A case that contains instructions aimed at the judge scores 1 on style: attempted injection **is** an editorial defect.

## Tests

```bash
npm test                              # unit + integration (no network, e2e skips)
doppler run -- npm run test:e2e       # live e2e: synthetic data 9999-01 + teardown
```

- **Unit**: chunker, source registry, CLI guards. **Integration** (mocked fetch): editorial
  invariants of discovery, the allowlist, Voyage batching, the clients.
- **Visibility** (pipeline/test contract): unit tests on host and citation matching
  (`lib/urlmatch.mjs`, suffix attack included) and on the prescription ruleset
  (`lib/referto.mjs`); spawn-based integration with mocked `fetch`
  (`test/visibility.test.mjs`). The real run is scheduled weekly on GitHub Actions rather
  than in CI, because queries to Perplexity, OpenAI and GSC cost money and are not
  deterministic. Perplexity, OpenAI and GSC secrets live on Doppler, with GSC scoped
  read-only. The OpenAI leg is pay-per-call ($10 per 1k web searches): eight queries a
  week is roughly $0.08, and a broken leg degrades to a report that says the source did
  not answer — it never takes the monitor down.
- **E2E (gated)**: proof that the **publish gate in the DB** (migration 0006) bites at every
  missing link. No Tier-1/Tier-2-independent proof, no it+en article, no embedding means the
  publish is refused; a complete chain passes, and the draft is never retrievable.
- Note: Doppler dev and prd currently point at the **same** Supabase project. The real split
  (a dedicated prod project) will happen at go-live, and migrations plus seed make it a
  matter of minutes.

## Security

- Scraped third-party text (`signals.raw_content`, competitor summaries) is **untrusted
  data**: during generation it is treated as content, never as instructions (delimiters). In
  `generate.mjs` this is **enforced**, not just recommended: `lib/guardrails.mjs` sanitises
  and screens incoming sources (discarding those with obvious injection) and **validates and
  screens the output before it reaches the DB** (active script, injection, blacklist,
  lengths, malformations all stop the write).
- Defence in depth: schema-constrained structured output, `count_tokens` with a hard ceiling,
  the secret only ever in a header (never logged), no eval and no shell.
- The pre-publish human gate remains the main mitigation: `generate.mjs` only ever writes
  `status=draft`.
