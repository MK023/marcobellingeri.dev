// Canale 2 — radar competitor INTERNO. Firecrawl scrape delle fonti attive ->
// competitor_snapshots (uno per scrape, storico) -> competitor_chunks (embed RAG).
// Run: doppler run -- node engine/competitors.mjs
//
// ponytail: MVP scrape-and-store. changeTracking di Firecrawl ("riassumi solo se
// cambiato", ADR-0004) è l'upgrade per tagliare costo/rumore e deduplicare gli
// snapshot — si aggiunge quando la cadenza di run lo richiede.
import { select, insert, pg } from "./lib/supabase.mjs";
import { chunk, embed, toVector } from "./lib/voyage.mjs";
import { startTrace } from "./lib/langfuse.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("competitors");

const { FIRECRAWL_API_KEY } = process.env;

async function scrape(url) {
  if (!FIRECRAWL_API_KEY) throw new Error("missing env: FIRECRAWL_API_KEY (usa `doppler run`)");
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: [{ type: "markdown" }], onlyMainContent: true }),
  });
  if (!r.ok) throw new Error(`firecrawl ${r.status}: ${await r.text()}`);
  const j = await r.json();
  // Cap sul markdown: una pagina anomala non deve gonfiare la riga snapshot né
  // moltiplicare i chunk embeddati (ogni chunk = costo Voyage). 30k char ≈ 30
  // chunk, largo per qualsiasi pagina reale con onlyMainContent.
  const markdown = (j.data?.markdown ?? "").slice(0, 30_000);
  return { markdown, title: j.data?.metadata?.title ?? null, url: j.data?.metadata?.url ?? url };
}

// --limit N: scrape solo le prime N fonti attive (test/ops, controllo costo).
const limIdx = process.argv.indexOf("--limit");
const limit = limIdx > -1 ? Number(process.argv[limIdx + 1]) : null;
if (limIdx > -1 && (!Number.isInteger(limit) || limit < 1)) {
  // guardia anti-footgun: "--limit" senza valore scraperebbe TUTTO in silenzio (costo)
  console.error("--limit richiede un intero >= 1 (es. --limit 1)");
  process.exit(1);
}
const sources = await select(
  pg`competitor_sources?select=id,name,url&active=eq.true&order=name` + (limit ? pg`&limit=${limit}` : ""),
);
const conLimite = limit ? " (--limit " + logsafe(limit) + ")" : "";
console.log(`competitors: ${logsafe(sources.length)} fonti attive${conLimite}.`);
const trace = startTrace("competitor-radar", { metadata: { sources: sources.length } });

for (const s of sources) {
  try {
    await trace.span(s.name, { input: { url: s.url }, summarize: (n) => ({ chunks: n }) }, async () => {
      const hit = await scrape(s.url);
      if (!hit.markdown.trim()) {
        console.log(`competitors: ${s.name} — vuoto, skip.`);
        return 0;
      }
      const [snap] = await insert("competitor_snapshots", [{
        source_id: s.id,
        title: hit.title,
        url: hit.url,
        raw_content: hit.markdown,
        summary: hit.markdown.replace(/\s+/g, " ").trim().slice(0, 320),
      }], { returning: true });

      const parts = chunk(hit.markdown);
      const vecs = await embed(parts); // input_type=document
      const rows = parts.map((content, i) => ({ snapshot_id: snap.id, chunk_index: i, content, embedding: toVector(vecs[i]) }));
      await insert("competitor_chunks", rows);
      console.log(`competitors: ${s.name} — snapshot + ${rows.length} chunk.`);
      return rows.length;
    });
  } catch (e) {
    console.error(`competitors: fallito ${s.name}: ${e.message}`); // lo span registra ERROR
    continue; // una fonte rotta non ferma il radar
  }
}
console.log("competitors: fatto.");
await trace.flush();
