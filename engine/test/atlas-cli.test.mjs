// engine/atlas.mjs (top-level): spawn con fetch mockata.
//
// La libreria (lib/atlas.mjs) era gia' coperta, la SHELL no: 28 righe a zero,
// e dentro ci stanno tre difese, non della colla. Misurato il 12-08-2026 —
// e' lo stesso motivo per cui il 26/07 fra le righe scoperte c'era una
// protezione da prompt injection mai testata: la coverage bassa non e' rumore.
//
// Il caso felice NON e' qui di proposito: lo script scrive
// astro-project/src/data/radar-atlas.js con un percorso fisso, quindi un test
// che lo esercita sovrascriverebbe un file committato. Tutti i rami sotto
// rompono PRIMA della scrittura, e sono quelli che portano il valore.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

test("atlas: un redirect non viene seguito — il dato arriva dall'origine dichiarata", () => {
  // `redirect: "manual"` (#129): la licenza che mostriamo vale per la fonte che
  // abbiamo dichiarato, non per dove un 302 ci porta. Con il follow automatico
  // questa risposta diventerebbe un 200 da un altro host, in silenzio.
  // La destinazione del 302 e' un file PERFETTAMENTE VALIDO: se lo script
  // seguisse il redirect otterrebbe un 200 e proseguirebbe. Il test cade se la
  // difesa sparisce, invece di passare per la ragione sbagliata.
  const r = runEngine(["engine/atlas.mjs"], [
    { match: "ATLAS-latest.yaml", status: 302, location: "https://dirottato.example/ATLAS-v6.yaml" },
    { match: "dirottato.example", body: "format-version: '6.0'\n  version: '4.9.0'\n" },
  ]);
  assert.notEqual(r.code, 0, "un redirect deve fermare lo script, non essere seguito");
  assert.match(r.stderr, /HTTP 302/);
});

test("atlas: intestazione inattesa -> si ferma invece di scrivere un file storto", () => {
  const r = runEngine(["engine/atlas.mjs"], [
    { match: "ATLAS-latest.yaml", body: "roba: che non e' ATLAS\n" },
  ]);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /formato cambiato/);
});

test("atlas: catena di symlink infinita -> si ferma dopo i salti previsti", () => {
  // Il file di MITRE puo' essere un puntatore a un altro file. Senza il tetto
  // sui salti, un puntatore che rimanda a se stesso girerebbe per sempre.
  const r = runEngine(["engine/atlas.mjs"], [
    { match: "ATLAS-latest.yaml", body: "ATLAS-latest.yaml\n" },
  ]);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /catena di symlink troppo lunga/);
});
