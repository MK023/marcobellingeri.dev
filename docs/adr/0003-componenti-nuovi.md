# ADR 0003, the new "show-off" components

- **Status**: Accepted (design; built in sequence)
- **Date**: 2026-07-05
- **Block**: B3
- **Depends on**: [ADR-0001](0001-architettura-hosting-i18n.md), [ADR-0002](0002-motore-numero-mensile.md)

## Context

The site is Marco's technical business card (an AI/security professional) and the hub of a
future noir YouTube channel on "AI explained to seniors", aimed at an English-speaking
audience. The new components have to **demonstrate real competence** rather than be gadgets,
and they have to stay consistent with the "90s magazine / noir" aesthetic.

Components that already exist (not touched here): CommandPalette (⌘K), NeonTerminal (CRT), the
day/night UtilityBar, halftone, custom cursors.

## Chosen (by Marco)

### C1, the CRT terminal becomes a real RAG interface
- **What**: the neon easter egg turns into an `ask <question>` command that queries the archive
  of **published** issues.
- **Demonstrates**: AI, RAG and an edge backend, in a noir/hacker aesthetic.
- **Flow**: input, Worker, embed the query (Voyage), `match_article_chunks` (`published` only),
  Claude composes the answer **citing the issues**, then it streams to the terminal. It answers
  in the UI language (IT/EN).
- **Security by design** (it is a **public** AI endpoint, so it is surface):
  - **Rate limiting** per IP (Cloudflare) plus a **cost cap** (max tokens per call, daily
    ceiling) to prevent abuse and bills.
  - **Anti prompt-injection guardrails**: a hardened system prompt, no tool access, output
    confined to the archive, refusal outside scope; user input never enters a privileged
    context.
  - No PII collected; a dedicated CSP for the endpoint.
- **Dependencies**: B2 implemented (Supabase plus RAG with published content), the keys
  (Voyage/Anthropic/Supabase) and the Worker. → **Blocked until the keys exist. Built last.**

### C3, the self-referential security card
- **What**: a panel showing **the site's own security headers** (CSP, HSTS,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy) with one line of explanation for
  each.
- **Demonstrates**: security competence, in a way that is both meta and consistent with the
  noir tone.
- **Spec**: the values are generated **at build time from the headers' source of truth** (the
  CF config / `_headers`) rather than from a live fetch, so they are always consistent and add
  no surface. Bilingual.
- **Dependencies**: no keys. **Buildable now** (better after the headers have moved to
  Cloudflare, so that it shows the real production ones).

### C4, the language switcher plus geo banner
- **What**: an `/it/ ↔ /en/` switcher plus a banner that **suggests** a language based on geo,
  SEO-safe ([[ADR-0001]] §4): it does not redirect crawlers, it can be overridden by cookie,
  and both languages stay crawlable.
- **Demonstrates**: i18n and international SEO competence.
- **Dependencies**: the **Astro i18n foundation** (`/it/`, `/en/`, hreflang, x-default). No
  keys. **Buildable now**, and it is the heart of the bilingual work.

## Rejected

- **C2, a signals wire feed** (a newswire-style dispatch of the Firecrawl signals): rejected by
  Marco.

## Build order (Marco decides the sequence)

1. **Now, without keys**: the i18n foundation, then **C4**; and **C3** (standalone).
2. **After B2 implementation plus keys**: **C1** (the RAG terminal) with its security spec.

## Observability (open decision, constraint: free)

- Proposal: **Langfuse** (traces and costs of LLM generation, which Marco already uses) plus
  **native Cloudflare observability** (edge, free) plus **GitHub Actions logs** (CI).
- The showcase alternative: self-hosted **Grafana + Loki** (a single dashboard, but with infra
  cost). To be decided.
