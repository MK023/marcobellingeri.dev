// main() di ingest.mjs via spawn con fetch mockata (le funzioni pure sono già
// coperte in integration.test.mjs, le guardie argv in unit.test.mjs).
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";
import { buildAllowlist } from "../ingest.mjs";

test("allowlist: registro senza core -> lista vuota, non un crash", () => {
  assert.deepEqual(buildAllowlist({}, "insurance"), []);
});

test("ingest: --dry su verticale ignoto -> warn core-only, elenco candidati, nessuna scrittura", () => {
  const routes = [{ match: "valyu.ai/v1/search", method: "POST", body: { success: true, results: [
    { url: "https://a.gov/x", title: "Prova ufficiale", content: "c", relevance_score: 0.7 },
    { url: "https://a.gov/" }, // né titolo né path: source_name resta null
  ] } }];
  const r = runEngine(["engine/ingest.mjs", "vertignoto", "--angle", "survey findings", "--dry"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /nessuna allowlist per 'vertignoto'/);
  assert.match(r.stdout, /angolo = "survey findings"/);
  assert.match(r.stdout, /\[dry\] https:\/\/a\.gov\/x/);
  assert.match(r.stdout, /\[dry\] https:\/\/a\.gov\/ {2}· {2}\(no title\)/);
  assert.match(r.stdout, /2 candidati-prova mappati, nessuna scrittura/);
});

test("ingest: numero esistente -> dedup contro i signal già sul numero, insert dei freschi", () => {
  const routes = [
    { match: "valyu.ai/v1/search", method: "POST", body: { success: true, results: [
      { url: "https://a.gov/vecchio", title: "Vecchio report" },
      { url: "https://a.gov/nuovo", title: "Nuovo report", content: "c" },
    ] } },
    { match: "issues?select=id,number,status", body: [{ id: "I1", number: 7, status: "draft" }] },
    { match: "signals?select=source_url", body: [{ source_url: "https://a.gov/vecchio" }] },
    { match: "rest/v1/signals", method: "POST" },
  ];
  const r = runEngine(["engine/ingest.mjs", "insurance"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /numero esistente .* \(status=draft\)/);
  assert.match(r.stdout, /1 nuovi candidati-prova \(discovery\) su #7/);
});

test("ingest: nessun numero per il periodo -> lo crea; zero risultati utili -> zero insert", () => {
  const routes = [
    // solo risultati senza url -> mapped vuoto -> niente POST signals
    { match: "valyu.ai/v1/search", method: "POST", body: { success: true, results: [{ title: "senza url" }] } },
    { match: "issues?select=id,number,status", body: [] },
    { match: "issues?select=number", body: [{ number: 2 }, { number: 5 }] },
    { match: "rest/v1/issues", method: "POST", body: [{ id: "I9", number: 6, status: "draft" }] },
    { match: "signals?select=source_url", body: [] },
  ];
  const r = runEngine(["engine/ingest.mjs", "insurance"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /creato numero #6 .* draft/);
  assert.match(r.stdout, /0 nuovi candidati-prova \(discovery\) su #6/);
});
