import { test } from "node:test";
import assert from "node:assert/strict";
import { STUDIO, estraiCasi } from "../lib/atlas.mjs";

// Forma reale del file dist/v6/ATLAS-2026.06.yaml, ridotta: una technique (da
// ignorare), due case study, e lo stesso id ripetuto sotto `relationships:` —
// che nel file vero vale 63 blocchi su 126.
//
// Al blocco `relationships:` qui sotto e' stato aggiunto un `name:` che nel file
// del 2026-06 NON c'e'. E' deliberato: senza, i blocchi relationships cadono da
// soli perche' senza titolo, il marcatore `object-type` non viene mai messo alla
// prova e il test resta verde anche cancellandolo. Con il `name:` il test
// verifica il discriminatore vero invece di un accidente del formato — che e'
// esattamente cio' che si rompe quando MITRE cambia versione (v5 -> v6 e' di
// due mesi fa).
const YAML = `format-version: 6.0.0
techniques:
  AML.T0051:
    name: LLM Prompt Injection
    id: AML.T0051
    object-type: technique
case-studies:
  AML.CS0000:
    name: Evasion of Deep Learning Detector for Malware C&C Traffic
    references:
    - id: ref-1
      title: URLNet paper
      url: https://arxiv.org/abs/1802.03162
    created-date: '2020-12-15'
    type: Exercise
    date: '2020-01-01'
    date-granularity: Year
    id: AML.CS0000
    object-type: case-study
  AML.CS0059:
    name: 'EchoLeak: Zero-Click Prompt Injection Targeting M365 Copilot'
    created-date: '2026-06-30'
    date: '2026-06-13'
    id: AML.CS0059
    object-type: case-study
relationships:
  AML.CS0000:
    name: Evasion of Deep Learning Detector for Malware C&C Traffic
    date: '2020-01-01'
    employs:
    - source: AML.CS0000
      target: AML.T0000.001
      relationship-type: employs
`;

test("atlas: raccoglie i case study e nient'altro", () => {
  const casi = estraiCasi(YAML);
  assert.equal(casi.length, 2, "technique e relationships non devono entrare");
  assert.deepEqual(
    casi.map((c) => c.id),
    ["AML.CS0059", "AML.CS0000"],
    "ordine per data discendente",
  );
});

test("atlas: il nome quotato perde le virgolette, l'url e' quello canonico", () => {
  const [primo] = estraiCasi(YAML);
  assert.equal(primo.titolo, "EchoLeak: Zero-Click Prompt Injection Targeting M365 Copilot");
  assert.equal(primo.url, `${STUDIO}AML.CS0059`);
  assert.equal(primo.data, "2026-06-13");
});

test("atlas: max taglia la lista", () => {
  assert.equal(estraiCasi(YAML, { max: 1 }).length, 1);
});

test("atlas: input che non e' ATLAS degrada a lista vuota, non esplode", () => {
  assert.deepEqual(estraiCasi("<!doctype html><html>Page not found</html>"), []);
  assert.deepEqual(estraiCasi("v6/ATLAS-latest.yaml"), []); // il symlink servito da raw
  assert.deepEqual(estraiCasi(""), []);
});
