// competitors.mjs (top-level): spawn con fetch mockata. Le guardie --limit sono
// già coperte in unit.test.mjs; qui il radar completo e i suoi rami.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

test("competitors: happy + pagina vuota (skip) + scrape fallito (continua), con --limit", () => {
  const routes = [
    { match: "competitor_sources", body: [
      { id: "S1", name: "alpha", url: "https://a.example" },
      { id: "S2", name: "beta", url: "https://b.example" },
      { id: "S3", name: "gamma", url: "https://c.example" },
    ] },
    // Tre scrape in ordine (alpha, beta, gamma): times li sequenzia.
    { match: "firecrawl", method: "POST", times: 1, body: { data: {
      markdown: "# Alpha\n\nContenuto reale della pagina.", metadata: { title: "Alpha Page", url: "https://a.example/" },
    } } },
    { match: "firecrawl", method: "POST", times: 1, body: {} }, // risposta senza data -> markdown vuoto
    { match: "firecrawl", method: "POST", times: 1, status: 500, body: "boom" },
    { match: "competitor_snapshots", method: "POST", body: [{ id: "SNAP1" }] },
    { match: "voyageai", method: "POST", type: "voyage" },
    { match: "competitor_chunks", method: "POST" },
  ];
  const r = runEngine(["engine/competitors.mjs", "--limit", "3"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /3 fonti attive \(--limit 3\)/);
  assert.match(r.stdout, /alpha — snapshot \+ 1 chunk/);
  assert.match(r.stdout, /beta — vuoto, skip/);
  assert.match(r.stderr, /fallito gamma: firecrawl 500/);
  assert.match(r.stdout, /competitors: fatto/);
});

test("competitors: senza FIRECRAWL_API_KEY la fonte fallisce ma il radar arriva in fondo", () => {
  const routes = [{ match: "competitor_sources", body: [{ id: "S1", name: "alpha", url: "https://a.example" }] }];
  const r = runEngine(["engine/competitors.mjs"], routes, { FIRECRAWL_API_KEY: "" });
  assert.equal(r.code, 0);
  assert.match(r.stderr, /fallito alpha: missing env: FIRECRAWL_API_KEY/);
  assert.match(r.stdout, /1 fonti attive\./);
  assert.match(r.stdout, /competitors: fatto/);
});
