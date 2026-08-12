// engine/visibility.mjs
// Monitor discoverability. Legge le query attive, interroga Perplexity e ChatGPT (AEO)
// e GSC (SEO), scrive le osservazioni su Supabase, stampa un referto prescrittivo.
// Run: doppler run -- node engine/visibility.mjs [--limit N]
import { select, insert, pg } from "./lib/supabase.mjs";
import { checkCitation } from "./lib/perplexity.mjs";
import { checkCitation as checkCitationOpenai } from "./lib/openai.mjs";
import { querySearchAnalytics, queryTotals, defaultWindow } from "./lib/gsc.mjs";
import { renderReferto } from "./lib/referto.mjs";
import { startTrace } from "./lib/langfuse.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("visibility");

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

// Le fonti AEO. `engine` e' il valore che finisce in `visibility_observations`
// (CHECK in migration 0013): aggiungerne una qui senza allargare il CHECK fa
// fallire l'insert, non il monitor.
const AEO = [
  { engine: "perplexity", check: checkCitation },
  { engine: "chatgpt", check: checkCitationOpenai },
];

// Run precedente (per il trend del referto): best-effort, un primo run o una
// lettura fallita non fermano il monitor — semplicemente niente trend.
// La chiave e' `engine:query_id` e non `query_id`: due fonti AEO sulla stessa
// query si sovrascriverebbero a vicenda, e il referto stamperebbe una 🆕 su una
// fonte che non era cambiata.
const prevAeo = new Map(); // `${engine}:${query_id}` -> present
const prevGsc = new Map(); // query GSC -> position
try {
  const [ultimo] = await select(pg`visibility_observations?select=run_at&order=run_at.desc&limit=1`);
  if (ultimo) {
    const prev = await select(
      pg`visibility_observations?select=engine,query_id,present,rank,detail&run_at=eq.${ultimo.run_at}`,
    );
    for (const o of prev) {
      if (AEO.some((f) => f.engine === o.engine)) prevAeo.set(`${o.engine}:${o.query_id}`, o.present);
      // solo la vista `query`: le righe per pagina/proprietà non hanno un
      // posizionamento per query da confrontare.
      if (o.engine === "gsc" && o.detail?.vista !== "pagina" && o.detail?.query) {
        prevGsc.set(o.detail.query, o.rank);
      }
    }
  }
} catch (e) {
  console.error(`visibility: run precedente non leggibile (niente trend): ${logsafe(e.message)}`);
}

// --- AEO: una query alla volta, una fonte alla volta ---
// ChatGPT si misura per PROXY: l'API OpenAI con ricerca web, non chatgpt.com.
// La riga che lo dichiara sta nel referto, dove il dato viene letto.
const aeo = { perplexity: [], chatgpt: [] };
for (const { engine, check } of AEO) {
  for (const q of queries) {
    try {
      const hit = await trace.span(`${engine}: ${q.text}`, { input: { text: q.text } }, async () => check(q.text));
      await insert("visibility_observations", [{
        run_at: runAt, engine, query_id: q.id,
        present: hit.present, rank: hit.rank,
        detail: { matched_url: hit.matchedUrl }, raw: hit.raw,
      }]);
      aeo[engine].push({
        queryText: logsafe(q.text), contentRef: q.content_ref, present: hit.present, rank: hit.rank,
        prevPresent: prevAeo.get(`${engine}:${q.id}`),
      });
      console.log(`visibility: ${engine} "${logsafe(q.text)}" — ${hit.present ? "citato" : "non citato"}.`);
    } catch (e) {
      console.error(`visibility: ${engine} fallita "${logsafe(q.text)}": ${logsafe(e.message)}`);
      continue; // una query rotta non ferma il monitor, e una fonte rotta non ferma l'altra
    }
  }
}

// --- SEO: GSC, tre viste della stessa finestra ---
// Le query da sole non bastano: sotto una certa soglia di traffico Google le
// omette e ne tornano zero, con il job verde e il referto muto (misurato il
// 12-08-2026: 30 impression in un mese, 0 righe per query, 5 per pagina).
// I totali di proprietà non hanno soglia, le pagine la superano molto prima:
// insieme dicono se il silenzio è "non ti vede nessuno" o "sei sotto soglia".
const finestra = defaultWindow();
let gsc = [];
let gscTotali = null;
let gscPagine = [];
try {
  gscTotali = await queryTotals(finestra);
  const rows = await querySearchAnalytics(finestra);
  const pagine = await querySearchAnalytics({ ...finestra, dimensions: ["page"] });
  // `logsafe` QUI e non solo nel renderer: query e URL arrivano da Google, e da
  // queste strutture finiscono dritti in un log (S5145). Sanificare al confine
  // significa che nessun chiamante del referto puo' dimenticarsene; il renderer
  // lo rifa lo stesso, perche' e' idempotente ed e' l'ultima difesa.
  gsc = rows.map((r) => ({
    query: logsafe(r.query), position: r.position, prevPosition: prevGsc.get(r.query),
  }));
  gscPagine = pagine.map((r) => ({
    page: logsafe(r.page), impressions: r.impressions, position: r.position,
  }));

  // `engine` resta la FONTE ("gsc"), non la vista: la colonna ha un CHECK che
  // ammette solo perplexity|gsc, e allargarlo per tre etichette vorrebbe dire
  // una migration sul database di produzione per un dato che sta benissimo nel
  // `detail`. La vista si legge da `detail.vista`.
  const obs = rows.map((r) => ({
    run_at: runAt, engine: "gsc", query_id: null, present: true, rank: r.position,
    detail: { vista: "query", query: r.query, page: r.page, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr },
    raw: null,
  }));
  // Anche le viste senza query vanno in archivio: sono l'unica serie storica
  // che esiste finché le query restano sotto soglia.
  for (const p of gscPagine) {
    obs.push({
      run_at: runAt, engine: "gsc", query_id: null, present: true, rank: p.position,
      detail: { vista: "pagina", page: p.page, impressions: p.impressions }, raw: null,
    });
  }
  if (gscTotali) {
    obs.push({
      run_at: runAt, engine: "gsc", query_id: null, present: true, rank: gscTotali.position,
      detail: { vista: "proprieta", ...gscTotali }, raw: null,
    });
  }
  if (obs.length) await insert("visibility_observations", obs);
  console.log(
    `visibility: gsc — ${logsafe(rows.length)} query, ${logsafe(gscPagine.length)} pagine, ` +
      `proprietà: ${gscTotali ? logsafe(gscTotali.impressions) + " impression" : "nessun dato"}.`,
  );
} catch (e) {
  console.error(`visibility: gsc fallita: ${logsafe(e.message)}`); // il segnale SEO manca, l'AEO resta
}

// Sanificazione RIGA PER RIGA e non sull'intero referto: `logsafe` sostituisce
// i caratteri di controllo con spazi, quindi applicarlo al testo intero
// appiattirebbe il markdown in una riga sola. Spezzando prima e riunendo dopo, i
// soli "\n" che restano sono i nostri — nessun dato di Google puo' fabbricare
// una riga di log, qualunque cosa abbia fatto il renderer a monte.
const referto = renderReferto({ runAt, ...aeo, gsc, gscTotali, gscPagine })
  .split("\n")
  .map(logsafe)
  .join("\n");
console.log("\n" + referto);
console.log("\nvisibility: fatto.");
await trace.flush();
