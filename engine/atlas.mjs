// engine/atlas.mjs
// Aggiorna astro-project/src/data/radar-atlas.js coi case study di MITRE ATLAS.
//
// ATLAS e' una TASSONOMIA, non un flusso di bollettini: poche release l'anno.
// Quindi il dato si scarica qui e si committa, invece di pesare su /api/radar a
// ogni richiesta — il Worker e' zero-dipendenze e non ha un parser YAML, e i
// 626 KB del file supererebbero comunque TETTO_UPSTREAM.
//
// Run: node engine/atlas.mjs
import { readFile, writeFile } from "node:fs/promises";
import { estraiCasi, prossimoSymlink } from "./lib/atlas.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

catchTopLevel("atlas");

const BASE = "https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/";
const FILE = new URL("../astro-project/src/data/radar-atlas.js", import.meta.url);
// Il Radar ne mostra MAX_ITEMS (5); 12 lasciano margine senza gonfiare il bundle.
const MAX = 12;

// Segue la catena di symlink (vedi prossimoSymlink) invece di pinnare la
// versione: pinnandola il dato invecchia in silenzio, ed e' esattamente come
// `dist/ATLAS.yaml` e' diventato deprecato restando scaricabile e identico
// all'aspetto.
const scarica = async (percorso, salti = 3) => {
  // `redirect: 'manual'` come nel Worker (#129): il dato di cui mostriamo la
  // licenza deve arrivare dall'origine dichiarata, non da un dirottamento.
  const r = await fetch(BASE + percorso, { signal: AbortSignal.timeout(30_000), redirect: 'manual' });
  if (!r.ok) throw new Error(`atlas: ${percorso} -> HTTP ${r.status}`);
  const testo = await r.text();

  const prossimo = prossimoSymlink(testo, percorso);
  if (!prossimo) return testo;
  if (salti <= 0) throw new Error("atlas: catena di symlink troppo lunga");
  return scarica(prossimo, salti - 1);
};

const yaml = await scarica("ATLAS-latest.yaml");
if (!yaml.startsWith("format-version:")) {
  throw new Error("atlas: il file non ha l'intestazione v6 attesa — formato cambiato");
}
// logsafe alla nascita del valore: e' dato di rete e finisce nei log e nel
// file generato — sanificato una volta, pulito ovunque (S5145).
const versione = logsafe(yaml.match(/^ {2}version: '([^']+)'/m)?.[1] ?? 'sconosciuta');

const casi = estraiCasi(yaml, { max: MAX });
// Zero case study da un file che si scarica bene e' il silenzio peggiore:
// il Radar mostrerebbe uno strato vivo e vuoto. Meglio rompere qui.
if (casi.length === 0) throw new Error("atlas: zero case study estratti — formato cambiato");
const precedenti = await import(FILE.href)
  .then((m) => m.ATLAS_CASI.length)
  .catch(() => 0);
if (casi.length < precedenti) {
  throw new Error(`atlas: regressione — ${casi.length} case study contro i ${precedenti} committati`);
}

// Un oggetto per riga, compatto. Con l'indentazione a 2 ogni case study diventa
// un blocco di 6 righe identico nella forma agli altri, e il rilevatore di
// copia-incolla di Sonar ci legge 71 righe duplicate su 78 (misurato sulla PR
// #131: 16% sul new code, soglia 3%). Compattando, ogni riga e' unica per
// contenuto e la duplicazione sparisce davvero invece di essere esclusa dal
// gate. Una riga per voce, cosi' il diff di una release resta leggibile.
const righe = casi.map((c) => `  ${JSON.stringify(c)},`).join("\n");
const contenuto = `// Generato da engine/atlas.mjs — non modificare a mano.
// Fonte: MITRE ATLAS ${versione} — Apache License 2.0, Copyright 2021-2026 MITRE.
// Rigenerare quando MITRE pubblica una release: \`node engine/atlas.mjs\`.
export const ATLAS_VERSIONE = ${JSON.stringify(versione)};
export const ATLAS_CASI = [
${righe}
];
`;

// Confronto sul CONTENUTO del file, non sui soli dati: cosi' anche un cambio di
// formato come questo viene riscritto invece di passare per "nessuna novita'".
const prima = await readFile(FILE, "utf8").catch(() => null);
if (prima === contenuto) {
  console.log(`atlas: nessuna novita' (ATLAS ${versione}, ${casi.length} case study)`);
} else {
  await writeFile(FILE, contenuto);
  console.log(`atlas: scritti ${casi.length} case study (ATLAS ${versione})`);
}
