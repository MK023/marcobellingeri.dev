// engine/test/visibility-urlmatch.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeHost, isSameDomain, findCitation } from "../lib/urlmatch.mjs";

const DOMAIN = "marcobellingeri.dev";

test("normalizeHost: schema, www, path, case, porta", () => {
  assert.equal(normalizeHost("https://www.Marcobellingeri.dev/it/writing"), "marcobellingeri.dev");
  assert.equal(normalizeHost("marcobellingeri.dev"), "marcobellingeri.dev");
  assert.equal(normalizeHost("http://marcobellingeri.dev:443/"), "marcobellingeri.dev");
  assert.equal(normalizeHost("Esempio.COM"), "esempio.com");
  assert.equal(normalizeHost("http://"), "http://"); // URL non parsabile -> fallback catch
  assert.equal(normalizeHost(""), null);
  assert.equal(normalizeHost(null), null);
});

test("isSameDomain: dominio, sottodominio, www — sì", () => {
  assert.equal(isSameDomain("https://marcobellingeri.dev/it", DOMAIN), true);
  assert.equal(isSameDomain("https://www.marcobellingeri.dev", DOMAIN), true);
  assert.equal(isSameDomain("https://blog.marcobellingeri.dev/x", DOMAIN), true);
});

test("isSameDomain: suffix attack e lookalike — no", () => {
  assert.equal(isSameDomain("https://marcobellingeri.dev.evil.com", DOMAIN), false);
  assert.equal(isSameDomain("https://notmarcobellingeri.dev", DOMAIN), false);
  assert.equal(isSameDomain("https://example.com", DOMAIN), false);
});

test("findCitation: trova alla posizione giusta (1-based)", () => {
  const cites = ["https://a.com", "https://www.marcobellingeri.dev/it/writing/x", "https://b.com"];
  assert.deepEqual(findCitation(cites, DOMAIN), {
    present: true, rank: 2, matchedUrl: "https://www.marcobellingeri.dev/it/writing/x",
  });
});

test("findCitation: accetta anche oggetti {url} e assenza", () => {
  assert.deepEqual(findCitation([{ url: "https://marcobellingeri.dev" }], DOMAIN),
    { present: true, rank: 1, matchedUrl: "https://marcobellingeri.dev" });
  assert.deepEqual(findCitation(["https://x.com"], DOMAIN),
    { present: false, rank: null, matchedUrl: null });
  assert.deepEqual(findCitation(null, DOMAIN), { present: false, rank: null, matchedUrl: null });
});
