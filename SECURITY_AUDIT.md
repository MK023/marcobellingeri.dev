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
engine, which came into scope after this report) found 1 High (personal data hardcoded in a
generation script, now replaced by sha256 digests), 5 Medium and a tail of Low and Info items:
**every actionable one was fixed in the same PR**. Details in the round 2 audit commits.

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
Supabase, CI actions pinned to SHA, secrets outside the repo (gitleaks full-history clean as of
2026-07-11). The "pending" XSS noted in Atlas for `ArchiveSection.astro` **turns out to be
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
| High     | 0 | 1 (round 2, 2026-07-12) |
| Medium   | 0 | 6 (5 in round 2, plus M-1, ReDoS, 2026-07-13) |
| Low      | 0 | 3 (L-1, L-2, L-3) |
| Info     | 3 | 1 (I-1, 2026-07-18) |

Checks performed: `npm run build` (green) · `npm run test:csp` (**106/106 pass**, including the
anti-header-injection test) · the engine suite (**191 tests**, 99.3% of lines) ·
`gitleaks detect` full-history as of 2026-07-11 (**no leaks**) · zero `.map` files in `dist/` ·
security headers confirmed as served on `/it/` · the Worker to Sentry path proven end to end.

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
level**, so browsers force HTTPS regardless. The probe confirms it (at the time of the audit):
`curl -sI https://marcobellingeri.dev/` (302) has no `Strict-Transport-Security`, while `/it/`
does. This is consistent with the documented choice ("bare root, preload from the TLD").
**Recommendation:** no action needed while the domain stays `.dev`. If a non-preload domain
were ever added, add HSTS to `rispostaJson` and to the 302 as well.

### M-1, ReDoS in `sanitizeSource`: quadratic backtracking on third-party text (Medium), RESOLVED
**File:** `engine/lib/guardrails.mjs:73`, the pattern on `:76` (PR #53, 2026-07-13)
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
**File:** `astro-project/astro.config.mjs:31`
`data:` in `img-src` is historically a minor XSS vector (data-URI images). In this context (a
static site with no user input generating `<img>`) the risk is negligible, and it is there for
inline font and asset subsets. No action.

### I-3, per-IP rate limiting, approximate and per-location (Info)
**File:** `astro-project/worker/index.js:127-131`, `wrangler.jsonc:18-20`
The binding is "eventually consistent, intentionally not accurate" (by Cloudflare's design)
and keyed on `CF-Connecting-IP`. An attacker with an IPv6 /64 block has plenty of addresses.
This is defence in depth, not the primary barrier (Turnstile and the honeypot are). Consistent
with the documentation. No action.

### I-4, the `reply_to` email does not go through `rigaPulita` (Info, not exploitable)
**File:** `astro-project/worker/index.js:162, 183`
The email lands in `reply_to` without passing the control-character filter. It is **not
exploitable**: the regex `^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$` forbids any whitespace (including
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
  ones and the external fetch (Turnstile) comes after local validation. `rigaPulita:54`
  neutralises CRLF injection in the subject, **verified by the test**.
- **Client-side XSS**: a full grep over `src/` finds no uncontrolled HTML write sink. The three
  `set:html` uses are JSON-LD blocks built server-side from typed content, never from user
  input. `ArchiveSection.astro`, the runtime DOM build examined here, no longer exists:
  `MagazineSection.astro` replaced it with a section rendered at build time from the content
  collection, and its only client script writes through `textContent` (`:114, :129`).
  `NeonTerminal.astro` uses `innerHTML` only on hardcoded constants; **every** user input goes
  through `esc()` (defined at `:68`, applied to the model's answer at `:241`), which covers
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
  full-history is **clean** as of 2026-07-11; the pre-commit hook runs gitleaks on staged files
  with a grep fallback; secrets flow from Doppler to GitHub secrets, never through the repo.

---

## Known future risks (not current findings)

- **Shiki and the CSP**: the first article with code blocks will introduce styles and scripts
  that break the hash-based CSP, and `test:csp` will fail at build. To handle when the first
  content with code arrives (already noted in the project memory).
- **The public C1 endpoint (ADR-0003)**: the RAG terminal is queryable from the browser
  (`POST /api/ask`), so PostgREST values now come from user input. The call goes to
  `rpc/match_article_chunks` with a JSON body (`astro-project/worker/index.js:261`), with
  nothing interpolated into a query string. The `pg` template stays ready, and every new
  interpolation has to be checked for using it.
- **GitHub's 60-day schedules**: if the repo stays inactive for 60 days, the keepalive cron
  switches off and Supabase pauses. The risk remains (GitHub cannot be forced), but since
  2026-07-13 it is **no longer silent**: a Sentry cron monitor alarms on a missing check-in.
  Putting it *outside* GitHub is deliberate, because a watchman inside the same failure domain
  it watches is not a watchman. *This holds for the keepalive and only for the keepalive. The
  other three schedules were found unwatched on 2026-08-13: see the addendum of 2026-08-14.*

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

**Findings open after the addendum: 0 actionable, the 3 Info items above.** (CodeQL raised 2
HIGH on the first version of the title sanitisation. Both were well founded, and both were
fixed in `9fe593d` with property tests.)

---

## Addendum 2026-08-14: three alarms that were registered and silent

The entry under "known future risks" said the missing-run case was covered by a Sentry cron
monitor. True for `supabase-keepalive`, and false for everything else, which nobody had
checked because the monitors *existed*.

**What the API said.** Sentry includes **one** cron monitor per plan. `magazine-ingest`,
`visibility` and `llm-council-e2e` had all registered a monitor, were all receiving their
check-ins, and all sat `disabled` behind the quota. Three jobs whose absence nothing could
observe, each with a green-looking check-in in its workflow log.

This is the worst shape a control can take. A missing alarm gets noticed eventually; an alarm
that exists, receives its input and never fires gets trusted. It was found by listing the
monitors through the API, never by reading a workflow.

Related: querying the alert rules through `/projects/{org}/{proj}/rules/` now answers **410
Gone**. Sentry moved to `detectors` + `workflows` under `/organizations/{org}/`. The detectors
for the three monitors read `enabled: true`, which is exactly the reading that makes everything
look fine, because the thing that is off is the monitor and not the detector.

**What was done, and why it is not the obvious fix.** The obvious fix is to move the single
active seat onto whatever matters most. That was rejected: the seat sits on the keepalive,
where a paused database costs more than the rest of the chain combined, and moving it would
have traded one blind spot for another.

Instead the pattern is inverted. `scripts/sentinella-cron.mjs` runs **daily**, asks the GitHub
API when each schedule last *fired* (only `schedule` runs count, since a manual dispatch proves
the workflow works and not the cron), and sends a `CronMuto` **error event** for any that has
gone quiet. Error quota is ample and nearly unused; cron seats are one.

An error event alarms on something that happened and a cron monitor on the absence of a signal.
Those are different instruments, and covering an absence with an event still needs something
active to notice it first.

**And the watchman has a watchman.** The circle was closed with mutual cover rather than a
fourth tool: the daily watchdog also watches `supabase-keepalive`, and the keepalive, which is
the one job with a live Sentry monitor, runs the same script and so watches the watchdog. Its
step is `continue-on-error`, because a guard that fails what it hosts is worse than no guard.

**Verified end to end, not inferred** (the failure mode this addendum is about is precisely a
control believed rather than tested). Forcing a schedule to read as quiet produced the event,
and Sentry filed it at **`priority: high`**, which is the condition the existing notification
automation fires on. The test issue was resolved afterwards.

Residual, and stated rather than closed: this depends on the GitHub API remaining readable
anonymously for public repositories, and on the keepalive itself running. The keepalive is the
only link with a passive alarm, which is why it is the one holding the seat.

---

## Addendum 2026-08-16: the `/api` surface, and a measurement that lied

An OWASP API pass over the public surface found three things on `/api/agentic-status`, all low,
none exploitable today. They are recorded because the reason for fixing them is not the risk.

**Methods.** The route answered `200` to POST, PUT, DELETE and PATCH; only TRACE was refused.
Nothing mutates, because the route is read-only and there is no write path to reach, but a
`DELETE` that answers `200` tells a client the deletion worked. Now `405` with `Allow: GET`, the shape
`gestisciRadar` already had.

**Headers.** The route went out with `nosniff` alone while the HTML gets five. `public/_headers`
covers static assets; responses the Worker generates do not pass through it. That was already
finding L-3, fixed then for HSTS on two responses and never generalised, so the list lived
copied into four places and had started to drift. It now sits in `worker/headers.js`, imported
by `index`, `agentic-status` and `radar`. The test writes the five values out in full rather
than importing the constant: a test that compares a constant against itself cannot fail.

**Rate limiting.** `agentic-os/CLAUDE.md` claimed "Cloudflare does it at the edge". There is no
rate limiting rule on the zone, which is what settles it; a burst of 60 requests in about 20
seconds drawing zero `429` agrees, but as the table below shows, a request count on its own
cannot tell a working limit from an absent one. A control that is asserted
and absent is worse than one that is missing, because whoever reads the claim stops looking for
the thing. There is now a `STATUS_LIMITER` binding at 60/minute per IP, the same mechanism as
`CONTACT_LIMITER` and `ASK_LIMITER`, which were already here, so this widens an existing pattern
rather than introducing one. Finding I-3 still stands as written: the counter is per location
and eventually consistent by design, which makes it a ceiling against a flood from one source
and not a guillotine on the 61st request.

**Where the limit sits, which is the one design decision here.** It is in the router, not in
`gestisciAgenticStatus`, unlike `/api/contact` and `/api/ask` which guard themselves. That
handler has an internal caller: the cron probe invokes it as a function, with no IP. Inside the
handler the probe would land in the `'sconosciuto'` bucket along with everyone else lacking one,
a flood would bounce it with `429`, and it would read a response that is not the numbers and
report to Sentry a hub that is perfectly healthy. That is a false alarm manufactured by our own
defence. A test covers it, and the test was checked by moving the limit into the handler and
watching it go red.

### The measurement that lied

Straight after the deploy, production said the limit was not working. Twice.

| how it was measured | result |
| --- | --- |
| 70 sequential `curl` calls, one process each (~60s) | 70 × `200`, spread past the window |
| 90 requests, `xargs -P 15`, 2s | 90 × `200`, 15 connections and 15 counters |
| 130 URLs handed to **one** `curl`, 7s | 62 × `200` then 68 × `429` |

Cloudflare documents the counter as per location and eventually consistent. Per connection is
what these runs *observed*, not a documented property, so treat it as behaviour to design a
verification around rather than a guarantee. Either way, parallelism does not sharpen this test,
it dilutes it. Before concluding the control was absent, the deploy log was read instead of the measurement,
and `env.STATUS_LIMITER (60 requests/60s)` was sitting right there. When a control looks
missing, check what was actually deployed before believing the probe. Both wrong measurements would have looked identical had the limit genuinely been absent,
which is the same defect this addendum exists to close, seen from the other side.

`/api/contact` and `/api/ask` now carry `Retry-After: 60` on their `429` as well. They were left
behind only because the pass that added it did not touch them.
