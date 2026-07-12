// export.mjs via spawn con fetch mockata. Il cammino felice scrive DAVVERO i
// file in astro-project/src/content/magazine (namespace 9999-xx, come l'e2e):
// il test li verifica e li rimuove in finally.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runEngine } from "./helpers/spawn.mjs";

const MAG = fileURLToPath(new URL("../../astro-project/src/content/magazine", import.meta.url));

const TR = (locale, extra = {}) => ({
  locale, title: "Titolo del caso di prova", problem: "Problema concreto.",
  approach: "Approccio seguito.", result: "Risultato ottenuto.", lesson: "Lezione appresa.", ...extra,
});

test("export: self-check delle funzioni pure passa", () => {
  const r = runEngine(["engine/export.mjs", "--selfcheck"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /export\.mjs self-check OK/);
});

test("export: period malformato -> exit 1 prima di toccare il DB", () => {
  const r = runEngine(["engine/export.mjs", "2026-13"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /period non valido: 2026-13/);
});

test("export: nessun numero approved/published -> errore esplicito", () => {
  const r = runEngine(["engine/export.mjs"], [{ match: "issues?select=", body: [] }]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /nessun numero approved\/published da esportare/);
});

test("export: approved -> file it+en e transizione a published; già published -> ri-export; senza articolo -> salto", () => {
  const written = [
    `${MAG}/it/9999-01-cov-slug-a.md`, `${MAG}/en/9999-01-cov-slug-a.md`,
    `${MAG}/it/9999-02-cov-slug-b.md`, `${MAG}/en/9999-02-cov-slug-b.md`,
  ];
  const routes = [
    { match: "issues?select=", body: [
      { id: "I3", number: 903, period: "9999-03", sector: "sec", status: "approved" },      // senza articolo
      { id: "I1", number: 901, period: "9999-01", sector: "assicurazioni", status: "approved" },
      { id: "I2", number: 902, period: "9999-02", sector: null, status: "published" },
    ] },
    { match: "issue_id=eq.I3", body: [] },
    { match: "issue_id=eq.I1", body: [{ id: "AAA1", slug: "cov-slug-a", stat: 75, stat_suffix: "%" }] },
    { match: "issue_id=eq.I2", body: [{ id: "AAA2", slug: "cov-slug-b", stat: null, stat_suffix: null }] },
    { match: "lesson&article_id=eq.AAA1", body: [TR("it"), TR("en")] },
    { match: "lesson&article_id=eq.AAA2", body: [TR("it"), TR("en", { lesson: null })] },
    { match: "article_chunks?select=id&article_id=eq.AAA1", body: [{ id: "c1" }] },
    { match: "rest/v1/issues?id=eq.I1", method: "PATCH" },
  ];
  try {
    const r = runEngine(["engine/export.mjs"], routes);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /numero 903: nessun articolo, salto/);
    assert.match(r.stdout, /numero 901 \(9999-01\) -> published/);
    assert.match(r.stdout, /numero 902 \(9999-02\) — ri-esportato \(già published\)/);
    assert.match(r.stdout, /scritto magazine\/it\/9999-01-cov-slug-a\.md/);

    for (const f of written) assert.ok(existsSync(f), `file scritto: ${f}`);
    const it1 = readFileSync(written[0], "utf8");
    assert.ok(it1.startsWith("---\n"), "frontmatter aperto");
    assert.ok(it1.includes('lang: "it"') && it1.includes("number: 901"), "campi base");
    assert.ok(it1.includes("stat: 75") && it1.includes('statSuffix: "%"'), "stat grounded serializzata");
    assert.ok(it1.includes('month: "Gennaio 9999"'), "mese localizzato it");
    assert.ok(readFileSync(written[1], "utf8").includes('month: "January 9999"'), "mese localizzato en");
    assert.ok(!readFileSync(written[2], "utf8").includes("stat:"), "niente stat se assente");
  } finally {
    for (const f of written) rmSync(f, { force: true });
  }
});

test("export: slug non sicuro -> stop (niente path traversal nei nomi file)", () => {
  const routes = [
    { match: "issues?select=", body: [{ id: "I1", number: 901, period: "9999-01", sector: "s", status: "approved" }] },
    { match: "issue_id=eq.I1", body: [{ id: "AAA1", slug: "../evil", stat: null, stat_suffix: null }] },
  ];
  const r = runEngine(["engine/export.mjs"], routes);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /slug non sicuro/);
});

test("export: traduzioni incomplete -> stop", () => {
  const routes = [
    { match: "issues?select=", body: [{ id: "I1", number: 901, period: "9999-01", sector: "s", status: "published" }] },
    { match: "issue_id=eq.I1", body: [{ id: "AAA1", slug: "cov-slug-a", stat: null, stat_suffix: null }] },
    { match: "lesson&article_id=eq.AAA1", body: [TR("it")] }, // manca en
  ];
  const r = runEngine(["engine/export.mjs"], routes);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /mancano le traduzioni it\+en/);
});

test("export: approved senza chunk embeddati -> stop (il gate 0006 li pretende)", () => {
  const routes = [
    { match: "issues?select=", body: [{ id: "I1", number: 901, period: "9999-01", sector: "s", status: "approved" }] },
    { match: "issue_id=eq.I1", body: [{ id: "AAA1", slug: "cov-slug-a", stat: null, stat_suffix: null }] },
    { match: "lesson&article_id=eq.AAA1", body: [TR("it"), TR("en")] },
    { match: "article_chunks?select=id&article_id=eq.AAA1", body: [] },
  ];
  const r = runEngine(["engine/export.mjs"], routes);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /chunk non embeddati — esegui engine\/embed\.mjs prima/);
});

test("export: campo che non passa lo screening -> stop PRIMA di scrivere nel repo", () => {
  const routes = [
    { match: "issues?select=", body: [{ id: "I1", number: 901, period: "9999-01", sector: "s", status: "published" }] },
    { match: "issue_id=eq.I1", body: [{ id: "AAA1", slug: "cov-slug-a", stat: null, stat_suffix: null }] },
    { match: "lesson&article_id=eq.AAA1", body: [TR("it", { title: "<script>alert(1)</script>" }), TR("en")] },
  ];
  const r = runEngine(["engine/export.mjs"], routes);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /it\.title bloccato allo screening/);
  assert.ok(!existsSync(`${MAG}/it/9999-01-cov-slug-a.md`), "nessun file scritto");
});

test("export: period esplicito arriva a PostgREST con la query INTATTA (regressione pg-encoding)", () => {
  // Il bug che questo test inchioda: pg`` codifica ogni valore interpolato, e la
  // base passata DENTRO il tag diventava issues%3Fselect%3D... → 404 PostgREST.
  // La rotta qui sotto matcha l'URL corretto per intero: con la query codificata
  // il mock non troverebbe nulla e il processo morirebbe con "fetch non mockata".
  const r = runEngine(
    ["engine/export.mjs", "9999-01"],
    [{ match: "issues?select=id,number,period,sector,status&status=in.(approved,published)&order=number.asc&period=eq.9999-01", body: [] }],
  );
  assert.equal(r.code, 1);
  assert.match(r.stderr, /nessun numero approved\/published per 9999-01/);
});
