# Visibility Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un modulo `engine/` che misura la discoverability del sito (SEO via Google Search Console, AEO via Perplexity Sonar) e stampa un referto prescrittivo, con lo storico su Supabase.

**Architecture:** Clone del pattern radar competitor (`engine/competitors.mjs`): script orchestratore che legge query target da Supabase, interroga due segnali esterni via `fetch` nativo, scrive righe-osservazione storiche via il client `pg`/`insert` esistente, poi rende un referto markdown. Logica di match citazione isolata in un lib puro e unit-testato. Nessuna dipendenza nuova.

**Tech Stack:** Node ≥20 (ESM, `fetch` nativo, `node:test`), Supabase/PostgREST, Langfuse, Perplexity Sonar API, Google Search Console API, Doppler (segreti), GitHub Actions (schedule).

**Spec di riferimento:** `docs/superpowers/specs/2026-07-18-visibility-monitor-design.md`

---

## Prerequisiti (fuori dai task di codice, da fare una volta)

Prima di iniziare i task, si leggono le due pagine Atlas (regola 10 dei modelli MUST):
`~/GitHub/Atlas/concepts/pipeline-cicd.md` e `~/GitHub/Atlas/concepts/testing-pyramid.md`.

Segreti da creare in **Doppler** (mai nel repo): `PERPLEXITY_API_KEY`,
`GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`, `GSC_SITE_URL`
(es. `sc-domain:marcobellingeri.dev`). L'ottenimento del refresh token OAuth GSC è
un'operazione manuale di Marco (consenso su account Google proprietario) — non la fa un
subagent. Fino a che i segreti non esistono, i test girano lo stesso (mock/env vuoto);
solo il run reale li richiede.

## File Structure

| File | Responsabilità |
|---|---|
| `supabase/migrations/0011_visibility_monitor.sql` | Tabelle `visibility_queries` + `visibility_observations`, RLS, grant |
| `engine/lib/urlmatch.mjs` | **Logica-soldi**: normalizzazione host + match citazione. Puro, zero I/O |
| `engine/lib/perplexity.mjs` | Client Sonar + estrazione citazioni (usa `urlmatch`) |
| `engine/lib/gsc.mjs` | OAuth2 read-only + Search Analytics query |
| `engine/lib/referto.mjs` | Ruleset prescrizioni (puro) + rendering markdown |
| `engine/visibility.mjs` | Orchestrazione: query → segnali → osservazioni → referto |
| `engine/test/visibility-urlmatch.test.mjs` | Unit sul match host/citazione |
| `engine/test/visibility-referto.test.mjs` | Unit sul ruleset prescrizioni |
| `engine/test/visibility.test.mjs` | Integration spawn con `fetch` moccato |
| `.github/workflows/visibility.yml` | Run schedulato settimanale |
| `engine/README.md` | Aggiornamento contratto pipeline/test |

Ordine di build: il lib puro `urlmatch` per primo (è il cuore, TDD stretto), poi gli
adattatori che lo usano, poi l'orchestratore, infine schedule e docs.

---

### Task 1: Migration — schema, RLS, grant

**Files:**
- Create: `supabase/migrations/0011_visibility_monitor.sql`

- [ ] **Step 1: Scrivi la migration**

Segue il pattern di `0004_grants.sql` e `0010_rls_explicit_policies.sql` (RLS abilitata,
nessuna policy pubblica di lettura → dato privato; solo il `service_role`, che bypassa
RLS, scrive/legge dall'engine).

```sql
-- 0011_visibility_monitor.sql
-- Monitor discoverability (SEO via GSC + AEO via Perplexity). Dato privato:
-- RLS attiva, nessuna policy -> nessun accesso anon/authenticated. Il service_role
-- bypassa RLS (come per le tabelle competitor). Grant espliciti come in 0004.

create table if not exists visibility_queries (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  locale      text not null check (locale in ('it', 'en')),
  market      text not null check (market in ('naz', 'internaz')),
  content_ref text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists visibility_observations (
  id         uuid primary key default gen_random_uuid(),
  run_at     timestamptz not null,
  engine     text not null check (engine in ('perplexity', 'gsc')),
  query_id   uuid references visibility_queries(id) on delete set null,
  present    boolean not null,
  rank       numeric,
  detail     jsonb not null default '{}'::jsonb,
  raw        text,
  created_at timestamptz not null default now()
);

create index if not exists visibility_obs_run_idx on visibility_observations (run_at desc);
create index if not exists visibility_obs_query_idx on visibility_observations (query_id);

alter table visibility_queries enable row level security;
alter table visibility_observations enable row level security;

-- Nessuna policy: anon/authenticated non vedono nulla. Solo service_role (bypass RLS).
grant select, insert, update, delete on visibility_queries to service_role;
grant select, insert, update, delete on visibility_observations to service_role;
```

- [ ] **Step 2: Applica in locale e verifica**

Run: `supabase db reset` (ricostruisce da tutte le migration, come fa la CI `db-rebuild`)
Expected: nessun errore; `visibility_queries` e `visibility_observations` presenti.

Verifica RLS attiva:
Run: `supabase db execute "select tablename, rowsecurity from pg_tables where tablename like 'visibility_%'"`
Expected: entrambe `rowsecurity = t`.

- [ ] **Step 3: Seed di prova (una query) per i test manuali successivi**

Run:
```bash
supabase db execute "insert into visibility_queries (text, locale, market, content_ref) values ('self audit as an engineering discipline', 'en', 'internaz', 'audit-di-se')"
```
Expected: `INSERT 0 1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_visibility_monitor.sql
git commit -m "feat(visibility): migration tabelle queries + observations (RLS privata)"
```

---

### Task 2: `urlmatch.mjs` — normalizzazione host e match citazione (TDD)

Il cuore. Un bug qui dice "non citato" quando lo sei. Test prima, casi cattivi inclusi.

**Files:**
- Test: `engine/test/visibility-urlmatch.test.mjs`
- Create: `engine/lib/urlmatch.mjs`

- [ ] **Step 1: Scrivi il test che fallisce**

```javascript
// engine/test/visibility-urlmatch.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeHost, isSameDomain, findCitation } from "../lib/urlmatch.mjs";

const DOMAIN = "marcobellingeri.dev";

test("normalizeHost: schema, www, path, case, porta", () => {
  assert.equal(normalizeHost("https://www.Marcobellingeri.dev/it/writing"), "marcobellingeri.dev");
  assert.equal(normalizeHost("marcobellingeri.dev"), "marcobellingeri.dev");
  assert.equal(normalizeHost("http://marcobellingeri.dev:443/"), "marcobellingeri.dev");
  assert.equal(normalizeHost(""), null);
  assert.equal(normalizeHost(null), null);
  assert.equal(normalizeHost("non un url"), "non un url" === null ? null : normalizeHost("non un url")); // vedi sotto
});

test("isSameDomain: dominio, sottodominio, www — sì", () => {
  assert.equal(isSameDomain("https://marcobellingeri.dev/it", DOMAIN), true);
  assert.equal(isSameDomain("https://www.marcobellingeri.dev", DOMAIN), true);
  assert.equal(isSameDomain("https://blog.marcobellingeri.dev/x", DOMAIN), true);
});

test("isSameDomain: suffix attack e lookalike — no", () => {
  assert.equal(isSameDomain("https://marcobellingeri.dev.evil.com", DOMAIN), false);
  assert.equal(isSameDomain("https://notmarcobellingeri.dev", DOMAIN), false);
  assert.equal(isSameDomain("https://example.com", DOMAIN), false);
});

test("findCitation: trova alla posizione giusta (1-based)", () => {
  const cites = ["https://a.com", "https://www.marcobellingeri.dev/it/writing/x", "https://b.com"];
  assert.deepEqual(findCitation(cites, DOMAIN), {
    present: true, rank: 2, matchedUrl: "https://www.marcobellingeri.dev/it/writing/x",
  });
});

test("findCitation: accetta anche oggetti {url} e assenza", () => {
  assert.deepEqual(findCitation([{ url: "https://marcobellingeri.dev" }], DOMAIN),
    { present: true, rank: 1, matchedUrl: "https://marcobellingeri.dev" });
  assert.deepEqual(findCitation(["https://x.com"], DOMAIN),
    { present: false, rank: null, matchedUrl: null });
  assert.deepEqual(findCitation(null, DOMAIN), { present: false, rank: null, matchedUrl: null });
});
```

Nota: la riga `normalizeHost("non un url")` va sostituita con l'asserzione reale allo
Step 3 quando il comportamento è deciso — vedi implementazione (un input senza schema
valido come host è trattato come host: `normalizeHost("non un url")` → `"non un url"`
minuscolo, perché `new URL("https://non un url")` lancia e si ritorna l'input abbassato).
Correggi il test così:
```javascript
  assert.equal(normalizeHost("Esempio.COM"), "esempio.com");
```
(rimuovi la riga ambigua "non un url").

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `cd engine && node --test test/visibility-urlmatch.test.mjs`
Expected: FAIL — `Cannot find module '../lib/urlmatch.mjs'`.

- [ ] **Step 3: Implementa il minimo**

```javascript
// engine/lib/urlmatch.mjs
// Puro, zero I/O. La risposta di un answer engine è input non fidato: qui la si usa
// SOLO per confrontare host, mai per eval/DOM/query.

// Ritorna l'host normalizzato (minuscolo, senza www., senza porta) o null.
export function normalizeHost(input) {
  if (!input || typeof input !== "string") return null;
  let host;
  try {
    host = new URL(input.includes("://") ? input : `https://${input}`).hostname;
  } catch {
    return input.toLowerCase().trim() || null;
  }
  return host.toLowerCase().replace(/^www\./, "");
}

// true se `url` è sul dominio `domain` o un suo sottodominio. Blocca il suffix attack
// (marcobellingeri.dev.evil.com) perché confronta segmenti, non sottostringhe.
export function isSameDomain(url, domain) {
  const h = normalizeHost(url);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

// Dato un elenco di citazioni (stringhe URL o oggetti {url}) e il dominio target,
// ritorna { present, rank (1-based), matchedUrl }.
export function findCitation(citations, domain) {
  const list = Array.isArray(citations) ? citations : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const url = typeof item === "string" ? item : item?.url;
    if (url && isSameDomain(url, domain)) {
      return { present: true, rank: i + 1, matchedUrl: url };
    }
  }
  return { present: false, rank: null, matchedUrl: null };
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `cd engine && node --test test/visibility-urlmatch.test.mjs`
Expected: PASS (tutti i test).

- [ ] **Step 5: Verifica anti-tautologia — rompi e guarda cadere**

Cambia temporaneamente `h.endsWith(\`.${d}\`)` in `h.includes(d)` e riesegui: il test
"suffix attack" DEVE fallire. Ripristina. (Un test che non può fallire non è un test.)

- [ ] **Step 6: Commit**

```bash
git add engine/lib/urlmatch.mjs engine/test/visibility-urlmatch.test.mjs
git commit -m "feat(visibility): match host/citazione puro + unit (suffix attack incluso)"
```

---

### Task 3: `perplexity.mjs` — client Sonar

**Files:**
- Create: `engine/lib/perplexity.mjs`

⚠️ **Verifica campo risposta:** la doc dice che le citazioni sono incluse nella risposta.
Il nome del campo (`citations` array di URL vs `search_results` array di `{url,title}`)
va confermato con **una chiamata reale** in fase di implementazione
(`doppler run -- node -e "..."`) o sulla doc <https://docs.perplexity.ai>. L'implementazione
sotto gestisce entrambe le forme, ma va confermata contro il reale, non assunta.

- [ ] **Step 1: Implementa (nessun test unit dedicato: è I/O, coperto dall'integration del Task 6)**

```javascript
// engine/lib/perplexity.mjs
// Client Perplexity Sonar. Le citazioni sono incluse nella risposta (nessun costo extra).
// Zero-dep: fetch nativo. Il match host/citazione vive in urlmatch.mjs.
import { findCitation } from "./urlmatch.mjs";

const DOMAIN = "marcobellingeri.dev";

// Interroga Sonar con `question`. Ritorna { present, rank, matchedUrl, raw }.
export async function checkCitation(question) {
  const { PERPLEXITY_API_KEY } = process.env;
  if (!PERPLEXITY_API_KEY) throw new Error("missing env: PERPLEXITY_API_KEY (usa `doppler run`)");
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: question }] }),
  });
  if (!r.ok) throw new Error(`perplexity ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const citations = j.citations ?? (j.search_results ?? []).map((s) => s?.url).filter(Boolean);
  const hit = findCitation(citations, DOMAIN);
  // raw cappato come i 30k di competitors: una risposta anomala non gonfia la riga.
  return { ...hit, raw: JSON.stringify(j).slice(0, 30_000) };
}
```

- [ ] **Step 2: Sanity check sintassi**

Run: `cd engine && node --check lib/perplexity.mjs`
Expected: nessun output (sintassi ok).

- [ ] **Step 3: Commit**

```bash
git add engine/lib/perplexity.mjs
git commit -m "feat(visibility): client Perplexity Sonar (citazioni incluse)"
```

---

### Task 4: `gsc.mjs` — Google Search Console (OAuth2 read-only)

**Files:**
- Create: `engine/lib/gsc.mjs`

- [ ] **Step 1: Implementa**

```javascript
// engine/lib/gsc.mjs
// Google Search Console Search Analytics, read-only. OAuth2 refresh-token flow, fetch nativo.
// Segreti via Doppler. Nessuna scrittura verso Google: solo lettura dei propri dati.

async function accessToken() {
  const { GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN } = process.env;
  if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
    throw new Error("missing env: GSC_CLIENT_ID / GSC_CLIENT_SECRET / GSC_REFRESH_TOKEN (usa `doppler run`)");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GSC_CLIENT_ID,
      client_secret: GSC_CLIENT_SECRET,
      refresh_token: GSC_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`gsc token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

// Interroga searchAnalytics sulla proprietà GSC_SITE_URL. Ritorna
// [{ query, page, clicks, impressions, ctr, position }].
export async function querySearchAnalytics({ startDate, endDate, rowLimit = 25 }) {
  const { GSC_SITE_URL } = process.env;
  if (!GSC_SITE_URL) throw new Error("missing env: GSC_SITE_URL (usa `doppler run`)");
  const token = await accessToken();
  const url =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, dimensions: ["query", "page"], rowLimit }),
  });
  if (!r.ok) throw new Error(`gsc query ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j.rows ?? []).map((row) => ({
    query: row.keys[0],
    page: row.keys[1],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

// Finestra dati: GSC ha ~2-3 giorni di ritardo. Default: [oggi-30, oggi-3].
export function defaultWindow(now = new Date()) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const end = new Date(now); end.setDate(end.getDate() - 3);
  const start = new Date(now); start.setDate(start.getDate() - 30);
  return { startDate: iso(start), endDate: iso(end) };
}
```

- [ ] **Step 2: Sanity check sintassi**

Run: `cd engine && node --check lib/gsc.mjs`
Expected: nessun output.

- [ ] **Step 3: Commit**

```bash
git add engine/lib/gsc.mjs
git commit -m "feat(visibility): client GSC read-only (OAuth2 refresh flow)"
```

---

### Task 5: `referto.mjs` — ruleset prescrizioni + rendering (TDD)

**Files:**
- Test: `engine/test/visibility-referto.test.mjs`
- Create: `engine/lib/referto.mjs`

- [ ] **Step 1: Scrivi il test che fallisce**

```javascript
// engine/test/visibility-referto.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { prescription } from "../lib/referto.mjs";

test("prescription: citato -> nessuna prescrizione", () => {
  assert.equal(prescription({ engine: "perplexity", present: true, contentRef: "audit-di-se" }), null);
});

test("prescription: non citato + il pezzo esiste -> adatta il pezzo", () => {
  const p = prescription({ engine: "perplexity", present: false, contentRef: "audit-di-se" });
  assert.match(p, /audit-di-se/);
  assert.match(p, /estraibile|H2|FAQPage/i);
});

test("prescription: non citato + nessun pezzo -> candidato nuovo articolo", () => {
  const p = prescription({ engine: "perplexity", present: false, contentRef: null });
  assert.match(p, /nuovo pezzo|Edicola/i);
});

test("prescription: GSC posizione in calo -> controlla title/description", () => {
  const p = prescription({ engine: "gsc", present: true, deltaRank: 4.2, queryText: "cloud security" });
  assert.match(p, /posizione|title|description/i);
});
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `cd engine && node --test test/visibility-referto.test.mjs`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa il minimo**

```javascript
// engine/lib/referto.mjs
// Ruleset statico: dato lo stato di un'osservazione, una riga d'azione (o null).
// Volutamente piccolo: la prescrizione generata da LLM è Fase 2 (sconfina nell'adapter).

export function prescription(o) {
  if (o.engine === "perplexity") {
    if (o.present) return null;
    if (o.contentRef) {
      return `«${o.contentRef}» esiste ma non emerge: rendilo estraibile — un H2 che è la ` +
        `domanda, risposta secca in apertura, schema FAQPage.`;
    }
    return `Nessun contenuto copre questa domanda: candidato per un nuovo pezzo d'Edicola.`;
  }
  if (o.engine === "gsc") {
    // deltaRank positivo = posizione peggiorata (numero più alto = più in basso).
    if (typeof o.deltaRank === "number" && o.deltaRank >= 1) {
      return `Perdi posizione su «${o.queryText}»: controlla title/description e freschezza.`;
    }
    return null;
  }
  return null;
}

// Rende il referto markdown da osservazioni correnti + precedenti (per il trend).
// `perplexity`: [{ queryText, contentRef, present, rank, prevPresent }]
// `gsc`: [{ query, position, prevPosition }]
export function renderReferto({ runAt, perplexity = [], gsc = [] }) {
  const lines = [`# Referto discoverability — ${runAt}`, ""];

  lines.push("## AEO — Perplexity", "");
  for (const p of perplexity) {
    const stato = p.present ? `citato (pos ${p.rank})` : "non citato";
    const trend = p.prevPresent === undefined ? "" :
      p.present && !p.prevPresent ? " 🆕" :
      !p.present && p.prevPresent ? " ⚠️ perso" : "";
    lines.push(`- **${p.queryText}** — ${stato}${trend}`);
    const rx = prescription({ engine: "perplexity", present: p.present, contentRef: p.contentRef });
    if (rx) lines.push(`  - → ${rx}`);
  }

  lines.push("", "## SEO — Google Search Console", "");
  for (const g of gsc) {
    const delta = typeof g.prevPosition === "number" ? g.position - g.prevPosition : null;
    const deltaTxt = delta === null ? "" : ` (Δ ${delta > 0 ? "+" : ""}${delta.toFixed(1)})`;
    lines.push(`- **${g.query}** — pos ${g.position.toFixed(1)}${deltaTxt}`);
    const rx = prescription({ engine: "gsc", present: true, deltaRank: delta ?? 0, queryText: g.query });
    if (rx) lines.push(`  - → ${rx}`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Esegui e verifica che passi**

Run: `cd engine && node --test test/visibility-referto.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/lib/referto.mjs engine/test/visibility-referto.test.mjs
git commit -m "feat(visibility): ruleset prescrizioni + rendering referto + unit"
```

---

### Task 6: `visibility.mjs` — orchestrazione + integration test

**Files:**
- Create: `engine/visibility.mjs`
- Test: `engine/test/visibility.test.mjs`

- [ ] **Step 1: Scrivi l'orchestratore**

```javascript
// engine/visibility.mjs
// Monitor discoverability. Legge le query attive, interroga Perplexity (AEO) e GSC (SEO),
// scrive le osservazioni su Supabase, stampa un referto prescrittivo.
// Run: doppler run -- node engine/visibility.mjs [--limit N]
import { select, insert, pg } from "./lib/supabase.mjs";
import { checkCitation } from "./lib/perplexity.mjs";
import { querySearchAnalytics, defaultWindow } from "./lib/gsc.mjs";
import { renderReferto } from "./lib/referto.mjs";
import { startTrace } from "./lib/langfuse.mjs";
import { logsafe } from "./lib/logsafe.mjs";

// --limit N: interroga solo le prime N query attive (test/ops, controllo costo).
const limIdx = process.argv.indexOf("--limit");
const limit = limIdx > -1 ? Number(process.argv[limIdx + 1]) : null;
if (limIdx > -1 && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit richiede un intero >= 1 (es. --limit 1)");
  process.exit(1);
}

const runAt = new Date().toISOString();
const queries = await select(
  pg`visibility_queries?select=id,text,content_ref&active=eq.true&order=created_at` +
    (limit ? pg`&limit=${limit}` : ""),
);
const conLimite = limit ? ` (--limit ${logsafe(limit)})` : "";
console.log(`visibility: ${logsafe(queries.length)} query attive${conLimite}.`);
const trace = startTrace("visibility-monitor", { metadata: { queries: queries.length } });

// --- AEO: Perplexity, una query alla volta ---
const perplexity = [];
for (const q of queries) {
  try {
    const hit = await trace.span(q.text, { input: { text: q.text } }, async () => checkCitation(q.text));
    await insert("visibility_observations", [{
      run_at: runAt, engine: "perplexity", query_id: q.id,
      present: hit.present, rank: hit.rank,
      detail: { matched_url: hit.matchedUrl }, raw: hit.raw,
    }]);
    perplexity.push({ queryText: q.text, contentRef: q.content_ref, present: hit.present, rank: hit.rank });
    console.log(`visibility: perplexity "${logsafe(q.text)}" — ${hit.present ? "citato" : "non citato"}.`);
  } catch (e) {
    console.error(`visibility: perplexity fallita "${logsafe(q.text)}": ${e.message}`);
    continue; // una query rotta non ferma il monitor
  }
}

// --- SEO: GSC, una chiamata per l'intera proprietà ---
let gsc = [];
try {
  const rows = await querySearchAnalytics(defaultWindow());
  gsc = rows.map((r) => ({ query: r.query, position: r.position }));
  const obs = rows.map((r) => ({
    run_at: runAt, engine: "gsc", query_id: null, present: true, rank: r.position,
    detail: { query: r.query, page: r.page, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr },
    raw: null,
  }));
  if (obs.length) await insert("visibility_observations", obs);
  console.log(`visibility: gsc — ${logsafe(rows.length)} righe.`);
} catch (e) {
  console.error(`visibility: gsc fallita: ${e.message}`); // il segnale SEO manca, l'AEO resta
}

console.log("\n" + renderReferto({ runAt, perplexity, gsc }));
console.log("\nvisibility: fatto.");
await trace.flush();
```

- [ ] **Step 2: Scrivi l'integration test (spawn con fetch moccato)**

Segue lo stile di `test/competitors.test.mjs`: `runEngine([script, ...args], routes, env)`.
Le route matchano per sottostringa; `type: "voyage"` non serve qui.

```javascript
// engine/test/visibility.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

test("visibility: perplexity (citato + non citato) e gsc, con --limit", () => {
  const routes = [
    { match: "visibility_queries", body: [
      { id: "Q1", text: "self audit discipline", content_ref: "audit-di-se" },
      { id: "Q2", text: "chi è marco", content_ref: null },
    ] },
    // Q1: citato. Q2: non citato. (times sequenzia le due risposte Perplexity.)
    { match: "perplexity.ai", method: "POST", times: 1, body: {
      citations: ["https://x.com", "https://www.marcobellingeri.dev/en/writing/audit-di-se"],
    } },
    { match: "perplexity.ai", method: "POST", times: 1, body: { citations: ["https://y.com"] } },
    { match: "visibility_observations", method: "POST" },
    // GSC: token poi query.
    { match: "oauth2.googleapis.com", method: "POST", body: { access_token: "T" } },
    { match: "searchAnalytics", method: "POST", body: { rows: [
      { keys: ["cloud security engineer", "https://marcobellingeri.dev/en"], clicks: 2, impressions: 40, ctr: 0.05, position: 8.3 },
    ] } },
  ];
  const r = runEngine(["engine/visibility.mjs", "--limit", "2"], routes, {
    PERPLEXITY_API_KEY: "k", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /2 query attive \(--limit 2\)/);
  assert.match(r.stdout, /perplexity "self audit discipline" — citato/);
  assert.match(r.stdout, /perplexity "chi è marco" — non citato/);
  assert.match(r.stdout, /gsc — 1 righe/);
  assert.match(r.stdout, /audit-di-se.*estraibile|estraibile/s); // prescrizione per Q1? no: Q1 è citato
  assert.match(r.stdout, /candidato per un nuovo pezzo/); // Q2 non citato, senza content_ref
  assert.match(r.stdout, /visibility: fatto/);
});

test("visibility: gsc fallita non ferma l'AEO", () => {
  const routes = [
    { match: "visibility_queries", body: [{ id: "Q1", text: "x", content_ref: null }] },
    { match: "perplexity.ai", method: "POST", body: { citations: [] } },
    { match: "visibility_observations", method: "POST" },
    { match: "oauth2.googleapis.com", method: "POST", status: 400, body: "bad" },
  ];
  const r = runEngine(["engine/visibility.mjs"], routes, {
    PERPLEXITY_API_KEY: "k", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0);
  assert.match(r.stderr, /gsc fallita/);
  assert.match(r.stdout, /visibility: fatto/);
});
```

Nota su un'asserzione: la riga `audit-di-se.*estraibile` è ridondante (Q1 è citato →
nessuna prescrizione). Rimuovila in fase di scrittura; è lasciata qui come promemoria che
Q1 NON deve produrre prescrizione. Verifica invece l'assenza:
```javascript
  assert.doesNotMatch(r.stdout, /audit-di-se» esiste ma non emerge/);
```

- [ ] **Step 3: Esegui e verifica che fallisca (poi passi)**

Run: `cd engine && node --test test/visibility.test.mjs`
Expected: prima FAIL (`visibility.mjs` non trovato) → dopo lo Step 1 già scritto, PASS.
Se rosso, leggi lo stderr catturato in `r.stderr` (l'assert lo stampa).

- [ ] **Step 4: Esegui l'intera suite engine (nessuna regressione)**

Run: `cd engine && npm test`
Expected: PASS su tutti i file, inclusi i tre nuovi.

- [ ] **Step 5: Commit**

```bash
git add engine/visibility.mjs engine/test/visibility.test.mjs
git commit -m "feat(visibility): orchestratore monitor + integration test (fetch moccato)"
```

---

### Task 7: Workflow schedulato settimanale

**Files:**
- Create: `.github/workflows/visibility.yml`

Allinea l'autenticazione Doppler al workflow keepalive esistente (stessa `DOPPLER_TOKEN`
secret e stessa action `dopplerhq/cli-action`). Controlla `.github/workflows/` per il
nome esatto del secret prima di scrivere.

- [ ] **Step 1: Scrivi il workflow**

```yaml
# .github/workflows/visibility.yml
name: Visibility Monitor
on:
  schedule:
    - cron: "0 6 * * 1"   # lunedì 06:00 UTC, settimanale
  workflow_dispatch: {}    # run manuale on-demand

permissions:
  contents: read

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - uses: dopplerhq/cli-action@v3
      - name: Run visibility monitor
        working-directory: engine
        run: doppler run --token "$DOPPLER_TOKEN" -- node visibility.mjs
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

- [ ] **Step 2: Lint YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/visibility.yml'))"`
Expected: nessun output (YAML valido).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/visibility.yml
git commit -m "ci(visibility): run schedulato settimanale + dispatch manuale"
```

---

### Task 8: Docs — `engine/README.md` (contratto pipeline/test)

**Files:**
- Modify: `engine/README.md`

- [ ] **Step 1: Aggiungi la sezione del modulo**

Nella sezione "Moduli" del README engine, aggiungi la voce `visibility` accanto a
`ingest`/`generate`/`embed`/`export`/`competitors`, e in "Comandi" la riga:
```
doppler run -- node engine/visibility.mjs [--limit N]   # monitor discoverability (SEO+AEO)
```
Nella sezione test, dichiara il contratto: unit sul match host (`urlmatch`), unit sul
ruleset prescrizioni (`referto`), integration spawn con `fetch` moccato (`visibility`);
il run reale è schedulato, non in CI; segreti Perplexity/GSC su Doppler, GSC read-only.

- [ ] **Step 2: Commit**

```bash
git add engine/README.md
git commit -m "docs(visibility): contratto pipeline/test nel README engine"
```

---

## Chiusura (dopo tutti i task)

- Aggiornare il grafo graphify (`graphify` dal repo) dopo il merge.
- Aggiornare Atlas (`projects/marcobellingeri-dev.md`: il modulo esiste; log) e Notion (task "Agente SEO/AEO/GEO" → in corso/fatto).
- Il seed reale di `visibility_queries` (le domande target IT/EN naz/internaz) si progetta con **prompt-master** e lo inserisce Marco: è contenuto strategico, non codice.

---

## Self-Review (eseguita)

**Copertura spec:** migration (Task 1) ✓ · urlmatch/match-host (Task 2) ✓ · Perplexity
(Task 3) ✓ · GSC (Task 4) ✓ · referto prescrittivo (Task 5) ✓ · orchestrazione + osservazioni
(Task 6) ✓ · schedule settimanale (Task 7) ✓ · README pipeline/test (Task 8) ✓ · sicurezza
OWASP-LLM (urlmatch commento + host-only) ✓ · Doppler/GSC read-only (Task 4,7) ✓.
Fuori scope come da spec: competitor, altri engine, adapter, vetrina pubblica.

**Placeholder scan:** i due punti "nota" nei test (Task 2 riga ambigua, Task 6 asserzione
ridondante) sono correzioni esplicite con l'istruzione precisa, non TODO aperti.

**Coerenza tipi:** `findCitation` → `{present, rank, matchedUrl}` usato identico in
`perplexity.mjs` e propagato in `visibility.mjs`. `checkCitation` → `{present, rank, matchedUrl, raw}`.
`querySearchAnalytics` → `[{query,page,clicks,impressions,ctr,position}]` consumato in `visibility.mjs`.
`prescription(o)` e `renderReferto({runAt,perplexity,gsc})` coerenti tra Task 5 e Task 6.
