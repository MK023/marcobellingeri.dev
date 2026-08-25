# CLAUDE.md, marcobellingeri.dev

> Project memory, loaded on every turn. **Short and dense**: this is context spent every turn,
> not a README. The *general* rules — PRs, baseline security, the two MUST models, branching
> from `origin/main`, what counts as proof — live in Marco's **global** `CLAUDE.md` and in
> `~/.claude/rules/`. Only what is **specific to this repo** belongs here. A section growing
> long moves to a dedicated file with a path pointer.

<!--
CRITERIO DI QUESTO FILE, 25/08/2026 — stesso modello di ~/GitHub/agentic-os/CLAUDE.md, che
e' l'esempio lavorato: aprilo con Read, il criterio completo e la procedura di trasloco
stanno nei suoi commenti in testa.

Tre caselle, ogni riga sta in una sola:
  su Marco .................... ~/.claude/CLAUDE.md
  su come si fa un progetto ... ~/.claude/rules/lavorare-su-un-progetto.md
  su QUESTO repo .............. questo file

Tagliato il 25/08 perche' gia' nel globale dei progetti, non perche' smesso di valere:
"branch e PR mai su main", "ramo da origin/main non da HEAD", il grafo prima del grep,
i test prima del codice, la scala YAGNI, la riscrittura dei testi pubblici, la review
prima del merge. Sette regole, una copia sola. L'aneddoto del 14/08 resta qui sotto
perche' e' successo in QUESTO repo: i fatti che pagano una regola restano dove sono
successi, la regola sale.

Questi commenti HTML sono gratis: rimossi prima dell'iniezione in contesto (garanzia
valida SOLO per i file CLAUDE.md, non per rules/ o SKILL.md), leggibili da chi apre il
file. Misurato il 25/08: da 106 a 101 righe iniettate, 982 -> 900 parole.
-->

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
- `engine/`: a **zero-dependency** Node pipeline on native `fetch` — `ls engine/*.mjs` for the
  list; the ones whose names do not explain themselves are `devto --due` (scheduled releases),
  `radar-signals` (Radar bulletins into proof candidates) and `judge` (LLM-as-a-judge on the
  content PR). The magazine runs on autopilot: the crons run whichever stage the human gates
  in Studio have unlocked.
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

- **`main` is production**: automatic deploy on every push. Autonomy stops there —
  migrations on the real DB, secrets, and actions towards the outside world need Marco's
  explicit approval, checking the target of every DDL first.
- **Who merges what**: the agent merges the **code** once the gates are green; the author
  merges the **content** (articles).
- **Verify in the browser, do not trust the reading**: every serious bug here came out by
  running it. Serve the build, measure.
- **`git add` the files you touched, not `-A`.** More than one session works in this copy
  at a time. On 2026-08-14 a branch cut from `HEAD` carried another session's just-committed
  fix into production inside a PR whose review was about something else — #205 then closed
  itself with zero commits, because #206 had already shipped its content.
- **The CVs never get the tone-rewrite pass** that every other public text gets.

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
  build id).
- The three debts where "the fix is a regression": `UtilityBar` (setInterval), `Projects.astro`
  (`Record<Lang>`), verbose logs in `engine/lib/*`.
- The `ponytail:` markers are **declared ceilings** with an upgrade path beside them, not debt
  to pay down.
- **The trailing slash on every URL is Cloudflare's**, not Astro's: `html_handling`
  (`auto-trailing-slash`) in `wrangler.jsonc`, where the reasoning is written. `trailingSlash`
  in `astro.config.mjs` does **nothing** here, because prerendered pages are the host's call.
  Changing the shape now would move every indexed URL, so don't: keep the two ends agreeing
  instead. Anything that builds or parses one of these URLs by hand belongs under the
  round-trip test in `engine/test/edicola.test.mjs`.

## References (read on demand)

- `README.md`: full commands, the pipeline/test contract, the roadmap.
- `DESIGN.md`: the ten colour tokens and what they mean, the three type families and their
  jobs, the two editions, and why no runtime `style=` is allowed. Read it before touching
  how a component looks.
- `SECURITY_AUDIT.md`: the audit (0 open findings), defences confirmed with proof.
- `docs/adr/`: hosting/i18n, the monthly engine, components, two-channel sourcing, the Radar
  and the knowledge graph.
- Cross-session ground truth lives in the author's private knowledge base, not in this repo.
