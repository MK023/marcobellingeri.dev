// Read-end del RAG (healthcheck/ops): query -> embed(query) -> match_article_chunks.
// La RPC filtra a `published` a prescindere dal chiamante → un draft non è mai
// retrievabile (prova del gate). NON è l'endpoint pubblico C1 (quello arriva con
// rate-limit + guardrail + disclosure AI Act, vedi roadmap): qui è solo CLI locale.
// Uso: doppler run -- node engine/retrieve.mjs "<query>" [it|en]
import { rpc } from "./lib/supabase.mjs";
import { embed, toVector } from "./lib/voyage.mjs";

const query = process.argv[2];
const locale = process.argv[3] ?? null;
if (!query) {
  console.error('uso: doppler run -- node engine/retrieve.mjs "<query>" [it|en]');
  process.exit(1);
}

const [qvec] = await embed([query], "query"); // input_type=query (asimmetrico rispetto ai document)
const rows = await rpc("match_article_chunks", {
  query_embedding: toVector(qvec),
  match_threshold: 0.3,
  match_count: 5,
  filter_locale: locale,
});

console.log(`retrieve: ${rows.length} match per "${query}"${locale ? ` (${locale})` : ""}.`);
for (const m of rows) {
  console.log(`  ${m.similarity.toFixed(3)} [${m.locale}] ${m.content.slice(0, 80).replace(/\s+/g, " ")}…`);
}
