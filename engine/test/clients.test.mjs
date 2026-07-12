// Copertura dei rami restanti dei client (fetch mockato, zero rete, zero costi):
// supabase update/remove, retry anthropic (rete + 5xx con Retry-After), catch di
// langfuse.flush, opzioni valyu, edge di voyage. Stessi pattern di integration.test.mjs.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

// Env fittizio PRIMA degli import (le lib leggono process.env a module-load).
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sk_fake";
process.env.EMBEDDING_API_KEY = "vk_fake";
process.env.VALYU_API_KEY = "valyu_fake";
process.env.LANGFUSE_BASE_URL = "https://fake.langfuse.local";
process.env.LANGFUSE_PUBLIC_KEY = "pk_fake";
process.env.LANGFUSE_SECRET_KEY = "sk_lf_fake";
process.env.ANTHROPIC_API_KEY = "sk-ant_fake";

const { update, remove } = await import("../lib/supabase.mjs");
const { countTokens, generateJson } = await import("../lib/anthropic.mjs");
const { startTrace } = await import("../lib/langfuse.mjs");
const { search } = await import("../lib/valyu.mjs");
const { embed } = await import("../lib/voyage.mjs");

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

// ---- supabase: update / remove ---------------------------------------------

test("supabase: update -> PATCH col filtro e Prefer minimal; remove -> DELETE", async () => {
  const calls = mockFetch(() => []);
  await update("issues", "id=eq.I1", { status: "published" });
  await remove("article_chunks", "article_id=eq.A1");
  assert.equal(calls[0].init.method, "PATCH");
  assert.ok(calls[0].url.endsWith("/rest/v1/issues?id=eq.I1"));
  assert.equal(calls[0].init.headers.Prefer, "return=minimal");
  assert.equal(JSON.parse(calls[0].init.body).status, "published");
  assert.equal(calls[1].init.method, "DELETE");
  assert.ok(calls[1].url.endsWith("/rest/v1/article_chunks?article_id=eq.A1"));
});

// ---- anthropic: retry ---------------------------------------------------------

test("anthropic: errore di rete -> ritenta e poi passa", async () => {
  let n = 0;
  globalThis.fetch = async () => {
    n += 1;
    if (n === 1) throw new TypeError("fetch failed"); // rete giù al primo colpo
    return new Response(JSON.stringify({ input_tokens: 3 }), { status: 200 });
  };
  const t = await countTokens({ model: "m", system: [], messages: [] });
  assert.equal(t, 3);
  assert.equal(n, 2, "un solo retry");
});

test("anthropic: 5xx persistente -> retry con Retry-After, poi tentativi esauriti", async () => {
  // Retry-After minuscolo per non dormire davvero: copre il ramo ra > 0.
  const calls = mockFetch(() => new Response("down", { status: 500, headers: { "retry-after": "0.001" } }));
  await assert.rejects(() => countTokens({ model: "m", system: [], messages: [] }), /anthropic .* 500/);
  assert.equal(calls.length, 5, "maxRetries=4 -> 5 tentativi totali");
});

test("anthropic: risposta senza blocco testo -> throw; senza usage -> usage vuota", async () => {
  mockFetch(() => ({ stop_reason: "end_turn", content: [{ type: "tool_use" }] }));
  await assert.rejects(
    () => generateJson({ model: "m", system: [], messages: [], schema: {}, maxTokens: 10 }),
    /nessun blocco testo/,
  );
  mockFetch(() => ({ stop_reason: "end_turn" })); // content del tutto assente
  await assert.rejects(
    () => generateJson({ model: "m", system: [], messages: [], schema: {}, maxTokens: 10 }),
    /nessun blocco testo/,
  );
  mockFetch(() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "{}" }] })); // niente usage
  const { usage } = await generateJson({ model: "m", system: [], messages: [], schema: {}, maxTokens: 10 });
  assert.deepEqual(usage, {});
});

// ---- langfuse: fail-open sul catch di rete ------------------------------------

test("langfuse: fetch che esplode in flush NON rompe la pipeline", async () => {
  globalThis.fetch = async () => { throw new Error("rete giù"); };
  const trace = startTrace("test-catch");
  await trace.span("ok", {}, async () => 1);
  await trace.flush(); // non deve lanciare: warn e avanti
});

test("langfuse: fn che lancia un non-Error (stringa o null) -> span ERROR senza crash del tracer", async () => {
  mockFetch(() => ({}));
  const trace = startTrace("non-error");
  let caught = "nulla";
  try { await trace.span("stringa", {}, async () => { throw "kaputt-stringa"; }); } catch (e) { caught = e; }
  assert.equal(caught, "kaputt-stringa", "il valore lanciato è ripropagato tale e quale");
  try { await trace.span("nullo", {}, async () => { throw null; }); } catch (e) { caught = e; }
  assert.equal(caught, null);
  await trace.flush();
});

// ---- valyu: tutte le opzioni + results assente ---------------------------------

test("valyu: opzioni complete nel body; senza results -> lista vuota", async () => {
  const calls = mockFetch(() => ({ success: true })); // niente campo results
  const res = await search("q", {
    searchType: "web", maxResults: 3, relevanceThreshold: 0.7,
    includedSources: ["a.gov"], excludedSources: ["b.com"],
    startDate: "2026-01-01", endDate: "2026-06-30",
  });
  assert.deepEqual(res, []);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.search_type, "web");
  assert.equal(body.max_num_results, 3);
  assert.deepEqual(body.excluded_sources, ["b.com"]);
  assert.equal(body.start_date, "2026-01-01");
  assert.equal(body.end_date, "2026-06-30");
});

test("valyu: HTTP non-ok -> throw con status", async () => {
  mockFetch(() => new Response("nope", { status: 402 }));
  await assert.rejects(() => search("q"), /valyu search 402/);
});

// ---- voyage: edge -------------------------------------------------------------

test("voyage: lista vuota -> nessuna chiamata; HTTP non-ok e count sbagliato -> throw", async () => {
  const calls = mockFetch(() => ({ data: [] }));
  assert.deepEqual(await embed([]), [], "batch vuoto non tocca la rete");
  assert.equal(calls.length, 0);

  mockFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(() => embed(["x"]), /voyage 500/);

  mockFetch(() => ({ data: [] })); // 0 vettori per 1 testo
  await assert.rejects(() => embed(["x"]), /0 vettori per 1 testi/);
});

// ---- voyage: self-check CLI (spawn: copre il blocco guardia) --------------------

test("voyage: self-check da CLI passa", () => {
  const r = runEngine(["engine/lib/voyage.mjs"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /voyage\.mjs self-check OK/);
});
