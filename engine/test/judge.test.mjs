// Il judge è un GATE: la politica di cosa boccia sta in lib/judge.mjs (pura,
// testata a secco) — un gate senza politica scritta e verificata è un futuro
// continue-on-error. Il giro completo (CLI) gira con fetch mockata, zero rete.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { parseCaso, verdetto, CRITERI } from "../lib/judge.mjs";
import { runEngine } from "./helpers/spawn.mjs";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Frontmatter nella forma REALE scritta da export.mjs (scalari JSON).
const CASO = (lang) => `---
lang: ${JSON.stringify(lang)}
number: 1
sector: "insurance"
month: "Luglio 2026"
date: "2026-07-01"
title: "Un titolo con \\"virgolette\\" dentro"
problem: "Il problema, coi numeri: 15 stati."
approach: "L'approccio."
result: "Il risultato: bulletin approvato a dicembre 2023."
lesson: "La lezione trasferibile."
---
`;

// ---- parseCaso ----------------------------------------------------------

test("parseCaso: legge i campi del frontmatter reale, virgolette escapate incluse", () => {
  const c = parseCaso(CASO("it"));
  assert.equal(c.lang, "it");
  assert.equal(c.title, 'Un titolo con "virgolette" dentro');
  assert.match(c.problem, /15 stati/);
  assert.ok(c.lesson.length > 0);
});

test("parseCaso: campo mancante o frontmatter rotto -> throw con nome del campo", () => {
  assert.throws(() => parseCaso("niente frontmatter"), /frontmatter/);
  assert.throws(() => parseCaso('---\nlang: "it"\ntitle: "solo titolo"\n---\n'), /problem/);
});

// ---- verdetto: LA politica del gate -------------------------------------

const TUTTI_5 = Object.fromEntries(CRITERI.map((c) => [c, { voto: 5, motivo: "ok" }]));

test("verdetto: tutto a 5 -> promosso, zero motivi", () => {
  const v = verdetto({ difetti: [], criteri: TUTTI_5 });
  assert.equal(v.esito, "promosso");
  assert.deepEqual(v.motivi, []);
});

test("verdetto: un criterio <= 2 -> bocciato, col motivo del giudice", () => {
  const criteri = { ...TUTTI_5, ancoraggio: { voto: 2, motivo: "cifre sospese nel result" } };
  const v = verdetto({ difetti: [], criteri });
  assert.equal(v.esito, "bocciato");
  assert.match(v.motivi.join(" "), /ancoraggio.*cifre sospese/);
});

test("verdetto: un difetto deterministico boccia anche con rubrica perfetta", () => {
  const v = verdetto({ difetti: ["manca il file EN"], criteri: TUTTI_5 });
  assert.equal(v.esito, "bocciato");
  assert.match(v.motivi.join(" "), /manca il file EN/);
});

test("verdetto: il 3 è un avviso, non una bocciatura (il gate boccia il rotto, non il migliorabile)", () => {
  const criteri = { ...TUTTI_5, stile: { voto: 3, motivo: "qualche riempitivo" } };
  const v = verdetto({ difetti: [], criteri });
  assert.equal(v.esito, "promosso");
  assert.match(v.avvisi.join(" "), /stile/);
});

test("verdetto: criterio assente dalla risposta del modello -> bocciato (fail-closed)", () => {
  const { ancoraggio: _via, ...monchi } = TUTTI_5;
  const v = verdetto({ difetti: [], criteri: monchi });
  assert.equal(v.esito, "bocciato");
  assert.match(v.motivi.join(" "), /ancoraggio/);
});

// ---- CLI, giro completo con fetch mockata --------------------------------

// generateJson estrae un blocco `text` e lo parsa (structured output).
const rubrica = (over = {}) => ({
  content: [{ type: "text", text: JSON.stringify({
    criteri: {
      parita: { voto: 5, motivo: "ok" }, ancoraggio: { voto: 5, motivo: "ok" },
      answer_first: { voto: 4, motivo: "ok" }, stile: { voto: 4, motivo: "ok" },
      lezione: { voto: 5, motivo: "ok" },
      ...over,
    },
    nota: "solido",
  }) }],
  usage: { input_tokens: 10, output_tokens: 10 },
});

test("judge: period malformato -> exit 1 senza toccare la rete", () => {
  const r = runEngine(["engine/judge.mjs", "../evil"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /uso:/);
});

test("judge: numero promosso -> exit 0 e referto con i voti", () => {
  const routes = [
    { match: "api.anthropic.com/v1/messages/count_tokens", method: "POST", body: { input_tokens: 500 } },
    { match: "api.anthropic.com/v1/messages", method: "POST", body: rubrica() },
  ];
  const r = runEngine(["engine/judge.mjs", "2026-07"], routes, { ANTHROPIC_API_KEY: "k" });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /PROMOSSO/);
  assert.match(r.stdout, /ancoraggio/);
});

test("judge: un voto a 2 -> exit 1 e il motivo nel referto", () => {
  const routes = [
    { match: "api.anthropic.com/v1/messages/count_tokens", method: "POST", body: { input_tokens: 500 } },
    { match: "api.anthropic.com/v1/messages", method: "POST", body: rubrica({ parita: { voto: 2, motivo: "IT ed EN divergono sui numeri" } }) },
  ];
  const r = runEngine(["engine/judge.mjs", "2026-07"], routes, { ANTHROPIC_API_KEY: "k" });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /BOCCIATO/);
  assert.match(r.stdout, /divergono sui numeri/);
});
