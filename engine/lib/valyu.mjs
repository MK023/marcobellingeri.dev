// Client Valyu (motore di sourcing primario, cfr. ADR-0004). Solo /v1/search:
// rumore ~zero, surfaces fonti primarie con relevance_score. Modalità `answer`
// esclusa by design (SSE-only). Pay-as-you-go (~$0.0075/search).
const { VALYU_API_KEY } = process.env;
const BASE = "https://api.valyu.ai/v1";

// Ricerca multi-sorgente. Ritorna l'array `results` (title, url, content, source,
// relevance_score, publication_date). Vedi engine/README per il mapping a signals.
export async function search(query, opts = {}) {
  if (!VALYU_API_KEY) throw new Error("missing env: VALYU_API_KEY (usa `doppler run`)");
  const body = {
    query,
    search_type: opts.searchType ?? "all",
    max_num_results: opts.maxResults ?? 10,
    relevance_threshold: opts.relevanceThreshold ?? 0.5,
    ...(opts.includedSources ? { included_sources: opts.includedSources } : {}),
    ...(opts.excludedSources ? { excluded_sources: opts.excludedSources } : {}),
    ...(opts.startDate ? { start_date: opts.startDate } : {}),
    ...(opts.endDate ? { end_date: opts.endDate } : {}),
  };
  const r = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "x-api-key": VALYU_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`valyu search ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (!j.success) throw new Error(`valyu search non-success: ${JSON.stringify(j)}`);
  return j.results ?? [];
}
