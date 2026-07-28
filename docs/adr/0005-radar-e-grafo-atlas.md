# ADR 0005, the Radar and the Atlas graph: living pages, same infrastructure

- **Status**: Accepted
- **Date**: 2026-07-22

## Context

Two requests from Marco on the same day: a globe of security events worldwide ("so you can see
the problems happening in the world") and a page showing his personal knowledge base as a living
network. Both are *pages that demonstrate*, which is the site's philosophy, but they touch
external data (feeds) and private data (the wiki).

## Decision

**Radar**: the Worker aggregates the feeds (`/api/radar`, same-origin) with a 30-minute edge
cache and per-source fail-open, and the browser receives JSON that is already sanitised. **A
source gets in only if its licence permits commercial use in writing** (the site sells): the
registry is `docs/FONTI.md` plus `src/data/radar-fonti.js`, and a CI test enforces it. Rendering
is 2D canvas with an orthographic projection (Natural Earth in the repo, about 55KB), so no
WebGL. What the rule implies: out go Cloudflare Radar (CC BY-NC), abuse.ch, ransomware.live, the
AI Incident DB and, ironically, the Italian ACN (which forbids commercial use); in come CISA,
NCSC UK, CERT-FR, the European Commission and MITRE ATLAS, whose case studies feed the globe's
AI layer as `itemsStatici` (a committed taxonomy, not a feed). The admitted set has grown since,
so the roster is not repeated here: the registry above is the single list, and it carries the
licence quote and the verdict date for each source.

**Atlas graph**: the graph is generated **offline and by hand**
(`scripts/genera-grafo-atlas.mjs`) from the `concepts/` and `entities/tools/` layers only, and
wikilinks towards the private layers are counted, never named. The JSON (20KB, precomputed
layout) is committed, which makes the PR the point of human review over what becomes public.
Three privacy guards: a throw in the generator, an allowlist test, and an anti-string test over
the raw JSON.

## Rejected alternatives

- *Fetching the feeds from the browser*: it would open the CSP to third-party domains and
  multiply traffic towards the agencies per visitor. No.
- *three.js for the globe*: roughly 600KB for a wireframe that about 30 lines of trigonometry
  can draw. No.
- *Generating the Atlas graph in CI*: it would need a long-lived credential towards the private
  repo and the human review of the diff would disappear. No: the friction here is a feature.
- *Waving a "real time" banner*: advisories come out daily, so the page says "updated N minutes
  ago" instead of "LIVE". Honesty about freshness is part of the deal.
