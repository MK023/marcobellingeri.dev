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
  // La data non e' quotata nei nostri frontmatter (lo schema Astro la vuole
  // `date: YYYY-MM-DD`). E' obbligatoria: e' la data d'uscita programmata, e un
  // pezzo senza data non uscirebbe mai — in silenzio, che e' il modo peggiore.
  const date = fm.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m)?.[1];
  if (!date) throw new Error("frontmatter incompleto: serve date (YYYY-MM-DD)");
  // `edicola` (opzionale): l'etichetta corta per la card della pila — il titolo
  // intero non ci sta su un foglio da 240px.
  return { title, description, date, tags, edicola: campo("edicola"), body: md.slice(m[0].length).trim() };
}

// Il decisore dell'uscita programmata: dato il calendario dei pezzi e cio' che e'
// gia' live su dev.to, dice cosa pubblicare oggi e cosa esce domani (il preavviso).
// Puro: niente rete, niente side effect — pubblicare sta nello script.
//
// Le date restano STRINGHE ISO e si confrontano lessicograficamente: su
// YYYY-MM-DD l'ordine e' esatto, e non si apre il capitolo fusi orari (il cron
// gira in UTC, l'autore scrive a Roma). L'unica aritmetica e' "+1 giorno", fatta
// da Date in UTC per non sbagliare i fine mese.
export function inUscita({ articoli, canonicalPubblicati, oggi }) {
  const live = new Set(canonicalPubblicati);
  const d = new Date(`${oggi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const domani = d.toISOString().slice(0, 10);

  // Un pezzo gia' uscito non si ripubblica e non si annuncia: l'upsert
  // aggiornerebbe l'articolo live senza motivo, e il preavviso sarebbe rumore.
  const attesa = articoli.filter((a) => !live.has(a.canonicalUrl));
  return {
    daPubblicare: attesa.filter((a) => a.date <= oggi),
    domani: attesa.filter((a) => a.date === domani),
  };
}

// Gli articoli pubblicati dell'account (per le card automatiche dell'Edicola).
export async function publishedArticles() {
  const { DEVTO_API_KEY } = process.env;
  if (!DEVTO_API_KEY) throw new Error("missing env: DEVTO_API_KEY (usa `doppler run`)");
  const r = await fetch(`${API}/articles/me/published?per_page=100`, { headers: { "api-key": DEVTO_API_KEY } });
  if (!r.ok) throw new Error(`devto me/published ${r.status}: ${await r.text()}`);
  return r.json();
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
