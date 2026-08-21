// Unit del decisore del merge automatico della card (lib/gate-merge.mjs).
// La decisione è pura; l'esecuzione — il merge vero — sta nel workflow.
// Quello che questi test fissano: il 2026-08-21 il workflow mergiava guardando
// solo i check, e su una PR BLOCKED si prendeva "the base branch policy
// prohibits the merge". La causa di quel BLOCKED era un'altra (i run
// `pull_request` parcheggiati, vedi edicola-card.yml); qui si fissa che il gate
// non mergia mai al buio, qualunque sia la ragione del blocco.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { decidiMerge } from "../lib/gate-merge.mjs";

const RICHIESTI = ["test", "build-e-csp", "db-rebuild"];
const verde = (name) => ({ name, status: "completed", conclusion: "success" });
const rosso = (name) => ({ name, status: "completed", conclusion: "failure" });
const inCorso = (name) => ({ name, status: "in_progress", conclusion: null });
const tuttiVerdi = RICHIESTI.map(verde);

test("un check richiesto rosso: ferma, senza aspettare gli altri", () => {
  const d = decidiMerge({
    checkRuns: [verde("test"), rosso("build-e-csp"), inCorso("db-rebuild")],
    richiesti: RICHIESTI,
    statoMerge: "BLOCKED",
    tentativiRimasti: 10,
  });
  assert.equal(d.azione, "ferma");
  assert.match(d.motivo, /rosso/);
});

test("check ancora in corso: aspetta", () => {
  const d = decidiMerge({
    checkRuns: [verde("test"), inCorso("build-e-csp")],
    richiesti: RICHIESTI,
    statoMerge: "UNKNOWN",
    tentativiRimasti: 10,
  });
  assert.equal(d.azione, "aspetta");
});

test("nessun check trovato: aspetta, non mergia (zero check non è verde)", () => {
  const d = decidiMerge({ checkRuns: [], richiesti: RICHIESTI, statoMerge: "CLEAN", tentativiRimasti: 10 });
  assert.equal(d.azione, "aspetta");
  assert.match(d.motivo, /0\/3/);
});

test("tre verdi e PR pulita: mergia", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "CLEAN", tentativiRimasti: 10 });
  assert.equal(d.azione, "mergia");
});

test("tre verdi e UNSTABLE: mergia — i check NON richiesti che restano skipped non bloccano", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "UNSTABLE", tentativiRimasti: 10 });
  assert.equal(d.azione, "mergia");
});

test("tre verdi ma BLOCKED: aspetta, non mergia — il blocco ha una causa e non la conosce il gate", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "BLOCKED", tentativiRimasti: 10 });
  assert.equal(d.azione, "aspetta");
  assert.match(d.motivo, /BLOCKED/);
});

test("tre verdi e stato UNKNOWN: aspetta, il calcolo di GitHub è asincrono", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "UNKNOWN", tentativiRimasti: 10 });
  assert.equal(d.azione, "aspetta");
});

test("conflitto sul contenuto (DIRTY): ferma, aspettare non lo risolve", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "DIRTY", tentativiRimasti: 10 });
  assert.equal(d.azione, "ferma");
});

test("branch indietro (BEHIND): ferma — il ruleset è strict, serve un rebase", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "BEHIND", tentativiRimasti: 10 });
  assert.equal(d.azione, "ferma");
});

test("tentativi finiti mentre si aspetta: ferma, non aspetta all'infinito", () => {
  const d = decidiMerge({ checkRuns: tuttiVerdi, richiesti: RICHIESTI, statoMerge: "BLOCKED", tentativiRimasti: 0 });
  assert.equal(d.azione, "ferma");
  assert.match(d.motivo, /tempo/);
});

test("un check richiesto duplicato e verde due volte non conta per due", () => {
  const d = decidiMerge({
    checkRuns: [verde("test"), verde("test"), verde("build-e-csp")],
    richiesti: RICHIESTI,
    statoMerge: "CLEAN",
    tentativiRimasti: 10,
  });
  assert.equal(d.azione, "aspetta");
  assert.match(d.motivo, /2\/3/);
});

// La CLI: e' la parte che il workflow esegue davvero. Nessuna rete, nessun
// segreto — legge il JSON dei check-run su stdin e stampa l'azione su stdout.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const gate = (stdin, ...args) =>
  spawnSync("node", ["engine/edicola-gate.mjs", ...args], { cwd: ROOT, input: stdin, encoding: "utf8" });

const RISPOSTA_GH = JSON.stringify({ check_runs: tuttiVerdi });

test("cli: tre verdi e CLEAN -> stampa mergia su stdout", () => {
  const r = gate(RISPOSTA_GH, "CLEAN", "10");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "mergia");
});

test("cli: tre verdi ma BLOCKED -> aspetta, e il motivo va su stderr", () => {
  const r = gate(RISPOSTA_GH, "BLOCKED", "10");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "aspetta");
  assert.match(r.stderr, /BLOCKED/);
});

test("cli: un check rosso -> ferma", () => {
  const r = gate(JSON.stringify({ check_runs: [verde("test"), rosso("db-rebuild")] }), "CLEAN", "10");
  assert.equal(r.stdout.trim(), "ferma");
});

test("cli: senza argomenti esce male invece di indovinare", () => {
  const r = gate(RISPOSTA_GH);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /uso:/);
});
