// engine/atlas.mjs
// Aggiorna astro-project/src/data/radar-atlas.js coi case study di MITRE ATLAS.
//
// ATLAS e' una TASSONOMIA, non un flusso di bollettini: poche release l'anno.
// Quindi il dato si scarica qui e si committa, invece di pesare su /api/radar a
// ogni richiesta — il Worker e' zero-dipendenze e non ha un parser YAML, e i
// 626 KB del file supererebbero comunque TETTO_UPSTREAM.
//
// Run: node engine/atlas.mjs
import { writeFile } from "node:fs/promises";
import { estraiCasi } from "./lib/atlas.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

catchTopLevel("atlas");

const BASE = "https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/";
const FILE = new URL("../astro-project/src/data/radar-atlas.js", import.meta.url);
// Il Radar ne mostra MAX_ITEMS (5); 12 lasciano margine senza gonfiare il bundle.
const MAX = 12;

// `dist/ATLAS-latest.yaml` e' un SYMLINK: via raw torna il percorso di
// destinazione come testo (20 byte), non i dati. Oggi la catena e' doppia:
// ATLAS-latest.yaml -> v6/ATLAS-latest.yaml -> v6/ATLAS-2026.06.yaml.
// Seguirla invece di pinnare la versione: pinnandola il dato invecchia in
// silenzio, ed e' il modo in cui `dist/ATLAS.yaml` e' diventato deprecato
// restando scaricabile e identico all'aspetto.
const scarica = async (percorso, salti = 3) => {
  const r = await fetch(BASE + percorso, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`atlas: ${percorso} -> HTTP ${r.status}`);
  const testo = await r.text();

  const target = testo.trim();
  const isSymlink = /^[\w.-]+(?:\/[\w.-]+)*\.yaml$/.test(target) && !target.includes("..");
  if (!isSymlink) return testo;
  if (salti <= 0) throw new Error("atlas: catena di symlink troppo lunga");
  const dir = percorso.includes("/") ? percorso.slice(0, percorso.lastIndexOf("/") + 1) : "";
  return scarica(dir + target, salti - 1);
};

const yaml = await scarica("ATLAS-latest.yaml");
if (!yaml.startsWith("format-version:")) {
  throw new Error("atlas: il file non ha l'intestazione v6 attesa — formato cambiato");
}
const versione = yaml.match(/^ {2}version: '([^']+)'/m)?.[1] ?? null;

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

const contenuto = `// Generato da engine/atlas.mjs — non modificare a mano.
// Fonte: MITRE ATLAS ${versione} — Apache License 2.0, Copyright 2021-2026 MITRE.
// Rigenerare quando MITRE pubblica una release: \`node engine/atlas.mjs\`.
export const ATLAS_VERSIONE = ${JSON.stringify(versione)};
export const ATLAS_CASI = ${JSON.stringify(casi, null, 2)};
`;

const prima = await import(FILE.href)
  .then((m) => JSON.stringify(m.ATLAS_CASI))
  .catch(() => null);
if (prima === JSON.stringify(casi)) {
  console.log(`atlas: nessuna novita' (ATLAS ${versione}, ${casi.length} case study)`);
} else {
  await writeFile(FILE, contenuto);
  console.log(`atlas: scritti ${casi.length} case study (ATLAS ${versione})`);
}
