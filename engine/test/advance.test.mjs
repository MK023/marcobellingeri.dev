// Unit del decisore della pipeline magazine (lib/advance.mjs) + CLI advance.mjs
// con REST Supabase mockata. La decisione è pura; l'esecuzione sta nel workflow.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { decidi } from "../lib/advance.mjs";
import { runEngine } from "./helpers/spawn.mjs";

test("decidi: numero approvato ed embeddato -> export del period", () => {
  assert.deepEqual(
    decidi({ approvato: { period: "2026-08", conArticolo: true, embedded: true }, bozza: null }),
    { stage: "export", arg: "2026-08" },
  );
});

test("decidi: numero approvato ma non embeddato -> embed", () => {
  const d = decidi({ approvato: { period: "2026-08", conArticolo: true, embedded: false }, bozza: null });
  assert.equal(d.stage, "embed");
});

test("decidi: approvato senza articolo -> niente (stato anomalo, non loopare embed)", () => {
  const d = decidi({ approvato: { period: "2026-08", conArticolo: false, embedded: false }, bozza: null });
  assert.equal(d.stage, "niente");
  assert.match(d.motivo, /anomal/);
});

test("decidi: bozza con segnali verificati e senza articolo -> generate del settore", () => {
  assert.deepEqual(
    decidi({ approvato: null, bozza: { sector: "security", conArticolo: false, conSegnaliVerificati: true } }),
    { stage: "generate", arg: "security" },
  );
});

test("decidi: bozza con articolo già generato -> niente (attende approvazione)", () => {
  const d = decidi({ approvato: null, bozza: { sector: "security", conArticolo: true, conSegnaliVerificati: true } });
  assert.equal(d.stage, "niente");
  assert.match(d.motivo, /approvazione/);
});

test("decidi: bozza senza segnali verificati -> niente (attende verifica)", () => {
  const d = decidi({ approvato: null, bozza: { sector: "cloud", conArticolo: false, conSegnaliVerificati: false } });
  assert.equal(d.stage, "niente");
  assert.match(d.motivo, /verifica/);
});

test("decidi: nessun numero in lavorazione -> niente", () => {
  const d = decidi({ approvato: null, bozza: null });
  assert.equal(d.stage, "niente");
});

test("CLI advance: approvato embeddato a DB -> stampa 'export <period>'", () => {
  const r = runEngine(["engine/advance.mjs"], [
    { match: "status=eq.approved", body: [{ id: 7, period: "2026-08" }] },
    { match: "article_chunks", body: [{ id: 1 }] },
    { match: "articles?select", body: [{ id: 42 }] },
    { match: "status=eq.draft", body: [] },
  ]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "export 2026-08");
});

test("CLI advance: solo bozza con segnali verificati -> stampa 'generate <sector>'", () => {
  const r = runEngine(["engine/advance.mjs"], [
    { match: "status=eq.approved", body: [] },
    { match: "status=eq.draft", body: [{ id: 3, sector: "devsecops" }] },
    { match: "articles?select", body: [] },
    { match: "signals?select", body: [{ id: 9 }] },
  ]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "generate devsecops");
});

test("CLI advance: DB fermo -> stampa 'niente' e motivo su stderr", () => {
  const r = runEngine(["engine/advance.mjs"], [
    { match: "status=eq.approved", body: [] },
    { match: "status=eq.draft", body: [] },
  ]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "niente");
  assert.match(r.stderr, /nessun numero/);
});
