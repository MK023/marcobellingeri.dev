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

const [boz] = approvato ? [] : await select("issues?select=id,sector&status=eq.draft&order=number.asc&limit=1");
let bozza = null;
if (boz) {
  const [art] = await select(pg`articles?select=id&issue_id=eq.${boz.id}&limit=1`);
  const [sig] = await select(
    pg`signals?select=id&issue_id=eq.${boz.id}&stage=eq.verify` +
      pg`&or=(tier.eq.1,and(tier.eq.2,independent.is.true))&limit=1`,
  );
  bozza = { sector: boz.sector, conArticolo: Boolean(art), conSegnaliVerificati: Boolean(sig) };
}

// period/sector arrivano dal DB: nei log (e nello stdout che il workflow parsa)
// solo via logsafe — S5145, come ovunque nell'engine.
const d = decidi({ approvato, bozza });
console.log(logsafe([d.stage, d.arg].filter(Boolean).join(" ")));
if (d.motivo) console.error(`advance: ${logsafe(d.motivo)}`);
