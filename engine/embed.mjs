// Canale 1 — chunk + embed dei body degli articoli in article_chunks.
// Idempotente per articolo: rimpiazza i chunk (delete-then-insert) così una
// riesecuzione dopo un'edit del testo riallinea gli embedding senza doppioni.
// Run: doppler run -- node engine/embed.mjs
import { select, insert, remove, pg } from "./lib/supabase.mjs";
import { chunk, embed, toVector } from "./lib/voyage.mjs";
import { startTrace } from "./lib/langfuse.mjs";

const trace = startTrace("embed-articles");
const articles = await select("articles?select=id,slug");
if (!articles.length) {
  console.log("embed: nessun articolo da embeddare.");
  await trace.flush();
  process.exit(0);
}

let total = 0;
for (const art of articles) {
  await trace.span(`embed:${art.slug}`, { summarize: (n) => ({ chunks: n }) }, async () => {
    const trans = await select(pg`article_translations?article_id=eq.${art.id}&select=locale,title,problem,application,solution,body`);
    const rows = [];
    for (const t of trans) {
      // Indicizza il caso INTERO (titolo + problema/approccio/risultato/lezione),
      // non un solo campo: il RAG deve poter richiamare tutto il case study.
      const text = [t.title, t.problem, t.application, t.solution, t.body].filter(Boolean).join("\n\n");
      if (!text) continue;
      chunk(text).forEach((content, i) => rows.push({ article_id: art.id, locale: t.locale, chunk_index: i, content }));
    }
    if (!rows.length) {
      console.log(`embed: ${art.slug} — nessun body, skip.`);
      return 0;
    }
    const vecs = await embed(rows.map((r) => r.content)); // input_type=document
    rows.forEach((r, i) => { r.embedding = toVector(vecs[i]); });
    await remove("article_chunks", pg`article_id=eq.${art.id}`);
    await insert("article_chunks", rows);
    const locales = [...new Set(rows.map((r) => r.locale))].join("+");
    console.log(`embed: ${art.slug} — ${rows.length} chunk (${locales}).`);
    total += rows.length;
    return rows.length;
  });
}
console.log(`embed: fatto, ${total} chunk totali.`);
await trace.flush();
