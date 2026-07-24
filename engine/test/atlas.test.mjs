import { test } from "node:test";
import assert from "node:assert/strict";
import { STUDIO, estraiCasi, prossimoSymlink } from "../lib/atlas.mjs";

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

// La catena di symlink e' la trappola vera: `dist/ATLAS.yaml` e' DEPRECATO e
// continua a scaricarsi identico all'aspetto, mentre il dato vivo sta due
// symlink piu' in la'. Chi non li segue serve un dato morto senza accorgersene.
test("atlas: segue la catena di symlink risolvendo relativo alla cartella", () => {
  assert.equal(prossimoSymlink("v6/ATLAS-latest.yaml\n", "ATLAS-latest.yaml"), "v6/ATLAS-latest.yaml");
  assert.equal(prossimoSymlink("ATLAS-2026.06.yaml", "v6/ATLAS-latest.yaml"), "v6/ATLAS-2026.06.yaml");
});

test("atlas: i dati veri non sono un symlink (la catena si ferma)", () => {
  assert.equal(prossimoSymlink(YAML, "v6/ATLAS-2026.06.yaml"), null);
  assert.equal(prossimoSymlink("format-version: 6.0.0\ncollection:\n", "x.yaml"), null);
});

// Il target arriva dalla RETE e finisce dentro un URL: deve restare un nome di
// file relativo, o sposterebbe la richiesta su un'altra origine.
test("atlas: un symlink che prova a uscire dalla cartella viene rifiutato", () => {
  for (const cattivo of [
    "../../../etc/passwd.yaml",
    "/etc/ATLAS.yaml",
    "https://evil.example/ATLAS.yaml",
    "v6/../../ATLAS.yaml",
  ]) {
    assert.equal(prossimoSymlink(cattivo, "dist/ATLAS-latest.yaml"), null, `passato: ${cattivo}`);
  }
});

test("atlas: input che non e' ATLAS degrada a lista vuota, non esplode", () => {
  assert.deepEqual(estraiCasi("<!doctype html><html>Page not found</html>"), []);
  assert.deepEqual(estraiCasi("v6/ATLAS-latest.yaml"), []); // il symlink servito da raw
  assert.deepEqual(estraiCasi(""), []);
});
