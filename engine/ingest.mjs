// Canale 1 — DISCOVERY. Valyu sul verticale -> signals (stage='discovery').
// Uso: doppler run -- node engine/ingest.mjs <vertical> [--dry]
//
// Regole editoriali (ADR-0004 + memoria b2-editorial-source-model):
//  - qui entra SOLO la discovery on-vertical (lead grezzi), filtrata dal
//    relevance_threshold di Valyu. tier/independent restano NULL.
//  - il VERIFY (promozione a stage='verify' + tier 1/2/3 + independent) è il
//    passo editoriale human-in-the-loop: assegnare un tier da un dominio, in
//    automatico, sarebbe inaffidabile e minerebbe la barra a 3 tier.
//  - si pubblica solo con >=1 fonte Tier-1 o Tier-2 indipendente (gate umano).
//  - raw_content è testo di terzi NON fidato: in generazione va trattato come
//    dato, mai come istruzioni.
import { select, insert } from "./lib/supabase.mjs";
import { search } from "./lib/valyu.mjs";

const vertical = process.argv[2];
const dry = process.argv.includes("--dry");
if (!vertical || vertical.startsWith("--")) {
  console.error("uso: doppler run -- node engine/ingest.mjs <vertical> [--dry]  (es. insurance)");
  process.exit(1);
}

// Discovery mirata sul verticale. Query <400 char (raccomandazione Valyu).
const query = `${vertical}: AI adoption, governance, risk and regulation — recent primary sources, surveys, official guidance`;
const results = await search(query, { maxResults: 10, relevanceThreshold: 0.5 });
console.log(`ingest: Valyu -> ${results.length} risultati (vertical=${vertical}).`);

const mapped = results
  .filter((r) => r.url)
  .map((r) => ({
    source_url: r.url,
    source_name: (r.title ?? r.source ?? "").slice(0, 200) || null,
    category: vertical,
    stage: "discovery",
    tier: null,
    independent: null,
    raw_content: (r.content ?? "").slice(0, 2000),
  }));

if (dry) {
  for (const m of mapped) console.log(`  [dry] ${m.source_url}  ·  ${m.source_name ?? "(no title)"}`);
  console.log(`ingest: --dry, ${mapped.length} signal mappati, nessuna scrittura.`);
  process.exit(0);
}

// find-or-create del numero draft per il periodo corrente (period è unique).
const period = new Date().toISOString().slice(0, 7); // YYYY-MM
let [issue] = await select(`issues?select=id,number,status&period=eq.${period}`);
if (!issue) {
  const nums = await select("issues?select=number");
  const number = nums.reduce((m, i) => Math.max(m, i.number), 0) + 1;
  [issue] = await insert("issues", [{ number, period, sector: vertical, status: "draft" }], { returning: true });
  console.log(`ingest: creato numero #${number} (${period}, ${vertical}) draft.`);
} else {
  console.log(`ingest: numero esistente per ${period} (status=${issue.status}).`);
}

// dedup: non reinserire url già presenti su questo numero.
const seen = new Set((await select(`signals?select=source_url&issue_id=eq.${issue.id}`)).map((s) => s.source_url));
const fresh = mapped.filter((m) => !seen.has(m.source_url)).map((m) => ({ ...m, issue_id: issue.id }));
if (fresh.length) await insert("signals", fresh);
console.log(`ingest: ${fresh.length} nuovi signal (discovery) su #${issue.number}. Verify+tier = passo editoriale.`);
