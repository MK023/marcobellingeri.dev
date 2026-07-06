// Unit test — pure functions + guardie CLI. Zero deps: node:test built-in.
// Run: node --test engine/test/
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chunk, toVector, DIM } from "../lib/voyage.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;

// ---- chunk() -----------------------------------------------------------

test("chunk: paragrafi piccoli restano accorpati", () => {
  assert.deepEqual(chunk("uno\n\ndue", 1000), ["uno\n\ndue"]);
});

test("chunk: oltre il max si spezza sul confine di paragrafo", () => {
  const paras = ["a".repeat(600), "b".repeat(600), "c".repeat(600)];
  const out = chunk(paras.join("\n\n"), 1000);
  assert.equal(out.length, 3);
  assert.ok(out.every((c) => c.length <= 1000));
});

test("chunk: un paragrafo singolo oltre il max resta intero (mai spezzato a metà)", () => {
  const big = "x".repeat(1500);
  assert.deepEqual(chunk(big, 1000), [big]);
});

test("chunk: input vuoto/solo-whitespace -> nessun chunk", () => {
  assert.deepEqual(chunk("", 1000), []);
  assert.deepEqual(chunk("\n\n  \n\n", 1000), []);
});

test("chunk: nessun contenuto perso ne' duplicato (round-trip)", () => {
  const paras = Array.from({ length: 10 }, (_, i) => `par ${i} ${"y".repeat((i + 1) * 80)}`);
  const out = chunk(paras.join("\n\n"), 500);
  assert.equal(out.join("\n\n"), paras.join("\n\n"));
});

// ---- toVector() / DIM ----------------------------------------------------

test("toVector: formato pgvector", () => {
  assert.equal(toVector([1, 2.5, -3]), "[1,2.5,-3]");
});

test("DIM coerente con lo schema vector(1024)", () => {
  assert.equal(DIM, 1024);
});

// ---- primary-sources.json ------------------------------------------------

test("registro fonti: shape valida, domini plausibili, niente vendor noti", () => {
  const reg = JSON.parse(readFileSync(`${ROOT}/engine/primary-sources.json`, "utf8"));
  assert.ok(Array.isArray(reg.core) && reg.core.length > 0, "core presente");
  for (const [key, list] of Object.entries(reg)) {
    if (key === "_doc") continue;
    assert.ok(Array.isArray(list), `${key} è una lista`);
    for (const d of list) {
      assert.match(d, /^[a-z0-9.-]+\.[a-z]{2,}$/, `dominio plausibile: ${d}`);
      assert.ok(!/furtherai|waterstreet|livecompliance/.test(d), `vendor escluso: ${d}`);
    }
  }
});

// ---- guardie CLI (spawn reale, niente env -> falliscono PRIMA della rete) --

function run(args) {
  try {
    execFileSync("node", args, { cwd: ROOT, stdio: "pipe", env: { ...process.env, SUPABASE_URL: "", VALYU_API_KEY: "" } });
    return { code: 0 };
  } catch (e) {
    return { code: e.status, stderr: String(e.stderr) };
  }
}

test("ingest: senza verticale -> exit 1 con uso", () => {
  const r = run(["engine/ingest.mjs"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /uso:/);
});

test("ingest: --angle senza valore -> exit 1", () => {
  const r = run(["engine/ingest.mjs", "insurance", "--angle", "--dry"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--angle richiede/);
});

test("competitors: --limit senza valore -> exit 1", () => {
  const r = run(["engine/competitors.mjs", "--limit"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--limit richiede/);
});

test("competitors: --limit 0 -> exit 1", () => {
  const r = run(["engine/competitors.mjs", "--limit", "0"]);
  assert.equal(r.code, 1);
});

test("retrieve: senza query -> exit 1 con uso", () => {
  const r = run(["engine/retrieve.mjs"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /uso:/);
});
