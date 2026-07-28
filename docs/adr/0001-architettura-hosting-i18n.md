# ADR 0001, architecture: hosting, i18n, language detection, monthly engine

- **Status**: Accepted
- **Date**: 2026-07-05
- **Deciders**: Marco (navigator), Claude
- **Block**: B1 (architecture, which decides the hosting)

## Context

`marcobellingeri.dev` is Marco's **technical business card** for a bigger project still to
come: a **YouTube channel** covering real cases of applying and using AI and technology, aimed
at a **senior, English-speaking audience** that has not yet got to grips with these tools, with
a **noir** aesthetic matching the site. The site will act as its hub and landing page.

Constraints driving the architecture:

- **Bilingual IT/EN** with **international SEO and AEO** as the primary goal (the main target
  is English-speaking).
- **Automatic language detection** based on who is asking (geo/IP plus browser language).
- **Security by design**, on a platform consistent with Marco's world (he already uses
  Cloudflare Zero Trust elsewhere).
- An evolution of an existing Astro site ("90s magazine" identity, monthly issues, an archive
  fed by Firecrawl), **not** a rewrite.
- **Monthly issues** ("90s magazine"): one issue a month, real articles (case, application,
  solution), with visitors able to **pull up past issues**.

## Decisions

### 1. Hosting: Cloudflare **Workers** (static assets) plus the `@astrojs/cloudflare` adapter
Not Pages. The Cloudflare docs point to Workers as the modern path (Pages already has a
migration guide towards Workers), and Workers adds **Cron Triggers**, observability and native
access to **Workers AI / Vectorize** on the same platform, which will be useful for the future
RAG. Astro is a first-class framework on CF.

### 2. Rendering: **static-first, prerendered per language**
No runtime backend until one is needed (YAGNI). Clean, fast static HTML is optimal for SEO
**and AEO** (answer engines want crawlable content, not a RAG behind JavaScript). The "linked
project" (the YouTube channel) can later add **one** edge function, not an always-on backend.

### 3. i18n: native Astro, `prefixDefaultLocale: true`
URLs `/it/…` and `/en/…` are **both prefixed**, so there is no ambiguous default, hreflang is
explicit, and international SEO is better for it. Add `x-default`, a **sitemap per language**
and a **visible language switcher**. Content (past and new issues) becomes **bilingual content
collections**; the archive and the recall of past issues are **static, crawlable routes**.

### 4. Language detection by geo/IP: **yes, but SEO-safe**
A known tension: Google **advises against auto-redirecting by IP or browser**, since Googlebot
crawls from US IPs and would always be diverted to `/en/`, leaving `/it/` unindexed. The
reconciliation adopted:

- Both languages stay **permanently crawlable static URLs** with hreflang and `x-default`.
- The geo-redirect lives **only on the root `/`**, through a **Worker** that reads
  `request.cf.country` and `Accept-Language`.
- **Humans only**: known crawlers (Googlebot, bingbot and so on) are **not** redirected.
- **User override** via cookie (a manual choice beats geo) plus a visible switcher.
- Redirects happen only on `/` (302), **never** on already-resolved language URLs.

### 5. The monthly issue engine (detail in B2)
AI agents generate the issue, it gets committed, and **Workers Build** auto-deploys. The
trigger is either a **GitHub Action** (as today) *or* a **Cloudflare Cron Trigger**, decided in
B2.

### 6. RAG store: **Supabase (pgvector)**, decided
Update (2026-07-05): **Supabase pgvector** was chosen (not Vectorize) as the RAG store and the
source of truth for drafts and review, on the strength of existing production experience with
it. Pipeline and schema detail in **ADR-0002**.

### 7. Security by design
Cloudflare WAF and managed rules; security headers carried over from `vercel.json` to
Workers/`_headers`; secrets in **Workers env** (never in the repo); the repo stays **private
during the build and goes public at go-live** (which unlocks secret scanning, push protection
and rulesets for free).

## Notes on using Firecrawl

- **Role**: structured scraping of the sources that feed issue generation. The Python script
  described here was replaced by `engine/competitors.mjs`, which scrapes the competitor set
  into Supabase instead of writing static JSON for the browser.
- **Sources**: the admitted set and its licences live in `docs/FONTI.md`, which is the single
  registry. Channel design is in **ADR-0004**.
- **Key**: `FIRECRAWL_API_KEY` lives **only** in secrets, **never** in the repo.
- **Evolution (B2)**: from "scrape to JSON" towards "scrape, generate with an LLM, store (RAG),
  bilingual issue". Firecrawl stays the collection layer, with generation (Claude/Python) and
  possible Vectorize indexing on top.
- **Precondition**: keep Firecrawl inside the CSP and the allowlist, and log what gets
  collected (traceability).

## Consequences

**Upsides**: a single platform (Workers) for static, edge and future AI/RAG; SEO and AEO
maximised by static plus hreflang; geo-language without sacrificing indexing; a minimal attack
surface until a runtime is actually needed; content portability (content collections) that does
not depend on the host.

**Downsides and things to watch**: the geo-redirect Worker needs testing against crawlers (an
SEO risk if done badly); migrating the headers from `vercel.json` to CF needs verification;
Vectorize and Workers AI are new to Marco's stack (docs before use).

## References (docs consulted)

- Cloudflare, Deploy Astro / Workers static assets / Pages to Workers migration:
  <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>
- Cloudflare, Pages framework guide (Astro):
  <https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/>
- Astro, internationalization (i18n) routing:
  <https://docs.astro.build/en/guides/internationalization/>
- Google Search Central, managing multi-regional and multilingual sites (advises against
  auto-redirecting by IP; use hreflang plus user choice):
  <https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites>
