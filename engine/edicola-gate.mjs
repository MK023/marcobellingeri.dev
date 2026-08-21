// engine/edicola-gate.mjs
// Merge automatico della card, lato decisione: legge su stdin la risposta di
// `gh api .../check-runs` e stampa su stdout l'azione (`mergia` | `aspetta` |
// `ferma`); il motivo va su stderr, cioe' nel log del run. Chi interroga
// GitHub, aspetta e mergia e' il workflow edicola-card — separare decisione
// (testabile a secco) ed esecuzione e' la stessa forma di advance.mjs.
// Run: gh api "...check-runs" | node engine/edicola-gate.mjs <statoMerge> <tentativiRimasti>
import { readFileSync } from "node:fs";
import { decidiMerge } from "./lib/gate-merge.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

catchTopLevel("edicola-gate");

const [statoMerge, tentativi] = process.argv.slice(2);
if (!statoMerge || tentativi === undefined) {
  console.error("uso: gh api <...>/check-runs | node engine/edicola-gate.mjs <statoMerge> <tentativiRimasti>");
  process.exit(2);
}

const dati = JSON.parse(readFileSync(0, "utf8"));
const d = decidiMerge({
  checkRuns: dati.check_runs ?? dati,
  richiesti: ["test", "build-e-csp", "db-rebuild"],
  statoMerge,
  tentativiRimasti: Number(tentativi),
});

console.error(logsafe(d.motivo));
console.log(d.azione);
