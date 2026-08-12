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
  assert.match(r.stdout, /gsc — 1 query, 1 pagine, proprietà: 40 impression/);
  assert.doesNotMatch(r.stdout, /audit-di-se» esiste ma non emerge/); // Q1 citato -> nessuna prescrizione
  assert.match(r.stdout, /candidato per un nuovo pezzo/); // Q2 non citato, senza content_ref
  assert.match(r.stdout, /visibility: fatto/);
});

test("visibility: trend dal run precedente — 🆕, delta e prescrizione GSC", () => {
  const routes = [
    { match: "visibility_queries", body: [
      { id: "Q1", text: "self audit discipline", content_ref: "audit-di-se" },
    ] },
    { match: "order=run_at.desc&limit=1", body: [{ run_at: "2026-07-14T00:00:00+00:00" }] },
    { match: "run_at=eq.", body: [
      { engine: "perplexity", query_id: "Q1", present: false, rank: null, detail: {} },
      { engine: "gsc", query_id: null, present: true, rank: 10, detail: { query: "cloud security engineer" } },
    ] },
    { match: "perplexity.ai", method: "POST", body: {
      citations: ["https://www.marcobellingeri.dev/en/writing/audit-di-se"],
    } },
    { match: "visibility_observations", method: "POST" },
    { match: "oauth2.googleapis.com", method: "POST", body: { access_token: "T" } },
    { match: "searchAnalytics", method: "POST", body: { rows: [
      { keys: ["cloud security engineer", "https://marcobellingeri.dev/en"], clicks: 1, impressions: 30, ctr: 0.03, position: 12.3 },
    ] } },
  ];
  const r = runEngine(["engine/visibility.mjs"], routes, {
    PERPLEXITY_API_KEY: "k", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /🆕/);                                  // Q1: citato ora, non nel run precedente
  assert.match(r.stdout, /Δ \+2\.3/);                            // gsc: 12.3 - 10
  assert.match(r.stdout, /Perdi posizione su «cloud security engineer»/);
});

test("visibility: una query perplexity fallita non ferma il monitor", () => {
  const routes = [
    { match: "visibility_queries", body: [{ id: "Q1", text: "boom", content_ref: null }] },
    { match: "perplexity.ai", method: "POST", status: 500, body: "boom" },
    { match: "oauth2.googleapis.com", method: "POST", body: { access_token: "T" } },
    { match: "searchAnalytics", method: "POST", body: { rows: [] } },
  ];
  const r = runEngine(["engine/visibility.mjs"], routes, {
    PERPLEXITY_API_KEY: "k", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /perplexity fallita "boom"/);
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

// La terza fonte AEO (ChatGPT, proxy via API OpenAI). Il rischio non e' la
// chiamata, e' il TREND: le osservazioni precedenti si leggono in una mappa sola,
// e due fonti che condividono lo stesso query_id si sovrascrivono a vicenda —
// una 🆕 inventata su una fonte che non era cambiata.
test("visibility: chatgpt e' una terza fonte, e il suo trend non si mescola con perplexity", () => {
  const routes = [
    { match: "visibility_queries", body: [
      { id: "Q1", text: "self audit discipline", content_ref: "audit-di-se" },
    ] },
    { match: "order=run_at.desc&limit=1", body: [{ run_at: "2026-08-05T00:00:00+00:00" }] },
    { match: "run_at=eq.", body: [
      { engine: "perplexity", query_id: "Q1", present: false, rank: null, detail: {} },
      { engine: "chatgpt", query_id: "Q1", present: true, rank: 1, detail: {} },
    ] },
    { match: "perplexity.ai", method: "POST", body: {
      citations: ["https://marcobellingeri.dev/en/writing/audit-di-se"],
    } },
    { match: "api.openai.com", method: "POST", body: {
      output: [{ type: "message", content: [{ type: "output_text", annotations: [
        { type: "url_citation", url: "https://marcobellingeri.dev/en/writing/audit-di-se" },
      ] }] }],
    } },
    { match: "visibility_observations", method: "POST" },
    { match: "oauth2.googleapis.com", method: "POST", body: { access_token: "T" } },
    { match: "searchAnalytics", method: "POST", body: { rows: [] } },
  ];
  const r = runEngine(["engine/visibility.mjs"], routes, {
    PERPLEXITY_API_KEY: "k", OPENAI_API_KEY: "o", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /chatgpt "self audit discipline" — citato/);
  const iGpt = r.stdout.indexOf("## AEO — ChatGPT");
  const pplx = r.stdout.slice(r.stdout.indexOf("## AEO — Perplexity"), iGpt);
  const gpt = r.stdout.slice(iGpt, r.stdout.indexOf("## SEO"));
  assert.match(pplx, /🆕/, "perplexity non citava e ora cita: e' una novita'");
  assert.doesNotMatch(gpt, /🆕/, "chatgpt citava gia': nessuna novita' da inventare");
});

test("visibility: se la fonte ChatGPT fallisce, il resto del monitor resta in piedi", () => {
  const routes = [
    { match: "visibility_queries", body: [{ id: "Q1", text: "q", content_ref: null }] },
    { match: "perplexity.ai", method: "POST", body: { citations: ["https://x.com"] } },
    { match: "api.openai.com", method: "POST", status: 429, body: "rate limited" },
    { match: "visibility_observations", method: "POST" },
    { match: "oauth2.googleapis.com", method: "POST", body: { access_token: "T" } },
    { match: "searchAnalytics", method: "POST", body: { rows: [] } },
  ];
  const r = runEngine(["engine/visibility.mjs"], routes, {
    PERPLEXITY_API_KEY: "k", OPENAI_API_KEY: "o", GSC_CLIENT_ID: "c", GSC_CLIENT_SECRET: "s",
    GSC_REFRESH_TOKEN: "t", GSC_SITE_URL: "sc-domain:marcobellingeri.dev",
  });
  assert.equal(r.code, 0, "una fonte rotta non fa cadere il monitor");
  assert.match(r.stderr, /chatgpt fallita/);
  assert.match(r.stdout, /visibility: fatto/);
});
