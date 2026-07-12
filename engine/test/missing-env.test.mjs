// Senza env i client devono fallire PRIMA di toccare la rete, e Langfuse deve
// spegnersi (fail-open no-op). File separato: l'env si legge a module-load, quindi
// serve un processo che NON lo imposta (gli import sono dinamici, dopo il delete).
import { test } from "node:test";
import { strict as assert } from "node:assert";

for (const k of [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EMBEDDING_API_KEY", "VALYU_API_KEY",
  "LANGFUSE_BASE_URL", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY",
]) delete process.env[k];

// Se una lib provasse comunque la rete, il test deve esplodere qui.
globalThis.fetch = () => { throw new Error("la rete non va toccata senza env"); };

const { select } = await import("../lib/supabase.mjs");
const { embed } = await import("../lib/voyage.mjs");
const { search } = await import("../lib/valyu.mjs");
const { startTrace } = await import("../lib/langfuse.mjs");
// NB: anthropic è escluso di proposito — key() lancia DENTRO il try del retry
// loop, quindi il "missing env" costerebbe ~17s di backoff prima di emergere.

test("supabase: senza env -> throw esplicito, nessuna fetch", async () => {
  await assert.rejects(() => select("issues?select=id"), /missing env: SUPABASE_URL/);
});

test("voyage: senza env -> throw esplicito, nessuna fetch", async () => {
  await assert.rejects(() => embed(["x"]), /missing env: EMBEDDING_API_KEY/);
});

test("valyu: senza env -> throw esplicito, nessuna fetch", async () => {
  await assert.rejects(() => search("q"), /missing env: VALYU_API_KEY/);
});

test("langfuse: senza chiavi il tracing è spento e flush è un no-op", async () => {
  const trace = startTrace("no-env");
  assert.equal(trace.enabled, false);
  assert.equal(await trace.span("s", {}, async () => 7), 7, "gli span eseguono comunque fn");
  await trace.flush(); // ritorna subito, niente fetch
});
