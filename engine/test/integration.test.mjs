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
process.env.LANGFUSE_BASE_URL = "https://fake.langfuse.local";
process.env.LANGFUSE_PUBLIC_KEY = "pk_fake";
process.env.LANGFUSE_SECRET_KEY = "sk_lf_fake";
process.env.ANTHROPIC_API_KEY = "sk-ant_fake";

const { buildAllowlist, buildQuery, mapResults, dedupFresh, DEFAULT_ANGLE } = await import("../ingest.mjs");
const { embed } = await import("../lib/voyage.mjs");
const { select, insert, rpc } = await import("../lib/supabase.mjs");
const { search } = await import("../lib/valyu.mjs");
const { startTrace } = await import("../lib/langfuse.mjs");
const { generateJson, countTokens } = await import("../lib/anthropic.mjs");

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

test("filtri anti-rumore: stesso doc via URL diversi dedupato, titolo-spazzatura -> slug, url malformato scartato, score persistito", () => {
  const rows = mapResults([
    { url: "https://naic.org/files/a.pdf", title: "Model Bulletin", relevance_score: 0.82 },
    { url: "https://naic.org/files/b.pdf", title: "Model  Bulletin " }, // stesso titolo+dominio (spazi diversi) -> dedup
    { url: "https://naic.org/files/ai-testimony.pdf", title: "1" },      // metadata rotto -> slug
    { url: "not-a-url", title: "garbage url" },                          // malformato -> scartato
    { url: "https://other.org/files/a.pdf", title: "Model Bulletin" },   // stesso titolo ma ALTRO dominio -> resta
  ], "insurance");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].relevance, 0.82, "score Valyu persistito");
  assert.equal(rows[1].relevance, null, "senza score -> null");
  assert.equal(rows[1].source_name, "ai-testimony.pdf", "titolo-spazzatura sostituito dallo slug");
  assert.equal(rows[2].source_url, "https://other.org/files/a.pdf", "dominio diverso non e' un duplicato");
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

// ---- langfuse tracing (OTLP) --------------------------------------------------

test("langfuse: OTLP shape corretta — root+span, stessa traceId, auth Basic, attributi trace", async () => {
  const calls = mockFetch(() => ({}));
  const trace = startTrace("test-run", { tags: ["t1"], metadata: { vertical: "insurance" } });
  await trace.span("step-a", { input: { q: 1 }, summarize: (r) => ({ n: r }) }, async () => 42);
  await trace.flush();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/api/public/otel/v1/traces"));
  assert.match(calls[0].init.headers.Authorization, /^Basic /);
  const spans = JSON.parse(calls[0].init.body).resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans.length, 2, "root + 1 span");
  const [root, child] = spans;
  assert.match(root.traceId, /^[0-9a-f]{32}$/);
  assert.equal(child.traceId, root.traceId, "stessa trace");
  assert.equal(child.parentSpanId, root.spanId, "span annidato sotto la root");
  assert.ok(root.attributes.some((a) => a.key === "langfuse.trace.name" && a.value.stringValue === "test-run"));
  assert.ok(root.attributes.some((a) => a.key === "langfuse.trace.metadata.vertical"));
  assert.ok(child.attributes.some((a) => a.key === "langfuse.observation.output" && a.value.stringValue === '{"n":42}'));
});

test("langfuse: errore di fn -> span ERROR, errore RIPROPAGATO, root status error", async () => {
  const calls = mockFetch(() => ({}));
  const trace = startTrace("test-err");
  await assert.rejects(() => trace.span("boom", {}, async () => { throw new Error("kaputt"); }), /kaputt/);
  await trace.flush();
  const spans = JSON.parse(calls[0].init.body).resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans[1].status.code, 2, "span in errore");
  assert.ok(spans[1].attributes.some((a) => a.key === "langfuse.observation.level" && a.value.stringValue === "ERROR"));
  assert.equal(spans[0].status.code, 2, "root riflette l'errore");
});

test("langfuse: fail-open — invio 500 NON rompe la pipeline", async () => {
  globalThis.fetch = async () => new Response("boom", { status: 500 });
  const trace = startTrace("test-failopen");
  await trace.span("ok", {}, async () => 1);
  await trace.flush(); // non deve lanciare
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

// ---- anthropic client -------------------------------------------------------

const OKJSON = JSON.stringify({ it: { title: "t" }, en: { title: "t" } });

test("anthropic: generateJson happy -> data parsato + usage; header/version/thinking corretti", async () => {
  const calls = mockFetch(() => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: OKJSON }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }));
  const { data, usage } = await generateJson({ model: "claude-sonnet-5", system: [], messages: [], schema: {}, maxTokens: 100 });
  assert.deepEqual(data, { it: { title: "t" }, en: { title: "t" } });
  assert.equal(usage.output_tokens, 20);
  assert.equal(calls[0].init.headers["x-api-key"], "sk-ant_fake");
  assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.thinking.type, "disabled", "thinking off: budget deterministico");
  assert.equal(body.output_config.format.type, "json_schema");
});

test("anthropic: refusal -> throw (mai output al posto di un rifiuto)", async () => {
  mockFetch(() => ({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }));
  await assert.rejects(() => generateJson({ model: "m", system: [], messages: [], schema: {}, maxTokens: 100 }), /rifiuto/);
});

test("anthropic: max_tokens -> throw (output troncato non passa)", async () => {
  mockFetch(() => ({ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] }));
  await assert.rejects(() => generateJson({ model: "m", system: [], messages: [], schema: {}, maxTokens: 100 }), /troncato/);
});

test("anthropic: JSON non parseabile -> throw (niente malformato in silenzio)", async () => {
  mockFetch(() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "non-json {" }] }));
  await assert.rejects(() => generateJson({ model: "m", system: [], messages: [], schema: {}, maxTokens: 100 }), /non parseabile/);
});

test("anthropic: 400 non ritentabile -> throw immediato (una sola chiamata)", async () => {
  const calls = mockFetch(() => new Response("bad", { status: 400 }));
  await assert.rejects(() => countTokens({ model: "m", system: [], messages: [] }), /400/);
  assert.equal(calls.length, 1, "nessun retry sui 4xx");
});

test("anthropic: 429 ritentato -> poi 200 (rate-limit gestito)", async () => {
  const calls = mockFetch((n) =>
    n === 1 ? new Response("slow", { status: 429, headers: { "retry-after": "0" } }) : { input_tokens: 7 },
  );
  const t = await countTokens({ model: "m", system: [], messages: [] });
  assert.equal(t, 7);
  assert.equal(calls.length, 2, "ha ritentato una volta");
});
