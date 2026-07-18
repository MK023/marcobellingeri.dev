// engine/visibility.mjs
// Monitor discoverability. Legge le query attive, interroga Perplexity (AEO) e GSC (SEO),
// scrive le osservazioni su Supabase, stampa un referto prescrittivo.
// Run: doppler run -- node engine/visibility.mjs [--limit N]
import { select, insert, pg } from "./lib/supabase.mjs";
import { checkCitation } from "./lib/perplexity.mjs";
import { querySearchAnalytics, defaultWindow } from "./lib/gsc.mjs";
import { renderReferto } from "./lib/referto.mjs";
import { startTrace } from "./lib/langfuse.mjs";
import { logsafe } from "./lib/logsafe.mjs";

// --limit N: interroga solo le prime N query attive (test/ops, controllo costo).
const limIdx = process.argv.indexOf("--limit");
const limit = limIdx > -1 ? Number(process.argv[limIdx + 1]) : null;
if (limIdx > -1 && (!Number.isInteger(limit) || limit < 1)) {
  console.error("--limit richiede un intero >= 1 (es. --limit 1)");
  process.exit(1);
}

const runAt = new Date().toISOString();
const queries = await select(
  pg`visibility_queries?select=id,text,content_ref&active=eq.true&order=created_at` +
    (limit ? pg`&limit=${limit}` : ""),
);
const conLimite = limit ? ` (--limit ${logsafe(limit)})` : "";
console.log(`visibility: ${logsafe(queries.length)} query attive${conLimite}.`);
const trace = startTrace("visibility-monitor", { metadata: { queries: queries.length } });

// --- AEO: Perplexity, una query alla volta ---
const perplexity = [];
for (const q of queries) {
  try {
    const hit = await trace.span(q.text, { input: { text: q.text } }, async () => checkCitation(q.text));
    await insert("visibility_observations", [{
      run_at: runAt, engine: "perplexity", query_id: q.id,
      present: hit.present, rank: hit.rank,
      detail: { matched_url: hit.matchedUrl }, raw: hit.raw,
    }]);
    perplexity.push({ queryText: q.text, contentRef: q.content_ref, present: hit.present, rank: hit.rank });
    console.log(`visibility: perplexity "${logsafe(q.text)}" — ${hit.present ? "citato" : "non citato"}.`);
  } catch (e) {
    console.error(`visibility: perplexity fallita "${logsafe(q.text)}": ${logsafe(e.message)}`);
    continue; // una query rotta non ferma il monitor
  }
}

// --- SEO: GSC, una chiamata per l'intera proprietà ---
let gsc = [];
try {
  const rows = await querySearchAnalytics(defaultWindow());
  gsc = rows.map((r) => ({ query: r.query, position: r.position }));
  const obs = rows.map((r) => ({
    run_at: runAt, engine: "gsc", query_id: null, present: true, rank: r.position,
    detail: { query: r.query, page: r.page, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr },
    raw: null,
  }));
  if (obs.length) await insert("visibility_observations", obs);
  console.log(`visibility: gsc — ${logsafe(rows.length)} righe.`);
} catch (e) {
  console.error(`visibility: gsc fallita: ${logsafe(e.message)}`); // il segnale SEO manca, l'AEO resta
}

console.log("\n" + renderReferto({ runAt, perplexity, gsc }));
console.log("\nvisibility: fatto.");
await trace.flush();
