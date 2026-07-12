// retrieve.mjs (top-level): spawn con fetch mockata. La guardia "senza query"
// è già coperta in unit.test.mjs.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

test("retrieve: query+locale -> embed(query) + rpc, stampa i match", () => {
  const routes = [
    { match: "voyageai", method: "POST", type: "voyage" },
    { match: "rpc/match_article_chunks", method: "POST", body: [
      { similarity: 0.912, locale: "it", content: "Un caso concreto  di adozione dell'IA nel settore." },
    ] },
  ];
  const r = runEngine(["engine/retrieve.mjs", "gate di pubblicazione", "it"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /1 match per "gate di pubblicazione" \(it\)/);
  assert.match(r.stdout, /0\.912 \[it\] Un caso concreto di adozione/);
});

test("retrieve: senza locale e senza match -> 0 match, nessun elenco", () => {
  const routes = [
    { match: "voyageai", method: "POST", type: "voyage" },
    { match: "rpc/match_article_chunks", method: "POST", body: [] },
  ];
  const r = runEngine(["engine/retrieve.mjs", "query senza riscontri"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /0 match per "query senza riscontri"\.\n$/);
});

test("retrieve: una fetch NON mockata esplode — prova che i test non toccano mai la rete", () => {
  const r = runEngine(["engine/retrieve.mjs", "qualsiasi"], []);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /fetch non mockata: POST https:\/\/api\.voyageai\.com/);
});
