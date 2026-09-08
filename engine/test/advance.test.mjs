// Unit del decisore della pipeline magazine (lib/advance.mjs) + CLI advance.mjs
// con REST Supabase mockata. La decisione è pura; l'esecuzione sta nel workflow.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { decidi, giorniDa } from "../lib/advance.mjs";
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
    // La barra editoriale si chiede alla vista (0012), non a signals: il match
    // è sul path pieno, altrimenti "signals?select" combacerebbe per substring
    // anche se il predicato tornasse inline qui.
    { match: "verified_signals?select", body: [{ id: 9 }] },
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

// --- Il contatore di attesa (2026-09) ---------------------------------------
// Il numero 3 e' uscito con sette giorni di ritardo dietro otto run verdi: il
// motivo era scritto ogni mattina, la durata no. Queste sono le asserzioni che
// falliscono se il conteggio smette di uscire.

test("giorniDa: conta i giorni interi trascorsi", () => {
  const ora = new Date("2026-09-08T10:00:00Z");
  assert.equal(giorniDa("2026-09-01T10:57:00Z", ora), 6);
  assert.equal(giorniDa("2026-09-08T09:00:00Z", ora), 0);
});

test("giorniDa: senza data, o con data illeggibile, non inventa un numero", () => {
  assert.equal(giorniDa(null), null);
  assert.equal(giorniDa(undefined), null);
  assert.equal(giorniDa("non una data"), null);
});

test("giorniDa: una data futura non produce giorni negativi", () => {
  assert.equal(giorniDa("2026-09-20T00:00:00Z", new Date("2026-09-08T00:00:00Z")), 0);
});

test("decidi: l'attesa del verify porta con se' da quanto dura", () => {
  const d = decidi(
    { approvato: null, bozza: { sector: "insurance", conArticolo: false, conSegnaliVerificati: false, attesaDa: "2026-09-01T10:57:00Z" } },
    new Date("2026-09-08T11:38:00Z"),
  );
  assert.equal(d.stage, "niente");
  assert.match(d.motivo, /verifica/);
  assert.equal(d.giorni, 7);
});

test("decidi: anche l'attesa dell'approvazione e' datata", () => {
  const d = decidi(
    { approvato: null, bozza: { sector: "cloud", conArticolo: true, conSegnaliVerificati: true, attesaDa: "2026-09-05T09:00:00Z" } },
    new Date("2026-09-08T09:00:00Z"),
  );
  assert.equal(d.stage, "niente");
  assert.match(d.motivo, /approvazione/);
  assert.equal(d.giorni, 3);
});

test("decidi: uno stadio che avanza da solo non porta un contatore", () => {
  const d = decidi(
    { approvato: null, bozza: { sector: "cloud", conArticolo: false, conSegnaliVerificati: true, attesaDa: "2026-09-01T00:00:00Z" } },
    new Date("2026-09-08T00:00:00Z"),
  );
  assert.equal(d.stage, "generate");
  assert.equal(d.giorni, undefined);
});

test("CLI advance: la riga ATTESA= c'e' sempre, anche quando non si aspetta nessuno", () => {
  const r = runEngine(["engine/advance.mjs"], [
    { match: "status=eq.approved", body: [] },
    { match: "status=eq.draft", body: [] },
  ]);
  assert.equal(r.code, 0);
  assert.match(r.stderr, /^ATTESA=$/m);
});

test("decidi: lo stato anomalo porta il contatore, perche' e' quello che aspetta un umano", () => {
  const d = decidi(
    { approvato: { period: "2026-09", conArticolo: false, embedded: false, attesaDa: "2026-09-01T00:00:00Z" }, bozza: null },
    new Date("2026-09-08T00:00:00Z"),
  );
  assert.equal(d.stage, "niente");
  assert.match(d.motivo, /anomal/);
  assert.equal(d.giorni, 7);
});

// Il quarto rilievo della review: nessun test copriva il CABLAGGIO fra le righe
// del DB e decidi(). Togliendo `created_at` da una delle due select, giorniDa
// tornerebbe null, ATTESA= resterebbe vuota per sempre e l'allarme non
// suonerebbe mai piu' — con tutti gli altri test verdi. Cioe' esattamente il
// guasto silenzioso per cui questa feature esiste.
test("CLI advance: i created_at del DB arrivano fino al contatore", () => {
  const r = runEngine(["engine/advance.mjs"], [
    { match: "status=eq.approved", body: [] },
    { match: "status=eq.draft", body: [{ id: 3, sector: "cloud", created_at: "2020-01-01T00:00:00Z" }] },
    { match: "articles?select", body: [] },
    { match: "verified_signals?select", body: [] },
  ]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "niente");
  assert.match(r.stderr, /^ATTESA=[1-9][0-9]*$/m);
});

test("CLI advance: l'anomalia si conta dall'approvazione, non dalla nascita del numero", () => {
  const r = runEngine(["engine/advance.mjs"], [
    {
      match: "status=eq.approved",
      body: [{ id: 7, period: "2026-09", created_at: "2020-01-01T00:00:00Z", approved_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }],
    },
    { match: "article_chunks", body: [] },
    { match: "articles?select", body: [] },
  ]);
  assert.equal(r.code, 0);
  assert.match(r.stderr, /anomal/);
  // Da approved_at: 3. Da created_at sarebbero migliaia.
  assert.match(r.stderr, /^ATTESA=3$/m);
});
