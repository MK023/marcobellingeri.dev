// engine/lib/perplexity.mjs
// Client Perplexity Sonar. Le citazioni sono incluse nella risposta (nessun costo extra).
// Zero-dep: fetch nativo. Il match host/citazione vive in urlmatch.mjs.
// NB: il nome del campo citazioni (citations vs search_results) va confermato contro
// una chiamata reale / la doc prima del primo run in produzione; qui gestiamo entrambe.
import { findCitation } from "./urlmatch.mjs";

const DOMAIN = "marcobellingeri.dev";

// Interroga Sonar con `question`. Ritorna { present, rank, matchedUrl, raw }.
export async function checkCitation(question) {
  const { PERPLEXITY_API_KEY } = process.env;
  if (!PERPLEXITY_API_KEY) throw new Error("missing env: PERPLEXITY_API_KEY (usa `doppler run`)");
  const r = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: question }] }),
  });
  if (!r.ok) throw new Error(`perplexity ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const citations = j.citations ?? (j.search_results ?? []).map((s) => s?.url).filter(Boolean);
  const hit = findCitation(citations, DOMAIN);
  return { ...hit, raw: JSON.stringify(j).slice(0, 30_000) };
}
