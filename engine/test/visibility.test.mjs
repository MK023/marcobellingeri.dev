// visibility.mjs (top-level): spawn con fetch mockata. Le guardie --limit sono
// già coperte in unit.test.mjs; qui l'orchestrazione completa e i suoi rami.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

test("visibility: perplexity (citato + non citato) e gsc, con --limit", () => {
  const routes = [
    { match: "visibility_queries", body: [
      { id: "Q1", text: "self audit discipline", content_ref: "audit-di-se" },
      { id: "Q2", text: "chi è marco", content_ref: null },
    ] },
    { match: "perplexity.ai", method: "POST", times: 1, body: {
      citations: ["https://x.com", "https://www.marcobellingeri.dev/en/writing/audit-di-se"],
    } },
    { match: "perplexity.ai", method: "POST", times: 1, body: { citations: ["https://y.com"] } },
    { match: "visibility_observations", method: "POST" },
    { match: "oauth2.googleapis.com", method: "POST", body: { access_token: "T" } },
    { match: "searchAnalytics", method: "POST", body: { rows: [
      { keys: ["cloud security engineer", "https://marcobellingeri.dev/en"], clicks: 2, impressions: 40, ctr: 0.05, position: 8.3 },
    ] } },
  ];
  const r = runEngine(["engine/visibility.mjs", "--limit", "2"], routes, {
    PERPLEXITY_API_KEY: "k", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /2 query attive \(--limit 2\)/);
  assert.match(r.stdout, /perplexity "self audit discipline" — citato/);
  assert.match(r.stdout, /perplexity "chi è marco" — non citato/);
  assert.match(r.stdout, /gsc — 1 righe/);
  assert.doesNotMatch(r.stdout, /audit-di-se» esiste ma non emerge/); // Q1 citato -> nessuna prescrizione
  assert.match(r.stdout, /candidato per un nuovo pezzo/); // Q2 non citato, senza content_ref
  assert.match(r.stdout, /visibility: fatto/);
});

test("visibility: gsc fallita non ferma l'AEO", () => {
  const routes = [
    { match: "visibility_queries", body: [{ id: "Q1", text: "x", content_ref: null }] },
    { match: "perplexity.ai", method: "POST", body: { citations: [] } },
    { match: "visibility_observations", method: "POST" },
    { match: "oauth2.googleapis.com", method: "POST", status: 400, body: "bad" },
  ];
  const r = runEngine(["engine/visibility.mjs"], routes, {
    PERPLEXITY_API_KEY: "k", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0);
  assert.match(r.stderr, /gsc fallita/);
  assert.match(r.stdout, /visibility: fatto/);
});
