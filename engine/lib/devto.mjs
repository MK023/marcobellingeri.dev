// engine/lib/devto.mjs
// Client dev.to (Forem API v1) per il cross-post canonical-first della writing
// collection. Zero-dep: fetch nativo. Il canonical_url è la chiave d'idempotenza:
// stesso canonical -> update, mai un doppione.
const API = "https://dev.to/api";

// dev.to serve da cache CONDIVISA anche le risposte di endpoint autenticati, e
// non varia sulla `api-key`: una risposta 401 finita in cache viene poi servita
// a chiunque chiami lo stesso url, con qualunque chiave.
//
// Misurato il 24-07-2026 su /articles/me/published?per_page=100: la 401 portava
// `Age: 195` (header presente solo sulle risposte da cache), e lo STESSO url con
// un parametro in piu' tornava 200 nello stesso secondo, con la stessa chiave.
// Il cron `Devto publish due` e' morto cosi', e per due ore e' sembrato un
// problema di credenziali — una chiave e' stata pure ruotata per niente.
//
// Difesa: non condividere mai una voce di cache. Ogni lettura autenticata ha il
// suo url. E' un workaround verso un difetto loro, non un design nostro: se un
// giorno dev.to varia sulla api-key (o smette di cachare questi endpoint),
// questa funzione si toglie e non manca a nessuno.
let progressivo = 0;
export function urlNonCondiviso(url) {
  const u = new URL(url);
  u.searchParams.set("_", `${Date.now().toString(36)}${(progressivo++).toString(36)}`);
  return u.toString();
}

// La chiave d'idempotenza e' il canonical, ma dev.to conserva la stringa ESATTA
// con cui l'articolo e' nato. "audit-di-se" era uscito il 15-07-2026 col canonical
// che finiva in slash; quando la forma e' cambiata, il confronto per stringa non
// l'ha piu' riconosciuto e il 22/07 e' nato un secondo articolo — stesso pezzo,
// due url, metriche spezzate. Ogni confronto fra canonical passa da qui.
//
// A mano e non `/\/+$/`: quella regex, su una corsa di slash che non finisce la
// stringa, backtracka in tempo super-lineare (S8786) — la stessa forma che sul
// Radar portava 200k char a 30s. Scorrere la coda una volta e' O(n) e basta.
// L'URL canonico di un pezzo della writing collection. Vive qui e non nella CLI
// perche' il test possa importarlo senza eseguire lo script.
export const canonicalDi = (slug) => `https://marcobellingeri.dev/en/writing/${slug}/`;

export function chiaveCanonical(u) {
  const s = u ?? "";
  let i = s.length;
  while (i > 0 && s[i - 1] === "/") i--;
  return s.slice(0, i);
}

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
  const live = new Set(canonicalPubblicati.map(chiaveCanonical));
  const d = new Date(`${oggi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const domani = d.toISOString().slice(0, 10);

  // Un pezzo gia' uscito non si ripubblica e non si annuncia: l'upsert
  // aggiornerebbe l'articolo live senza motivo, e il preavviso sarebbe rumore.
  const attesa = articoli.filter((a) => !live.has(chiaveCanonical(a.canonicalUrl)));
  return {
    daPubblicare: attesa.filter((a) => a.date <= oggi),
    domani: attesa.filter((a) => a.date === domani),
  };
}

// Gli articoli pubblicati dell'account (per le card automatiche dell'Edicola).
export async function publishedArticles() {
  const { DEVTO_API_KEY } = process.env;
  if (!DEVTO_API_KEY) throw new Error("missing env: DEVTO_API_KEY (usa `doppler run`)");
  const r = await fetch(urlNonCondiviso(`${API}/articles/me/published?per_page=100`), {
    headers: { "api-key": DEVTO_API_KEY },
  });
  if (!r.ok) throw new Error(`devto me/published ${r.status}: ${await r.text()}`);
  return r.json();
}

// Crea o aggiorna l'articolo con quel canonical_url. Draft di default: `published`
// viene mandato solo quando publish=true — sul create l'API defaulta a false, e
// sull'update ometterlo significa NON toccare lo stato live (un re-run senza
// --publish non deve mai spubblicare un pezzo già uscito).
// dev.to limita le scritture sugli articoli (~1 ogni 30s) e risponde 429 a chi
// corre. La Devto draft aggiorna in fila tutti gli articoli EN toccati dal
// merge: l'11-08-2026 il terzo di tre ha preso "429: Retry later" e il workflow
// e' morto a meta' lavoro, lasciando repo e mirror allineati su due pezzi su
// tre. La riprova sta QUI e non nel workflow perche' ci passa ogni chiamante
// (il singolo slug, e il loop di --due che pubblica un pezzo dopo l'altro).
//
// Attese fisse e non esponenziali: il limite e' a finestra di tempo, non un
// server sotto sforzo — raddoppiare non aiuta, aspettare la finestra si.
// `attendi` e' iniettabile solo perche' i test non devono dormire davvero.
const ATTESE_429 = [30_000, 30_000, 60_000];
const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

async function scriviConRiprova({ url, init, verbo, attendi }) {
  for (let tentativo = 0; ; tentativo++) {
    const r = await fetch(url, init);
    if (r.ok) return r.json();
    const corpo = await r.text();
    if (r.status !== 429 || tentativo >= ATTESE_429.length) {
      throw new Error(`devto ${verbo} ${r.status}: ${corpo}`);
    }
    // Retry-After e' in secondi quando c'e'; quando non c'e', la finestra nota.
    const dichiarato = Number(r.headers.get("retry-after"));
    await attendi(Number.isFinite(dichiarato) && dichiarato > 0 ? dichiarato * 1000 : ATTESE_429[tentativo]);
  }
}

export async function upsertArticle({ title, description, tags, body, canonicalUrl, publish = false, attendi = dormi }) {
  const { DEVTO_API_KEY } = process.env;
  if (!DEVTO_API_KEY) throw new Error("missing env: DEVTO_API_KEY (usa `doppler run`)");
  const headers = { "api-key": DEVTO_API_KEY, "Content-Type": "application/json" };

  const r = await fetch(urlNonCondiviso(`${API}/articles/me/all?per_page=100`), { headers });
  if (!r.ok) throw new Error(`devto me/all ${r.status}: ${await r.text()}`);
  // Un articolo senza canonical normalizza a stringa vuota: non deve matchare
  // il nostro, che vuoto non e' mai (viene da canonicalDi()).
  const chiave = chiaveCanonical(canonicalUrl);
  const esistente = (await r.json()).find((a) => chiaveCanonical(a.canonical_url) === chiave);

  // I tag vanno in ARRAY. La forma "a,b,c,d" Forem la ignora in SILENZIO:
  // risponde 200, l'articolo risulta aggiornato, e la tag_list resta quella di
  // prima. Misurato il 2026-08-22 sull'articolo 4457686 — PUT con la stringa,
  // tag_list invariata; stesso articolo, stessa chiave, PUT con l'array,
  // tag_list aggiornata nello stesso minuto.
  //
  // Ha zittito la sincronizzazione dei tag da sempre, senza un errore: i draft
  // nascevano senza nessun tag (csp-hash-no-highlighter aveva quattro tag nel
  // frontmatter e tag_list vuota su dev.to), e i pezzi usciti finora portano i
  // tag che l'autore ha messo a mano nell'editor, non quelli del repo.
  const article = {
    title, description, body_markdown: body,
    canonical_url: canonicalUrl, tags: tags.slice(0, 4),
  };
  if (publish) article.published = true;

  const j = await scriviConRiprova({
    url: esistente ? `${API}/articles/${esistente.id}` : `${API}/articles`,
    init: { method: esistente ? "PUT" : "POST", headers, body: JSON.stringify({ article }) },
    verbo: esistente ? "update" : "create",
    attendi,
  });
  return { id: j.id, url: j.url, updated: Boolean(esistente) };
}
