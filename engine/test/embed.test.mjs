// embed.mjs esegue tutto al top-level: lo si esercita spawnando il processo con
// fetch mockata (--import, vedi helpers/) — la coverage dei figli viene raccolta.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runEngine } from "./helpers/spawn.mjs";

const TR_IT = { locale: "it", title: "Titolo", problem: "p1", approach: "a1", result: "r1", lesson: "l1" };

test("embed: nessun articolo -> esce 0 senza embeddare", () => {
  const r = runEngine(["engine/embed.mjs"], [{ match: "articles?select=", body: [] }]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /nessun articolo da embeddare/);
});

test("embed: articolo pieno -> chunk+embed+replace; articolo senza testo -> skip", () => {
  const routes = [
    { match: "articles?select=", body: [{ id: "A1", slug: "pieno" }, { id: "A2", slug: "vuoto" }] },
    // Le due select di traduzioni arrivano in ordine (A1 poi A2): times le sequenzia.
    { match: "article_translations?", times: 1, body: [TR_IT, { ...TR_IT, locale: "en" }] },
    { match: "article_translations?", times: 1, body: [{ locale: "it", title: null, problem: null, approach: null, result: null, lesson: null }] },
    { match: "voyageai", method: "POST", type: "voyage" },
    { match: "article_chunks", method: "DELETE" },
    { match: "article_chunks", method: "POST" },
  ];
  const r = runEngine(["engine/embed.mjs"], routes);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /pieno — 2 chunk \(it\+en\)/);
  assert.match(r.stdout, /vuoto — nessun testo, skip/);
  assert.match(r.stdout, /fatto, 2 chunk totali/);
});

test("embed: insert fallito DOPO il delete -> urla di rieseguire ed esce non-zero", () => {
  const routes = [
    { match: "articles?select=", body: [{ id: "A1", slug: "rotto" }] },
    { match: "article_translations?", body: [TR_IT] },
    { match: "voyageai", method: "POST", type: "voyage" },
    { match: "article_chunks", method: "DELETE" },
    { match: "article_chunks", method: "POST", status: 500, body: "boom" },
  ];
  const r = runEngine(["engine/embed.mjs"], routes);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /insert fallito DOPO il delete: articolo senza chunk, RI-ESEGUI/);
});
