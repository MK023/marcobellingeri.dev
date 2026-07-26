# Security audit, marcobellingeri.dev

**Date:** 2026-07-11 · **Author:** automated audit (Claude) · **Scope:** the whole repo
(Astro frontend, Cloudflare Worker, CI/CD, Node engine, Supabase, config).
**Method:** read-only, plus a locally served build and read-only probes against the live
headers (`curl -sI`). No code was changed, and no POST or load was sent to production.
**Note:** this file is committed and public by choice (SECURITY.md links it). A posture is
declared, not hidden.

**Update 2026-07-11 (post-remediation):** **all 3 Low findings resolved** and in production
(PRs #34, #35, #36). Verified live that HSTS now appears on the Worker's responses too. Only
the Info items remain, none of them actionable. Details in the sections below.

**Update 2026-07-12 (audit round 2):** a second audit across the whole repo (including the
engine, which came into scope after this report) found 1 High (personal data hardcoded in
`scripts/genera-cv.py`, now replaced by sha256 digests, though the data remains in the
history), 5 Medium and a tail of Low and Info items: **every actionable one was fixed in the
same PR**. Details in the round 2 audit commits.

**Update 2026-07-13:** triaging the SonarCloud code smells surfaced **M-1**, a real ReDoS in
`sanitizeSource` (quadratic backtracking over third-party `raw_content` that was not yet
capped), now **resolved**, with a regression test on linearity. In the same pass the fix for
**L-1 went from "inferred" to "verified"**: the Worker to Sentry path had never been seen
working in its life, and now it has (see *Method and limits*).

---

## Executive summary

The codebase is **mature and well defended**. The defences claimed in the comments are
genuinely implemented and, where they can be checked, they hold: validation at the Worker's
trust boundary, a hash-based CSP with no `unsafe-inline`, parameterised PostgREST, full RLS on
Supabase, CI actions pinned to SHA, secrets outside the repo (gitleaks clean across 88
commits). The "pending" XSS noted in Atlas for `ArchiveSection.astro` **turns out to be
already closed** (node-by-node DOM construction plus a protocol whitelist, with no raw HTML
writes).

No **Critical** or **High** findings. For months the residuals shared one theme: *silent
fail-opens*, defences that fall over without telling anyone. The textbook case was
`TURNSTILE_SECRET_KEY`: if it disappeared in production, bot protection would switch off
without an alarm. Today the alarm exists **and has been seen to ring** (L-1, and *Method and
limits*). The most severe finding ever found here, M-1, a ReDoS on third-party input, came
from the same seam: not an open hole but a hidden cost on an input nobody was capping.

| Severity | Open | Resolved |
|----------|------|----------|
| Critical | 0 | — |
| High     | 0 | — |
| Medium   | 0 | 1 (M-1, ReDoS, 2026-07-13) |
| Low      | 0 | 3 (L-1, L-2, L-3) |
| Info     | 4 | — |

Checks performed: `npm run build` (green) · `npm run test:csp` (**53/53 pass**, including the
anti-header-injection test) · the engine suite (**93 tests**, 100% of lines) ·
`gitleaks detect` full-history (**no leaks**) · zero `.map` files in `dist/` · security headers
confirmed as served on `/it/` · the Worker to Sentry path proven end to end.

---

## Findings

### L-1, silent Turnstile fail-open when the secret is missing (Low), RESOLVED
> **Resolved** in PR #34 (commit `9ca7695`, in production). Added the `else` branch that calls
> `segnala()` towards Sentry when `TURNSTILE_SECRET_KEY` is absent, keeping the fail-open
> behaviour. Test: `contatto: TURNSTILE_SECRET_KEY mancante = fail-open ma segnalato a Sentry`.
> Issue #33 closed. *(The original finding follows.)*

**File:** `astro-project/worker/index.js:100-108`
The Turnstile check sits inside `if (env.TURNSTILE_SECRET_KEY) { … }`. It is fail-open by
choice (locally and in tests the secret is absent). But in **production** a config regression,
a secret deleted in Doppler or a typo in the binding name, disables bot verification entirely
**and in silence**. That contrasts with how `RESEND_API_KEY:600` is handled, where absence
calls `segnala()` towards Sentry and returns a 503.
**Scenario:** the Turnstile secret is absent, a request arrives with no `Origin` header (curl,
see `L-2`), the honeypot is empty, and the only remaining barrier is the rate limit (about
5/min/IP). Form spam and abuse with nobody the wiser.
**Recommendation:** in production, if `TURNSTILE_SECRET_KEY` is absent, call
`segnala('contact: TURNSTILE_SECRET_KEY mancante in produzione')` as Resend does. Decide
between fail-open (with an alert) and fail-closed (503). No fix applied.

### L-2, the 32 KB cap trusts `Content-Length` (Low), RESOLVED
> **Resolved** in PR #35 (in production). A new `leggiBodyLimitato()` helper reads the body
> stream with a byte ceiling and stops (`reader.cancel()`) as soon as it passes 32 KB, without
> trusting `Content-Length`. The test was rewritten against real weight, plus a regression
> guard (an inflated header with a small body no longer triggers the cap).
> *(The original finding follows.)*

**File:** `astro-project/worker/index.js:76-78`
The guard reads `Content-Length` from the header and, when it is absent, uses `'0'`, so the
check passes and `request.json()` buffers the body anyway. A request with
`Transfer-Encoding: chunked`, or with no `Content-Length`, **bypasses the declared cap**.
**Scenario:** a POST with no `Content-Length` and a body over 32 KB means the cap does not
bite and the parse happens regardless. The real impact is limited: the Cloudflare Workers
runtime imposes its own platform ceiling on body size and CPU, and the per-IP rate limit
bounds the volume.
**Recommendation:** either treat the cap as best-effort (as it is) or enforce it after the
parse by measuring the actual payload size. Worth confirming what limit the runtime really
applies to a chunked body. Low impact, a robustness note.

### L-3, Worker responses carry no HSTS (Low), RESOLVED
> **Resolved** in PR #36 (in production). An `HSTS` constant was added to `rispostaJson()` and
> to the 302 response, aligned with `_headers`. Verified live: `curl -sI` now shows
> `strict-transport-security` on the root's 302 and on the 405 from `/api/contact`.
> *(The original finding follows.)*

**File:** `astro-project/worker/index.js:22-32` (JSON API), `:155-161` (root 302)
`public/_headers` covers only static assets; the responses the Worker generates (the 302 on
`/` and the `/api/contact` responses) never pass through it and **carry no HSTS**.
**Strong mitigation:** the domain is `.dev`, a TLD with **mandatory HSTS preload at the TLD
level**, so browsers force HTTPS regardless. The probe confirms it:
`curl -sI https://marcobellingeri.dev/` (302) has no `Strict-Transport-Security`, while `/it/`
does. This is consistent with the documented choice ("bare root, preload from the TLD").
**Recommendation:** no action needed while the domain stays `.dev`. If a non-preload domain
were ever added, add HSTS to `rispostaJson` and to the 302 as well.

### M-1, ReDoS in `sanitizeSource`: quadratic backtracking on third-party text (Medium), RESOLVED
**File:** `engine/lib/guardrails.mjs:69` (PR #53, 2026-07-13)
The lookahead that neutralises the `<fonte>` delimiter ran over text that was **not yet
capped**: the 6000-character ceiling is the last link in `sanitizeSource`, so the `.replace()`
was seeing the **raw** `raw_content` of the scraped source. The pattern
`/<(?=\s*\/?\s*fonte\b)/gi` had two ambiguous `\s*` around an optional `/`: both could contend
for the same spaces, and on a run of spaces the matching went **quadratic**.

Measured before the fix, doubling the input quadrupled the time: 2k spaces took 2.4 ms; 4k,
9.1 ms; 8k, 37.7 ms; 16k, **149 ms**. Extrapolating, a hostile 1 MB page would have blocked
the engine for **minutes**. The attacker here is a scraped web page, which is precisely the
input the engine does not control for a living.

**Fix:** only one quantifier can eat the spaces (the second one comes only after a literal
`/`, so there is no ambiguity) and they are capped at 8, since no real delimiter has more.
Afterwards: 200k spaces in **1 ms**. A regression test pins the **property** (the cost does
not explode with the square of the input) rather than the speed, so a future "simplification"
of the regex fails CI instead of silently reopening the hole.

*A note on method:* the same Sonar rule (S8786) flagged two other regexes, the slug and the
Worker's email validation, which work on input **already truncated to 200 characters**:
theoretically ambiguous, practically harmless. Same rule, same declared severity, opposite
risk. What told them apart was the caller graph, not the analyser's severity. They were made
unambiguous anyway.

### I-1, the engine sat outside Dependabot's coverage (Info), RESOLVED

> **Resolved** (2026-07-18): an `npm` entry with `directory: "/engine"` was added to
> `dependabot.yml`. Today it produces nothing (there are no dependencies), but the first future
> dependency is born covered. The reminder was the weak point. *(The original finding follows.)*

**File:** `.github/dependabot.yml`, `engine/package.json`
`dependabot.yml` monitored `npm` only in `/astro-project`, plus `github-actions`. The engine
**has no dependencies today** (Node built-ins and native `fetch` only, no lockfile), so the
supply-chain surface is nil and there is no concrete gap. But if the engine ever added a
dependency, **Dependabot would not see it**.
**Recommendation:** a reminder. When the engine acquires a `package-lock.json`, add a third
`npm` entry with `directory: "/engine"`.

### I-2, `img-src 'self' data:` in the CSP (Info)
**File:** `astro-project/astro.config.mjs:23`
`data:` in `img-src` is historically a minor XSS vector (data-URI images). In this context (a
static site with no user input generating `<img>`) the risk is negligible, and it is there for
inline font and asset subsets. No action.

### I-3, per-IP rate limiting, approximate and per-location (Info)
**File:** `astro-project/worker/index.js:57-66`, `wrangler.jsonc:18-20`
The binding is "eventually consistent, intentionally not accurate" (by Cloudflare's design)
and keyed on `CF-Connecting-IP`. An attacker with an IPv6 /64 block has plenty of addresses.
This is defence in depth, not the primary barrier (Turnstile and the honeypot are). Consistent
with the documentation. No action.

### I-4, the `reply_to` email does not go through `rigaPulita` (Info, not exploitable)
**File:** `astro-project/worker/index.js:92, 122`
The email lands in `reply_to` without passing the control-character filter. It is **not
exploitable**: the regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` forbids any whitespace (including
`\r\n`) anywhere in the string, so CRLF injection is impossible; on top of that, JSON is sent
to the Resend API rather than raw SMTP, and Resend handles header encoding. The
`test/csp.test.mjs` test already covers header injection in the subject. Documented for
completeness.

---

## Confirmed defences (what holds, with the proof)

> The defences of the **AI** systems are mapped onto the MITRE ATLAS taxonomy, with `file:line`
> proof, declared metrics (NIST AI RMF *Measure*) and a telemetry retention policy, in
> **`docs/THREAT-MODEL-AI.md`** (2026-07-24).

- **Worker `/api/contact`**: the checks run in the right order (rate limit, Origin, body cap,
  parse, honeypot, validation, Turnstile, Resend), so the cheap checks precede the expensive
  ones and the external fetch (Turnstile) comes after local validation. `rigaPulita:36`
  neutralises CRLF injection in the subject, **verified by the test**.
- **Client-side XSS**: a full grep over `src/` finds no `set:html` and no uncontrolled HTML
  write sink. `ArchiveSection.astro` builds the DOM with
  `createElement`/`textContent`/`replaceChildren` and filters links with `new URL()` plus an
  `http/https` whitelist (`:149-160`). `NeonTerminal.astro` uses `innerHTML` only on hardcoded
  constants; **every** user input goes through `esc()` (`:213, :220`), which covers
  `& < > " '`.
- **CSP**: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  **no `unsafe-inline` or `unsafe-eval`**, scripts by SHA-256 hash. External hosts are minimal
  and justified (Turnstile, the Sentry DE ingest, cal; api.github.com was removed in round 2,
  a leftover from a deleted feature). `frame-ancestors 'none'` in `_headers` covers
  clickjacking. `test:csp` validates the hashes against the real `dist/`, not the source.
- **Live headers**: a `curl -sI` probe on `/it/` shows HSTS with `preload`,
  `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`, all present and served.
- **CI/CD**: no `pull_request_target`; no `${{ github.event.* }}` interpolation inside `run:`
  blocks (so no script injection); actions pinned to SHA with the version in a comment;
  least-privilege `permissions` per workflow (`deploy` gets only `contents: read`, and the
  `issues: write` on keepalive and radar is justified). `deploy.yml` verifies the headers
  **after deploy** on the real site, not on wrangler's exit code. Sentry sourcemaps are deleted
  after upload (`filesToDeleteAfterUpload`), giving **0 `.map` files in dist**.
- **Engine**: `lib/supabase.mjs` parameterises PostgREST queries with the `pg` template tag,
  which also encodes `!'()*` (the metacharacters of `in.()` and `or=()`), a defence already
  ready for the future public endpoint. `lib/langfuse.mjs` is fail-open and **never sends
  third-party `raw_content`** in traces (summaries and counts only). The `SERVICE_ROLE_KEY`
  stays in request headers and is never logged.
- **Supabase**: RLS is enabled on every table; `anon` reads only `status='published'`;
  `signals` and `competitor_*` have no anon policy at all, so they are doubly denied.
  `match_article_chunks` is **not SECURITY DEFINER** (RLS applies to anon too) and filters to
  `published` regardless. RPCs have a pinned `search_path` (`0003`). The publish gate (`0006`)
  is `BEFORE INSERT OR UPDATE`, so it cannot be bypassed with a direct insert and revalidates
  on every update. The `db-rebuild` job in CI asserts schema, RLS and gate on every push.
- **Secrets and supply chain**: `.gitignore` excludes `.env*` and `.dev.vars*`; `gitleaks`
  full-history is **clean** (88 commits); the pre-commit hook runs gitleaks on staged files
  with a grep fallback; secrets flow from Doppler to GitHub secrets, never through the repo.

---

## Known future risks (not current findings)

- **Shiki and the CSP**: the first article with code blocks will introduce styles and scripts
  that break the hash-based CSP, and `test:csp` will fail at build. To handle when the first
  content with code arrives (already noted in the project memory).
- **The public C1 endpoint (ADR-0003)**: once the RAG terminal becomes queryable from the
  browser, PostgREST query values will come from user input. The `pg` template is already
  ready, but every interpolation will need to be checked for using it.
- **GitHub's 60-day schedules**: if the repo stays inactive for 60 days, the keepalive cron
  switches off and Supabase pauses. The risk remains (GitHub cannot be forced), but since
  2026-07-13 it is **no longer silent**: a Sentry cron monitor alarms on a missing check-in.
  Putting it *outside* GitHub is deliberate, because a watchman inside the same failure domain
  it watches is not a watchman.

---

## Method and limits

A static audit plus a locally served build plus **read-only** (GET) probes against the live
headers. **Not** performed, by agreement: POSTing the form, load testing, active fuzzing of
the endpoint, writes to the DB or to production. The items marked "to confirm" (for example
the Workers runtime behaviour on a chunked body, `L-2`) would need an active test in staging
to be closed with certainty. No project file was modified.

### Update 2026-07-13: the L-1 alert was *verified*, not inferred

The L-1 fix rested on `segnala()` reaching Sentry, but that path **had never been seen
working**: until that morning Sentry had received exactly one event in its entire life, and it
came from the *browser*. The Worker had never spoken to it, neither through `withSentry` nor
through `__SEGNALA_SENTRY__`. An alarm that has never rung and a broken alarm look far too
much alike.

Verified by running the Worker (same bundle, same SDK, same DSN) **without the two secrets**:
both handled branches produce the expected event in Sentry (`TURNSTILE_SECRET_KEY mancante`,
`RESEND_API_KEY mancante`). Production was never touched: its secrets were never removed and
the live form kept returning 403 to a request without a token.

*A residual limit, declared:* the test ran on `workerd` locally, not on Cloudflare's edge.
Bundle, SDK, DSN and code branch are identical, so the doubt is small, but it is not zero and
is not being sold as zero. (Note: `wrangler dev --remote` does **not** serve this purpose. It
inherits the deployed Worker's secrets, so the "missing secret" branch is unreachable there by
construction.)

---

## Addendum 2026-07-22: new surface, `/api/radar` and the `/atlas` page

**`/api/radar`** (a public GET endpoint aggregating CERT bulletins):

- **Untrusted input**: the feeds are governmental but the *channel* can be compromised. Titles
  are sanitised in two stages (entities in a single pass, so no double-unescape; tags to a
  fixed point, so `<scr<x>ipt>` does not recompose; zero residual angle brackets), and entities
  are decoded inside URLs too. Rendering on the page happens only through `textContent`.
- **Host allowlist on links**: an item whose link does not point at the source's declared
  domains is discarded, so a compromised feed cannot distribute somebody else's links from our
  domain.
- **Edge cache (30 minutes) with a key normalised to the path**: the query string cannot punch
  through the cache, so a hostile visitor cannot amplify traffic towards the upstream feeds.
- **Per-source fail-open**, with a ceiling on the upstream response and a per-feed timeout: a
  feed that is down or bloated degrades one layer, never the page. No secrets involved (the
  feeds are public).
- **Compliance as a gate**: every source in `src/data/radar-fonti.js` must carry `licenza.nome`
  and `licenza.url`, and a CI test rejects a source without a written licence. The extended
  registry, with quoted text, is `docs/FONTI.md`.

**The `/atlas` page** (a graph of the private wiki): the risk here is *data leakage*, not
injection. Three guards, each one watched failing before the commit: the generator refuses
nodes outside the allowlist (`concepts/` plus `entities/tools/`); one test verifies that every
node belongs there; another test searches the raw JSON for the private layers' strings. The 373
wikilinks towards the private layers are published as a *count*, never as labels. The refresh is
manual on purpose: the PR carrying the JSON diff is the point where a human eye sees what is
about to become public.

**Findings open after the addendum: 0.** (CodeQL raised 2 HIGH on the first version of the title
sanitisation. Both were well founded, and both were fixed in `9fe593d` with property tests.)
