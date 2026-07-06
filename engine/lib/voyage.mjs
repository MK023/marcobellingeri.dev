// Chunking + embedding. Modello: Voyage voyage-3.5 -> vector(1024), cross-lingual IT/EN.
// input_type 'document' per gli store, 'query' per le ricerche (cfr. ADR-0004 / memoria RAG).
const { EMBEDDING_API_KEY } = process.env;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";
export const DIM = 1024;

// Chunker paragraph-aware: accorpa paragrafi (split su blank line) fino a ~max char,
// senza mai spezzare un paragrafo a metà. Coerenza semantica > uniformità di taglia.
export function chunk(text, max = 1000) {
  const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + 2 + p.length > max) { out.push(cur); cur = p; }
    else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

// Embedda un batch di testi. Restituisce array di vettori (array di float).
export async function embed(texts, inputType = "document") {
  if (!EMBEDDING_API_KEY) throw new Error("missing env: EMBEDDING_API_KEY (usa `doppler run`)");
  if (!texts.length) return [];
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${EMBEDDING_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
  });
  if (!r.ok) throw new Error(`voyage ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const vecs = j.data.map((d) => d.embedding);
  if (vecs[0]?.length !== DIM) throw new Error(`voyage dim ${vecs[0]?.length}, atteso ${DIM}`);
  return vecs;
}

// Formatta un vettore per la colonna pgvector: "[f1,f2,...]".
export const toVector = (arr) => `[${arr.join(",")}]`;

// Self-check del chunker (puro, niente rete): `node lib/voyage.mjs`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { strict: assert } = await import("node:assert");
  const short = "uno\n\ndue";
  assert.deepEqual(chunk(short, 1000), ["uno\n\ndue"], "paragrafi piccoli restano accorpati");
  const big = ["a".repeat(600), "b".repeat(600), "c".repeat(600)].join("\n\n");
  const c = chunk(big, 1000);
  assert.equal(c.length, 3, "paragrafi che sforano il max vanno in chunk separati");
  assert.ok(c.every((x) => x.length <= 1000), "nessun chunk supera max se i paragrafi ci stanno");
  assert.equal(toVector([1, 2.5, -3]), "[1,2.5,-3]");
  console.log("voyage.mjs self-check OK");
}
