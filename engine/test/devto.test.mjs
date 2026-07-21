// Unit del client dev.to (lib/devto.mjs) + guardie CLI di devto.mjs.
// Stub di fetch globale con cattura delle richieste, zero rete.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { parseArticle, upsertArticle } from "../lib/devto.mjs";
import { runEngine } from "./helpers/spawn.mjs";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const MD = `---
lang: en
title: "A title with: colon inside"
date: 2026-07-15
description: "Short summary."
tags: [security, webdev, astro]
---

Body first line.

More body.
`;

// Router che registra ogni chiamata: url, metodo, body (parsato).
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url), method: (init.method ?? "GET").toUpperCase(),
      headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return handler(call);
  };
  return calls;
}
const okJson = (body) => new Response(JSON.stringify(body), { status: 200 });

test("parseArticle: frontmatter e body separati, tags come lista", () => {
  const a = parseArticle(MD);
  assert.equal(a.title, "A title with: colon inside");
  assert.equal(a.description, "Short summary.");
  assert.deepEqual(a.tags, ["security", "webdev", "astro"]);
  assert.match(a.body, /^Body first line\./);
  assert.doesNotMatch(a.body, /---/);
});

test("parseArticle: frontmatter assente o incompleto -> throw", () => {
  assert.throws(() => parseArticle("niente frontmatter"), /frontmatter/);
  assert.throws(() => parseArticle('---\ntitle: "solo titolo"\n---\nbody'), /frontmatter incompleto/);
});

test("upsertArticle: senza DEVTO_API_KEY -> throw prima di ogni fetch", async () => {
  const prev = process.env.DEVTO_API_KEY;
  delete process.env.DEVTO_API_KEY;
  try {
    await assert.rejects(() => upsertArticle({ title: "t", description: "d", tags: [], body: "b", canonicalUrl: "https://x" }),
      /missing env: DEVTO_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.DEVTO_API_KEY = prev;
  }
});

test("upsertArticle: canonical nuovo -> POST create, draft di default (published omesso)", async () => {
  process.env.DEVTO_API_KEY = "k";
  const calls = stubFetch((c) => {
    if (c.url.includes("/articles/me/all")) return okJson([]);
    if (c.method === "POST") return okJson({ id: 7, url: "https://dev.to/mk/a-7" });
    throw new Error(`inatteso: ${c.method} ${c.url}`);
  });
  const r = await upsertArticle({
    title: "T", description: "D", tags: ["security", "webdev", "astro", "css", "extra"],
    body: "B", canonicalUrl: "https://marcobellingeri.dev/en/writing/x",
  });
  assert.equal(r.id, 7);
  assert.equal(r.updated, false);
  const post = calls.find((c) => c.method === "POST");
  assert.equal(post.headers["api-key"], "k");
  assert.equal(post.body.article.canonical_url, "https://marcobellingeri.dev/en/writing/x");
  assert.equal(post.body.article.tags, "security,webdev,astro,css"); // max 4 (limite dev.to)
  // Draft di default: `published` NON viene mandato — sul create l'API defaulta
  // a false, e sull'update omettere = non toccare lo stato live.
  assert.equal("published" in post.body.article, false);
});

test("upsertArticle: canonical già su dev.to -> PUT sull'id, --publish manda published:true", async () => {
  process.env.DEVTO_API_KEY = "k";
  const calls = stubFetch((c) => {
    if (c.url.includes("/articles/me/all")) {
      return okJson([{ id: 42, canonical_url: "https://marcobellingeri.dev/en/writing/x" }]);
    }
    if (c.method === "PUT") return okJson({ id: 42, url: "https://dev.to/mk/a-42" });
    throw new Error(`inatteso: ${c.method} ${c.url}`);
  });
  const r = await upsertArticle({
    title: "T", description: "D", tags: ["a"], body: "B",
    canonicalUrl: "https://marcobellingeri.dev/en/writing/x", publish: true,
  });
  assert.equal(r.updated, true);
  const put = calls.find((c) => c.method === "PUT");
  assert.match(put.url, /\/articles\/42$/);
  assert.equal(put.body.article.published, true);
});

test("upsertArticle: risposta non-ok -> throw con status e corpo", async () => {
  process.env.DEVTO_API_KEY = "k";
  stubFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(() => upsertArticle({ title: "t", description: "d", tags: [], body: "b", canonicalUrl: "https://x" }),
    /devto me\/all 500: boom/);
});

// ---- CLI (spawn) -------------------------------------------------------

test("devto: senza slug o slug sporco -> uso ed exit 1", () => {
  assert.equal(runEngine(["engine/devto.mjs"]).code, 1);
  const r = runEngine(["engine/devto.mjs", "../evil"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /uso:/);
});

test("devto: slug inesistente -> errore chiaro ed exit 1", () => {
  const r = runEngine(["engine/devto.mjs", "non-esiste-di-sicuro"], [], { DEVTO_API_KEY: "k" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /articolo non trovato/);
});

test("devto: happy path sull'articolo vero — create draft con canonical", () => {
  const routes = [
    { match: "articles/me/all", body: [] },
    { match: "dev.to/api/articles", method: "POST", body: { id: 9, url: "https://dev.to/mk/audit-9" } },
  ];
  const r = runEngine(["engine/devto.mjs", "audit-di-se"], routes, { DEVTO_API_KEY: "k" });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /creato id 9 — draft/);
  assert.match(r.stdout, /canonical -> https:\/\/marcobellingeri\.dev\/en\/writing\/audit-di-se/);
});
