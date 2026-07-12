// Canale 1 — chunk + embed dei testi degli articoli in article_chunks.
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
    const trans = await select(pg`article_translations?article_id=eq.${art.id}&select=locale,title,problem,approach,result,lesson`);
    const rows = [];
    for (const t of trans) {
      // Indicizza il caso INTERO (titolo + problema/approccio/risultato/lezione),
      // non un solo campo: il RAG deve poter richiamare tutto il case study.
      const text = [t.title, t.problem, t.approach, t.result, t.lesson].filter(Boolean).join("\n\n");
      if (!text) continue;
      chunk(text).forEach((content, i) => rows.push({ article_id: art.id, locale: t.locale, chunk_index: i, content }));
    }
    if (!rows.length) {
      console.log(`embed: ${art.slug} — nessun testo, skip.`);
      return 0;
    }
    const vecs = await embed(rows.map((r) => r.content)); // input_type=document
    rows.forEach((r, i) => { r.embedding = toVector(vecs[i]); });
    await remove("article_chunks", pg`article_id=eq.${art.id}`);
    try {
      await insert("article_chunks", rows);
    } catch (e) {
      // delete-then-insert non è atomico: qui il delete è già passato e l'articolo
      // è rimasto SENZA chunk (fuori dal RAG finché non si ri-esegue). Va urlato.
      // ponytail: la vera atomicità richiede una RPC transazionale — quando servirà.
      console.error(`embed: ${art.slug} — insert fallito DOPO il delete: articolo senza chunk, RI-ESEGUI embed.mjs (${e.message})`);
      throw e;
    }
    const locales = [...new Set(rows.map((r) => r.locale))].join("+");
    console.log(`embed: ${art.slug} — ${rows.length} chunk (${locales}).`);
    total += rows.length;
    return rows.length;
  });
}
console.log(`embed: fatto, ${total} chunk totali.`);
await trace.flush();
