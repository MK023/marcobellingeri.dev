// Unit del client dev.to (lib/devto.mjs) + guardie CLI di devto.mjs.
// Stub di fetch globale con cattura delle richieste, zero rete.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { parseArticle, upsertArticle, inUscita, urlNonCondiviso } from "../lib/devto.mjs";
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

// ---- inUscita: il decisore puro dell'uscita programmata -----------------

// Le date restano stringhe ISO: confrontarle lessicograficamente e' esatto e
// non apre il capitolo fusi orari (il cron gira in UTC, l'autore scrive a Roma).
const CAL = (over = {}) => ({
  articoli: [
    { slug: "vecchio", date: "2026-07-15", canonicalUrl: "https://marcobellingeri.dev/en/writing/vecchio" },
    { slug: "oggi", date: "2026-07-22", canonicalUrl: "https://marcobellingeri.dev/en/writing/oggi" },
    { slug: "domani", date: "2026-07-23", canonicalUrl: "https://marcobellingeri.dev/en/writing/domani" },
    { slug: "lontano", date: "2026-08-05", canonicalUrl: "https://marcobellingeri.dev/en/writing/lontano" },
  ],
  canonicalPubblicati: [],
  oggi: "2026-07-22",
  ...over,
});
const slugs = (l) => l.map((a) => a.slug);

test("inUscita: esce cio' che ha la data arrivata, non il futuro", () => {
  const r = inUscita(CAL());
  assert.deepEqual(slugs(r.daPubblicare), ["vecchio", "oggi"]);
  assert.deepEqual(slugs(r.domani), ["domani"]);
});

test("inUscita: un pezzo gia' live su dev.to non si ripubblica", () => {
  const r = inUscita(CAL({ canonicalPubblicati: ["https://marcobellingeri.dev/en/writing/vecchio"] }));
  assert.deepEqual(slugs(r.daPubblicare), ["oggi"]);
});

test("inUscita: il preavviso non scatta per un pezzo gia' uscito", () => {
  const r = inUscita(CAL({ canonicalPubblicati: ["https://marcobellingeri.dev/en/writing/domani"] }));
  assert.deepEqual(slugs(r.domani), []);
});

test("inUscita: il giorno dopo il 31 e' il 1 del mese dopo (niente aritmetica a mano)", () => {
  const r = inUscita(CAL({
    articoli: [{ slug: "primo-agosto", date: "2026-08-01", canonicalUrl: "u" }],
    oggi: "2026-07-31",
  }));
  assert.deepEqual(slugs(r.domani), ["primo-agosto"]);
  assert.deepEqual(slugs(r.daPubblicare), []);
});

test("inUscita: senza articoli non inventa nulla", () => {
  const r = inUscita(CAL({ articoli: [] }));
  assert.deepEqual(r.daPubblicare, []);
  assert.deepEqual(r.domani, []);
});

test("parseArticle: legge anche la data (non quotata) dal frontmatter", () => {
  assert.equal(parseArticle(MD).date, "2026-07-15");
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

test("devto --due: pubblica i pezzi con la data arrivata ed emette la riga DOMANI=", () => {
  const routes = [
    { match: "articles/me/published", body: [] }, // niente ancora live su dev.to
    { match: "articles/me/all", body: [] },
    { match: "dev.to/api/articles", method: "POST", body: { id: 7, url: "https://dev.to/mk/x-7" } },
  ];
  const r = runEngine(["engine/devto.mjs", "--due"], routes, { DEVTO_API_KEY: "k" });
  assert.equal(r.code, 0, r.stderr);
  // Gli articoli veri in writing/en hanno date passate: devono uscire tutti.
  assert.match(r.stdout, /PUBBLICATO audit-di-se \(data 2026-07-15\)/);
  // Contratto col workflow: la riga esiste sempre, anche vuota.
  assert.match(r.stdout, /^DOMANI=/m);
});

test("devto --due: un pezzo gia' live non viene ripubblicato", () => {
  const routes = [
    { match: "articles/me/published", body: [{ canonical_url: "https://marcobellingeri.dev/en/writing/audit-di-se" }] },
    { match: "articles/me/all", body: [] },
    { match: "dev.to/api/articles", method: "POST", body: { id: 7, url: "https://dev.to/mk/x-7" } },
  ];
  const r = runEngine(["engine/devto.mjs", "--due"], routes, { DEVTO_API_KEY: "k" });
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /PUBBLICATO audit-di-se/);
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

// ---- cache condivisa avvelenata (24-07-2026) -----------------------------
// dev.to serve da cache condivisa anche le risposte di endpoint AUTENTICATI e
// non varia sulla api-key: un 401 finito in cache viene poi servito a chiunque
// chiami lo STESSO url, con qualunque chiave. Misurato: la risposta 401 portava
// `Age: 195`, e lo stesso url con un parametro in piu' tornava 200 nello stesso
// secondo con la stessa chiave. Il cron `Devto publish due` e' morto cosi', e
// per due ore e' sembrato un problema di credenziali.

test("devto: due richieste non condividono mai la stessa voce di cache", () => {
  const a = urlNonCondiviso("https://dev.to/api/articles/me/published?per_page=100");
  const b = urlNonCondiviso("https://dev.to/api/articles/me/published?per_page=100");
  assert.notEqual(a, b, "stesso url = stessa cache = un 401 altrui diventa il nostro");
});

test("devto: i parametri veri sopravvivono, l'endpoint non cambia", () => {
  const u = new URL(urlNonCondiviso("https://dev.to/api/articles/me/published?per_page=100"));
  assert.equal(u.origin + u.pathname, "https://dev.to/api/articles/me/published");
  assert.equal(u.searchParams.get("per_page"), "100");
});

test("devto: funziona anche su un url senza query", () => {
  const u = new URL(urlNonCondiviso("https://dev.to/api/articles"));
  assert.equal(u.pathname, "/api/articles");
  assert.ok([...u.searchParams.keys()].length === 1, "deve aggiungere esattamente un parametro");
});

test("devto: le letture autenticate passano tutte dall'url non condiviso", async () => {
  const visti = [];
  globalThis.fetch = async (url, opt) => {
    visti.push(String(url));
    if (String(url).includes("/articles/me/all")) return new Response("[]", { status: 200 });
    return new Response(JSON.stringify({ id: 1, url: "https://dev.to/x" }), { status: 200 });
  };
  process.env.DEVTO_API_KEY = "test-key";
  await upsertArticle({
    title: "t", description: "d", tags: ["a"], body: "b",
    canonicalUrl: "https://marcobellingeri.dev/en/writing/x/",
  });
  const lettura = visti.find((u) => u.includes("/articles/me/all"));
  assert.ok(lettura, "nessuna lettura di me/all");
  assert.ok(
    new URL(lettura).searchParams.has("_"),
    "me/all senza url non condiviso: resta esposta alla cache avvelenata",
  );
});
