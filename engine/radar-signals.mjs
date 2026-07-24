// Radar -> signals: aggancia i bollettini del Radar al numero draft corrente
// come candidati-prova (stage='discovery'). Gira DOPO ingest nello stesso
// workflow: e' ingest che crea il numero — se per il periodo non c'e' un
// draft, qui si esce a mani vuote e senza errore, non si crea niente.
// Uso: doppler run -- node engine/radar-signals.mjs [--dry]
import { select, insert, pg } from "./lib/supabase.mjs";
import { mapRadar } from "./lib/radar-signals.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

catchTopLevel("radar-signals");

const API = "https://marcobellingeri.dev/api/radar";

async function main() {
  const dry = process.argv.includes("--dry");

  // redirect manual, come ovunque: il dato deve arrivare dall'origine dichiarata.
  const r = await fetch(API, { signal: AbortSignal.timeout(15_000), redirect: "manual" });
  if (!r.ok) throw new Error(`radar-signals: /api/radar -> HTTP ${r.status}`);
  const { fonti } = await r.json();
  const mapped = mapRadar(fonti);
  console.log(`radar-signals: ${mapped.length} bollettini dal Radar.`);

  if (dry) {
    for (const m of mapped) console.log(`  [dry] ${logsafe(m.source_url)}  ·  ${logsafe(m.source_name)}`);
    console.log(`radar-signals: --dry, nessuna scrittura.`);
    return;
  }

  const period = new Date().toISOString().slice(0, 7);
  const [issue] = await select(pg`issues?select=id,number,status&period=eq.${period}`);
  if (!issue) {
    console.log(`radar-signals: nessun numero per ${period} — l'ingest non e' ancora passato, esco senza scrivere.`);
    return;
  }

  // Stesso dedup di ingest: gli url gia' sul numero non rientrano (constraint 0005
  // come rete di sicurezza a DB).
  const seen = new Set((await select(pg`signals?select=source_url&issue_id=eq.${issue.id}`)).map((s) => s.source_url));
  const fresh = mapped.filter((m) => !seen.has(m.source_url)).map((m) => ({ ...m, issue_id: issue.id }));
  if (fresh.length) await insert("signals", fresh);
  console.log(`radar-signals: ${fresh.length} nuovi candidati-prova su #${logsafe(issue.number)} (${seen.size} gia' visti). Verify+tier = passo editoriale.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
