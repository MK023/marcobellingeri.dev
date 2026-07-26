# AI threat model, in MITRE ATLAS vocabulary

> This site's defences existed before they had an ATLAS name. This document maps them onto the
> taxonomy (release **2026.06**, the same one served by the Radar's AI layer) because a threat
> model that speaks the standard vocabulary can be compared, audited and updated. Every defence
> named here carries its **proof** (`file:line`) and, where one exists, the test that watches it.
> Convention: technique IDs are checked against `dist/v6/ATLAS-2026.06.yaml`, never quoted from
> memory.

## Perimeter

The site's AI systems are the ones listed on `/ai`: the terminal's `ask` command (RAG plus
Claude Haiku), the magazine pipeline (`engine/`: ingest, generate, embed), the judge
(LLM-as-a-judge on the issues) and the embeddings (Voyage). The Radar is **not** an AI system,
and the page says so.

**A structural fact that cuts half the taxonomy**: the site owns no models. No weights, no
training, third-party models over an API (Anthropic, Voyage). Tactics against training and
model theft are **not applicable by architecture**, not by mitigation (see the last section).

## The map: ATLAS technique → concrete vector → defence → proof

### AML.T0093, Prompt Infiltration via Public-Facing Application
`/api/ask` is exactly the surface described: free public input reaching an LLM.

| Defence | Proof |
|---|---|
| Turnstile plus per-IP rate limiting | `astro-project/worker/index.js:210-212` (`ASK_LIMITER`) |
| Body capped before the parse | `astro-project/worker/index.js:69` (`leggiBodyLimitato`) |
| Output capped at 500 tokens | `astro-project/worker/index.js:316` |

### AML.T0051, LLM Prompt Injection (direct and indirect)
| Defence | Proof |
|---|---|
| **Permissions live in the code, not in the prompt**: `ask` has no tools, no actions, and can only answer with text | contract comment at `astro-project/worker/index.js:201` |
| The system prompt is defence in depth, **not** the barrier | `astro-project/worker/index.js:293` |
| Model output is untrusted input in the DOM: everything goes through `esc()` | `astro-project/src/components/NeonTerminal.astro:68` (definition), `:241` (the answer) |

### AML.T0070 / AML.T0071, RAG Poisoning / False RAG Entry Injection
The site's real vector: third-party content enters through the sourcing channels (Valyu,
Radar) and could aim to poison what the RAG serves.

| Defence | Proof |
|---|---|
| The RAG's RPC serves **only** `published`; the publish gate is **in the DB**, not in the application | `supabase/migrations/0006_publish_gate.sql:6-7` |
| `published` requires **human** verification with a tier (1, or 2 plus independent) | the same gate; the tier is never assigned by a model |
| Third-party text is **data, never instructions** during generation | `engine/ingest.mjs:14`; the same contract in `engine/lib/radar-signals.mjs` |
| Radar items pass the domain barrier | `astro-project/worker/radar.js` (`hostAmmesso`), tested in `radar.test.mjs` |

### AML.T0080, AI Agent Context Poisoning
The only "agent" is the magazine pipeline, and its context ingests third-party web content.

| Defence | Proof |
|---|---|
| Autonomy capped by the **two human gates** (tier verification, content merge) | `0006_publish_gate.sql`; the rule in the repo's `CLAUDE.md` |
| Advisory post-generation judge (report plus exit code, deliberately never blocking) | `engine/judge.mjs:106` |

### AML.T0056 / AML.T0069.002, Extract LLM System Prompt
A risk **accepted by design**: the `ask` system prompt is neither a secret nor a security
control, and extracting it confers no authority (permissions live in the code, see above).
No dedicated defence, and that is a choice rather than an oversight.

### AML.T0029, Denial of AI Service
| Defence | Proof |
|---|---|
| Per-IP rate limiting plus Turnstile in front of the model | `astro-project/worker/index.js:210-212` |
| `max_tokens: 500`, so the cost per request is capped | `astro-project/worker/index.js:316` |
| Declared fail-open: the model being down means a degraded answer, not a 500 | the `esito: degradato` attribute in `astro-project/worker/langfuse.js` |

### AML.T0024, Exfiltration via AI Inference API
The RAG can only exfiltrate what is already public: it serves `published` content
exclusively, which sits on the site in plain sight. The competitor channel (internal data) is
**deny-all at the RLS level and never enters the RAG**
(`supabase/migrations/0002_channel2_competitors.sql:40`, ADR-0004).

### Not applicable by architecture (declared, not forgotten)
`AML.T0020` (Poison Training Data), `AML.T0018` (Poison AI Model), `AML.T0058` (Publish
Poisoned Models), model theft and inversion: **no training and no models of our own**.
The residual risk is a supply chain one, the trust placed in the Anthropic and Voyage API
models, and it is managed as supply chain (SHA pinning, SBOM, attestation) rather than as an
ML defence.

## Measuring (NIST AI RMF, *Measure* function)

The declared metrics, all of which exist today, with no dashboard left to build:

| Metric | Where to read it | When |
|---|---|---|
| **Outcome of `ask` requests**: `ok` / `degradato` / `zero-match` | the `esito` attribute on Langfuse traces (`worker/langfuse.js`) | sampled; a spike in `zero-match` means the RAG does not cover the real questions |
| **Judge verdict** per issue (passed or failed, plus the report) | the comment on the content PR; exit code in `engine/judge.mjs:106` | every issue |
| **Silences and anomalies**: a mute KEV, a Radar blackout, crons that never start | Sentry (reports plus cron check-ins) | on notification |

The reading criteria are written down here because a metric without a threshold for concern
is furniture. Rising `zero-match` means enriching the magazine, not "tuning" the RAG. A judge
that fails two issues in a row means reopening the editorial line, not lowering the bar.

## AI telemetry retention

- **User content: never collected, by construction.** Neither the question nor the answer of
  `ask` leaves the Worker for Langfuse, only numbers (tokens, timings, outcome) and a random
  session id per visit. `/privacy` says so, `worker/langfuse.js` implements it ("NUMBERS ONLY,
  NEVER CONTENT") and **a dedicated test enforces it**
  (`astro-project/test/worker.test.mjs:397`). Content retention is therefore a non-problem:
  there is no content.
- **Telemetry (the numbers): 90 days.** Enough for debugging and for the `esito` metric across
  a season; beyond that it is hoarding. Note on enforcement: retention is set in the Langfuse
  project (a one-off setting, done by hand by Marco). This line is the policy, that is the
  implementation.

## Maintaining this document

It is updated when: (1) a new AI system appears on `/ai`; (2) MITRE publishes an ATLAS release
with new RAG or agent techniques (`node engine/atlas.mjs` brings it into the Radar, and this
document should be reread in the same pass); (3) a real incident contradicts a line above, in
which case the line gets corrected rather than defended.
