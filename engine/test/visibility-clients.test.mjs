// Unit dei client I/O (perplexity, gsc): rami env-mancante, risposta non-ok,
// fallback del campo citazioni. Stub di fetch globale, zero rete.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { checkCitation } from "../lib/perplexity.mjs";
import { querySearchAnalytics, queryTotals, defaultWindow } from "../lib/gsc.mjs";

const realFetch = globalThis.fetch;

// Coda di risposte: ogni fetch consuma la prossima.
function stubFetch(responses) {
  const queue = [...responses];
  globalThis.fetch = async () => {
    if (!queue.length) throw new Error("stub fetch: coda vuota");
    return queue.shift();
  };
}
function res(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ---- perplexity --------------------------------------------------------

test("perplexity: senza PERPLEXITY_API_KEY -> throw prima di ogni fetch", async () => {
  const prev = process.env.PERPLEXITY_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  try {
    await assert.rejects(() => checkCitation("q"), /missing env: PERPLEXITY_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.PERPLEXITY_API_KEY = prev;
  }
});

test("perplexity: fallback su search_results quando manca citations", async () => {
  process.env.PERPLEXITY_API_KEY = "k";
  stubFetch([res({ search_results: [{ url: "https://marcobellingeri.dev/en/x" }] })]);
  const hit = await checkCitation("q");
  assert.equal(hit.present, true);
  assert.equal(hit.rank, 1);
  assert.equal(hit.matchedUrl, "https://marcobellingeri.dev/en/x");
});

test("perplexity: citations vuoto -> fallback su search_results", async () => {
  process.env.PERPLEXITY_API_KEY = "k";
  stubFetch([res({ citations: [], search_results: [{ url: "https://marcobellingeri.dev/en/x" }] })]);
  const hit = await checkCitation("q");
  assert.equal(hit.present, true);
  assert.equal(hit.matchedUrl, "https://marcobellingeri.dev/en/x");
});

test("perplexity: risposta non-ok -> throw con status e corpo", async () => {
  process.env.PERPLEXITY_API_KEY = "k";
  stubFetch([res("boom", { ok: false, status: 500 })]);
  await assert.rejects(() => checkCitation("q"), /perplexity 500: boom/);
});

// ---- gsc ---------------------------------------------------------------

test("gsc: senza credenziali OAuth -> throw", async () => {
  const prev = { ...process.env };
  delete process.env.GSC_CLIENT_ID;
  delete process.env.GSC_CLIENT_SECRET;
  delete process.env.GSC_REFRESH_TOKEN;
  process.env.GSC_SITE_URL = "sc-domain:x";
  try {
    await assert.rejects(() => querySearchAnalytics({ startDate: "2026-01-01", endDate: "2026-01-02" }),
      /missing env: GSC_CLIENT_ID/);
  } finally {
    process.env = prev;
  }
});

test("gsc: token poi query -> righe mappate", async () => {
  Object.assign(process.env, {
    GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s", GSC_REFRESH_TOKEN: "t",
    GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  stubFetch([
    res({ access_token: "T" }),
    res({ rows: [{ keys: ["cloud security", "https://marcobellingeri.dev/en"], clicks: 1, impressions: 20, ctr: 0.05, position: 7.2 }] }),
  ]);
  const rows = await querySearchAnalytics({ startDate: "2026-06-18", endDate: "2026-07-15" });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    query: "cloud security", page: "https://marcobellingeri.dev/en",
    clicks: 1, impressions: 20, ctr: 0.05, position: 7.2,
  });
});

test("gsc: token non-ok -> throw", async () => {
  Object.assign(process.env, {
    GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s", GSC_REFRESH_TOKEN: "t",
    GSC_SITE_URL: "sc-domain:x",
  });
  stubFetch([res("bad", { ok: false, status: 400 })]);
  await assert.rejects(() => querySearchAnalytics({ startDate: "a", endDate: "b" }), /gsc token 400/);
});

test("gsc: query non-ok -> throw", async () => {
  Object.assign(process.env, {
    GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s", GSC_REFRESH_TOKEN: "t",
    GSC_SITE_URL: "sc-domain:x",
  });
  stubFetch([res({ access_token: "T" }), res("nope", { ok: false, status: 403 })]);
  await assert.rejects(() => querySearchAnalytics({ startDate: "a", endDate: "b" }), /gsc query 403/);
});

test("gsc: defaultWindow -> end 3gg indietro, start 30gg indietro", () => {
  const w = defaultWindow(new Date("2026-07-18T00:00:00Z"));
  assert.equal(w.endDate, "2026-07-15");
  assert.equal(w.startDate, "2026-06-18");
});

// La gamba SEO chiedeva solo la vista per query. Con poco traffico GSC la omette
// (anonimizzazione) e tornavano zero righe: il monitor sembrava morto mentre i
// dati di proprieta' e per pagina erano li', disponibili.
test("gsc: le dimensioni si possono scegliere (pagina, non query+pagina)", async () => {
  Object.assign(process.env, {
    GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s", GSC_REFRESH_TOKEN: "t",
    GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    // la prima chiamata e' il token: body form-urlencoded, non JSON.
    calls.push(typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null);
    return calls.length === 1
      ? new Response(JSON.stringify({ access_token: "T" }), { status: 200 })
      : new Response(JSON.stringify({ rows: [{ keys: ["https://marcobellingeri.dev/cv-it.pdf"], clicks: 0, impressions: 6, ctr: 0, position: 7.2 }] }), { status: 200 });
  };
  try {
    const rows = await querySearchAnalytics({ startDate: "a", endDate: "b", dimensions: ["page"] });
    assert.deepEqual(calls[1].dimensions, ["page"], "le dimensioni richieste devono arrivare a Google");
    assert.equal(rows[0].page, "https://marcobellingeri.dev/cv-it.pdf");
    assert.equal(rows[0].query, undefined, "senza la dimensione query non si inventa una query");
  } finally { globalThis.fetch = realFetch; }
});

test("gsc: i totali di proprieta' arrivano anche quando le query non ci sono", async () => {
  Object.assign(process.env, {
    GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s", GSC_REFRESH_TOKEN: "t",
    GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  stubFetch([
    res({ access_token: "T" }),
    res({ rows: [{ clicks: 0, impressions: 30, ctr: 0, position: 8.1 }] }),
  ]);
  const t = await queryTotals({ startDate: "a", endDate: "b" });
  assert.deepEqual(t, { clicks: 0, impressions: 30, ctr: 0, position: 8.1 });
});

test("gsc: proprieta' senza nessuna impression -> null, non uno zero inventato", async () => {
  Object.assign(process.env, {
    GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s", GSC_REFRESH_TOKEN: "t",
    GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  stubFetch([res({ access_token: "T" }), res({ rows: [] })]);
  assert.equal(await queryTotals({ startDate: "a", endDate: "b" }), null);
});
