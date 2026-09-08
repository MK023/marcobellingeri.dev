// engine/advance.mjs
// Magazine automatico, lato decisione: legge lo stato della pipeline a DB e
// stampa su stdout lo stadio da eseguire (`export <period>` | `embed` |
// `generate <sector>` | `niente`). Chi esegue è il workflow magazine-advance:
// separare decisione (testabile a secco) ed esecuzione tiene i gate umani
// — verify e approvazione in Studio — esattamente dove sono.
// Run: doppler run -- node engine/advance.mjs
import { select, pg } from "./lib/supabase.mjs";
import { decidi } from "./lib/advance.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("advance");

// Il numero più avanti nella pipeline vince; uno per run (cadenza giornaliera).
const [apr] = await select("issues?select=id,period&status=eq.approved&order=number.asc&limit=1");
let approvato = null;
if (apr) {
  const [art] = await select(pg`articles?select=id&issue_id=eq.${apr.id}&limit=1`);
  const [emb] = art
    ? await select(pg`article_chunks?select=id&article_id=eq.${art.id}&embedding=not.is.null&limit=1`)
    : [];
  approvato = { period: apr.period, conArticolo: Boolean(art), embedded: Boolean(emb) };
}

const [boz] = approvato ? [] : await select("issues?select=id,sector,created_at&status=eq.draft&order=number.asc&limit=1");
let bozza = null;
if (boz) {
  const [art] = await select(pg`articles?select=id,created_at&issue_id=eq.${boz.id}&limit=1`);
  // La barra editoriale non si riscrive qui: vive nella vista verified_signals
  // (migration 0012), la stessa che il gate a DB interroga.
  const [sig] = await select(pg`verified_signals?select=id&issue_id=eq.${boz.id}&limit=1`);
  // L'attesa parte da quando il gate e' diventato apribile: la bozza generata
  // aspetta dalla nascita dell'articolo, i signal dalla nascita del numero.
  bozza = {
    sector: boz.sector,
    conArticolo: Boolean(art),
    conSegnaliVerificati: Boolean(sig),
    attesaDa: art?.created_at ?? boz.created_at,
  };
}

// period/sector arrivano dal DB: nei log (e nello stdout che il workflow parsa)
// solo via logsafe — S5145, come ovunque nell'engine.
const d = decidi({ approvato, bozza });
console.log(logsafe([d.stage, d.arg].filter(Boolean).join(" ")));
if (d.motivo) console.error(`advance: ${logsafe(d.motivo)}`);
// Contratto con il workflow: la riga ATTESA= c'e' sempre, vuota quando non si
// aspetta nessuno. Un grep che non trova niente sotto `set -o pipefail` ferma lo
// step, ed e' la stessa ragione per cui devto stampa sempre DOMANI=.
console.error(`ATTESA=${d.giorni ?? ""}`);
