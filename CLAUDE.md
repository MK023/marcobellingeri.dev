# CLAUDE.md, marcobellingeri.dev

> Project memory, loaded on every turn. **Short and dense**: this is context spent every turn,
> not a README. The *general* operating rules (PRs, baseline security, the two MUST models
> pipeline+test) live in Marco's **global** CLAUDE.md. Only what is **specific to this repo**
> belongs here. A section growing long should move to a dedicated file with a path pointer
> (progressive disclosure: read on demand, not auto-loaded on every turn).

## What this is

Marco's personal site (live since 2026-07-10). Not a portfolio: a site that **demonstrates**
instead of declaring (the Security section reads the headers back out of the HTTP response; the
Terminal queries the RAG live). Static Astro, bilingual IT/EN, on Cloudflare Workers; a Worker
picks the language on `/` and serves `/api/contact`, `/api/ask` and `/api/radar` (aggregated
CERT bulletins, edge cache; the licence registry is `docs/FONTI.md` with a guard in CI). Backend
in `engine/`: the RAG pipeline of the monthly magazine (Valyu, verification, generate, embed
voyage-3.5 on Supabase pgvector, export). Security by design is the **positioning**, not a
finishing touch.

## Layout

- `astro-project/`: the site **and** the `worker/`. **Start here.**
- `engine/`: a zero-dependency Node pipeline (native `fetch`): `ingest`, `generate`, `embed`,
  `export`, `competitors`, `retrieve`, `visibility`, `devto` (`--due` for scheduled releases),
  `radar-signals` (Radar bulletins into proof candidates), `edicola`, `advance`, `judge`
  (LLM-as-a-judge on the content PR). The magazine runs on autopilot: the crons run the stage
  unlocked by the human gates in Studio.
- `supabase/`: sequential migrations (`000N_*.sql`), RLS everywhere, a DB rebuildable from
  scratch.
- `docs/adr/`: architectural decisions (ADRs). *(Process specs and plans are not versioned:
  they live in the session and stay in the git history.)*

## Commands

Site (`cd astro-project`): `npm run dev` · `npm run check` (astro/TS) · `npm run lint` (ESLint,
the only eyes on the `.astro` files) · `npm run build` · `npm run test:csp` (tests run against
`dist/`, **not** the source). Real headers (which `astro preview` does not give):
`npx wrangler dev`.
Engine (`cd engine`): `doppler run -- node <script>.mjs [--limit N]` · `npm test` (unit plus
integration, **no network**).
Always `lint` + `check` + `test` green before saying "done".

## How we work here (specific to this repo)

- **Every change goes in a branch and a PR, never on `main`** (not even locally). I merge the
  **code** once the gates are green; Marco merges the **content** (articles).
- **`main` is production**: automatic deploy on every push. Autonomy stops at production.
  Migrations on the real DB, secrets, and actions towards the outside world need Marco's
  explicit approval (checking the target of every DDL first).
- **Verify in the browser, do not trust the reading**: every serious bug came out by running it.
  Serve the build, measure.
- **Skills we use** (invoke them at the right moment, without waiting to be asked): **graphify**
  (query the callers before any non-trivial edit, update the graph after merges) ·
  **verify**/**run** (run it before saying "done") · **test-driven-development** (tests before
  code, the two MUST models) · **web-perf** (every performance/CWV task) · **ponytail** (minimal
  diff, the YAGNI → reuse → stdlib → one-liner ladder) · **prompt-master** (every non-trivial
  prompt, for example the `ask` system prompt) · **humanizer** (every public text: articles,
  copy, bio; **never** the CVs) · **code-review** (before merging). Proactive note in
  `.claude/session-skills.md`.

## Code conventions

- **Match the existing style.** The `engine/lib/*` libraries carry no JSDoc: do not add it where
  there is none.
- Model output and network data are **untrusted input**: into the DOM only through `esc()`
  (never `innerHTML` with the raw value); into logs only through `logsafe` (S5145); into
  PostgREST queries only through the `pg` barrier.
- Hash-based CSP, **no `unsafe-inline`**: no inline `style=` in runtime JS (the CSP blocks it in
  production, so the colour belongs in `global.css`).

## Security (non-negotiable)

- Secrets only on **Doppler**, never in the repo. `.env` is ignored. gitleaks full-history and
  push protection are both on.
- **The CSP lives in the `<meta>`, not in the headers**: putting it back in `_headers` takes the
  site offline (a dedicated test prevents it). `_headers` keeps only `frame-ancestors`.
- RLS on every table; the RAG RPC serves **only** `published` (the publish gate is in the DB).

## What NOT to do (closed decisions, do not reopen without new data)

- The 780ms loader · the CSP in the meta · SRI on the Turnstile loader (a 302 to a rotating
  build id) · PII in the history (`f731a91`, an accepted risk) · mobile UX at 15.7 screens.
- The three debts where "the fix is a regression": `UtilityBar` (setInterval), `Projects.astro`
  (`Record<Lang>`), verbose logs in `engine/lib/*`.
- The `ponytail:` markers are **declared ceilings** with an upgrade path beside them, not debt
  to pay down.

## References (read on demand)

- `README.md`: full commands, the pipeline/test contract, the roadmap.
- `SECURITY_AUDIT.md`: the audit (0 open findings), defences confirmed with proof.
- `docs/adr/`: hosting/i18n, the monthly engine, components, two-channel sourcing.
- Cross-session ground truth: Atlas (private repo `MK023/Atlas`) →
  `projects/marcobellingeri-dev.md`.
