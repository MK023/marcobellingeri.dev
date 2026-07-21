// engine/lib/devto.mjs
// Client dev.to (Forem API v1) per il cross-post canonical-first della writing
// collection. Zero-dep: fetch nativo. Il canonical_url è la chiave d'idempotenza:
// stesso canonical -> update, mai un doppione.
const API = "https://dev.to/api";

// Frontmatter minimale della writing collection: title/description tra virgolette,
// tags inline [a, b, c]. Non è uno YAML parser: copre il formato dei nostri file.
export function parseArticle(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error("frontmatter mancante");
  const fm = m[1];
  const campo = (k) => fm.match(new RegExp(`^${k}:\\s*"(.*)"\\s*$`, "m"))?.[1];
  const title = campo("title");
  const description = campo("description");
  if (!title || !description) throw new Error("frontmatter incompleto: servono title e description");
  const tags = (fm.match(/^tags:\s*\[(.*)\]\s*$/m)?.[1] ?? "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  return { title, description, tags, body: md.slice(m[0].length).trim() };
}

// Crea o aggiorna l'articolo con quel canonical_url. Draft di default: `published`
// viene mandato solo quando publish=true — sul create l'API defaulta a false, e
// sull'update ometterlo significa NON toccare lo stato live (un re-run senza
// --publish non deve mai spubblicare un pezzo già uscito).
export async function upsertArticle({ title, description, tags, body, canonicalUrl, publish = false }) {
  const { DEVTO_API_KEY } = process.env;
  if (!DEVTO_API_KEY) throw new Error("missing env: DEVTO_API_KEY (usa `doppler run`)");
  const headers = { "api-key": DEVTO_API_KEY, "Content-Type": "application/json" };

  const r = await fetch(`${API}/articles/me/all?per_page=100`, { headers });
  if (!r.ok) throw new Error(`devto me/all ${r.status}: ${await r.text()}`);
  const esistente = (await r.json()).find((a) => a.canonical_url === canonicalUrl);

  const article = {
    title, description, body_markdown: body,
    canonical_url: canonicalUrl, tags: tags.slice(0, 4).join(","),
  };
  if (publish) article.published = true;

  const w = await fetch(esistente ? `${API}/articles/${esistente.id}` : `${API}/articles`, {
    method: esistente ? "PUT" : "POST", headers, body: JSON.stringify({ article }),
  });
  if (!w.ok) throw new Error(`devto ${esistente ? "update" : "create"} ${w.status}: ${await w.text()}`);
  const j = await w.json();
  return { id: j.id, url: j.url, updated: Boolean(esistente) };
}
