// Integration test della LOGICA (fetch mockato, zero rete, zero costi).
// Copre la parte delicata: ingest (allowlist/query/mapping/dedup) + client
// (batching Voyage, request shape Supabase/Valyu, error paths).
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";

// Env fittizio PRIMA degli import (le lib leggono process.env a module-load).
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sk_fake";
process.env.EMBEDDING_API_KEY = "vk_fake";
process.env.VALYU_API_KEY = "valyu_fake";

const { buildAllowlist, buildQuery, mapResults, dedupFresh, DEFAULT_ANGLE } = await import("../ingest.mjs");
const { embed } = await import("../lib/voyage.mjs");
const { select, insert, rpc } = await import("../lib/supabase.mjs");
const { search } = await import("../lib/valyu.mjs");

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// helper: mock fetch che registra le chiamate e risponde con json fisso
function mockFetch(responder) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const body = responder(calls.length, url, init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return calls;
}

// ---- ingest: allowlist ----------------------------------------------------

const REG = { _doc: "x", core: ["a.com", "b.gov"], insurance: ["naic.org"] };

test("allowlist: core + verticale", () => {
  assert.deepEqual(buildAllowlist(REG, "insurance"), ["a.com", "b.gov", "naic.org"]);
});

test("allowlist: verticale ignoto -> solo core", () => {
  assert.deepEqual(buildAllowlist(REG, "legal"), ["a.com", "b.gov"]);
});

test("allowlist: chiavi maligne/riservate non inquinano", () => {
  assert.deepEqual(buildAllowlist(REG, "__proto__"), ["a.com", "b.gov"]);
  assert.deepEqual(buildAllowlist(REG, "core"), ["a.com", "b.gov"]);
  assert.deepEqual(buildAllowlist(REG, "_doc"), ["a.com", "b.gov"]);
});

// ---- ingest: query e mapping ----------------------------------------------

test("query: contiene verticale e angolo (default e custom)", () => {
  assert.ok(buildQuery("insurance").includes("insurance:"));
  assert.ok(buildQuery("insurance").includes(DEFAULT_ANGLE));
  assert.ok(buildQuery("legal", "survey findings").includes("survey findings"));
});

test("mapping: invarianti editoriali della discovery", () => {
  const rows = mapResults([
    { url: "https://naic.org/x", title: "T".repeat(300), content: "C".repeat(3000) },
    { title: "senza url, scartato" },
    { url: "https://eiopa.europa.eu/y", source: "eiopa" },
  ], "insurance");
  assert.equal(rows.length, 2, "risultati senza url scartati");
  for (const r of rows) {
    assert.equal(r.stage, "discovery", "entra SOLO come discovery");
    assert.equal(r.tier, null, "tier mai auto-assegnato");
    assert.equal(r.independent, null, "independent mai auto-assegnato");
    assert.equal(r.category, "insurance");
  }
  assert.equal(rows[0].source_name.length, 200, "titolo troncato a 200");
  assert.equal(rows[0].raw_content.length, 2000, "raw_content troncato a 2000");
  assert.equal(rows[1].source_name, "eiopa", "fallback su source");
});

test("dedup: url gia' sul numero scartati, issue_id agganciato ai nuovi", () => {
  const mapped = [{ source_url: "u1" }, { source_url: "u2" }];
  const fresh = dedupFresh(mapped, ["u1"], "ISSUE1");
  assert.deepEqual(fresh, [{ source_url: "u2", issue_id: "ISSUE1" }]);
});

// ---- voyage: batching -------------------------------------------------------

test("embed: 250 testi -> 3 request da <=100, ordine preservato, dim verificata", async () => {
  let counter = 0;
  const calls = mockFetch((_, __, init) => {
    const inputs = JSON.parse(init.body).input;
    assert.ok(inputs.length <= 100);
    return { data: inputs.map(() => ({ embedding: Array(1024).fill(++counter) })) };
  });
  const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
  const vecs = await embed(texts);
  assert.equal(calls.length, 3, "3 batch");
  assert.equal(vecs.length, 250, "un vettore per testo");
  assert.equal(JSON.parse(calls[0].init.body).input_type, "document");
});

test("embed: dimensione sbagliata -> throw (mai vettori corrotti nel DB)", async () => {
  mockFetch(() => ({ data: [{ embedding: [1, 2, 3] }] }));
  await assert.rejects(() => embed(["x"]), /dim 3/);
});

// ---- supabase client --------------------------------------------------------

test("supabase: header service_role e Prefer corretti; error -> throw con status", async () => {
  const calls = mockFetch(() => []);
  await select("issues?select=id");
  await insert("signals", [{ a: 1 }]);
  await rpc("match_article_chunks", { q: 1 });
  assert.equal(calls[0].init.headers.apikey, "sk_fake");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_fake");
  assert.equal(calls[1].init.headers.Prefer, "return=minimal");
  assert.ok(calls[2].url.endsWith("/rest/v1/rpc/match_article_chunks"));

  globalThis.fetch = async () => new Response("permission denied", { status: 403 });
  await assert.rejects(() => select("signals?select=id"), /403/);
});

// ---- valyu client -----------------------------------------------------------

test("valyu: body con query+allowlist; non-success -> throw", async () => {
  const calls = mockFetch(() => ({ success: true, results: [{ url: "https://x.gov" }] }));
  const res = await search("q", { includedSources: ["naic.org"] });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.query, "q");
  assert.deepEqual(body.included_sources, ["naic.org"]);
  assert.equal(calls[0].init.headers["x-api-key"], "valyu_fake");
  assert.equal(res.length, 1);

  mockFetch(() => ({ success: false }));
  await assert.rejects(() => search("q"), /non-success/);
});
