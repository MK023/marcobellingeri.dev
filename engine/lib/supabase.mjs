// Client REST minimale su PostgREST col service_role.
// Niente connection string diretta (cfr. ADR-0004 / memoria RAG): scrittura via REST.
// Il service_role bypassa RLS; i grant di tabella sono in migration 0004.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

function headers(extra = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa `doppler run`)");
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Supabase risponde 504 quando il progetto si sveglia da freddo: il 2026-09-12 ha
// ucciso il cron advance su una GET sana, e poche ore dopo la stessa identica query
// tornava 200 in 80ms. La stessa transitorietà si presenta anche come connessione
// caduta, quindi vanno ritentate entrambe le forme.
// Quanto dura un tentativo perso lo decide il gateway remoto, non questo file: qui
// si aggiunge solo l'attesa fra un tentativo e l'altro, 500ms e poi 1s.
// Mai le POST, tranne le rpc/: dietro un 504 la scrittura può essere già passata e
// insert() non è idempotente. match_article_chunks è invece `language sql stable`
// (0001_init.sql:121), e a una funzione stable Postgres vieta di scrivere — non è
// una lettura del codice, è il motore che la impone. Una rpc che muti va esclusa qui.
// PATCH e DELETE portano il filtro con sé, rifarli approda allo stesso stato.
const RETRIABLE = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(path, init = {}) {
  const method = init.method ?? "GET";
  const replayable = method !== "POST" || path.startsWith("rpc/");
  const built = headers(init.headers); // fuori dal loop: env mancante muore subito, non dopo tre giri
  for (let attempt = 0; ; attempt++) {
    const last = attempt === MAX_RETRIES;
    let r;
    try {
      r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: built });
    } catch (e) {
      if (!replayable || last) throw e;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    if (r.ok) return r;
    if (!replayable || !RETRIABLE.has(r.status) || last) {
      throw new Error(`supabase ${method} ${path} -> ${r.status}: ${await r.text()}`);
    }
    await sleep(500 * 2 ** attempt);
  }
}

// encodeURIComponent lascia passare ! ' ( ) * — che in PostgREST non sono innocui:
// `(` e `)` delimitano `in.(…)` e `or=(…)`, la virgola separa i valori. Un valore
// che li contiene cambierebbe il filtro invece di essere confrontato.
const encodeValue = (v) => {
  if (v === null || v === undefined) throw new TypeError("valore nullo in un filtro PostgREST");
  return encodeURIComponent(String(v)).replace(
    /[!'()*]/g,
    (c) => "%" + c.codePointAt(0).toString(16).toUpperCase(),
  );
};

// Template tag per le query PostgREST: i pezzi letterali (nomi di colonna,
// operatori, `select=`) passano intatti, TUTTI i valori interpolati vengono
// codificati. Serve perché select/update/remove ricevono la querystring già
// assemblata: a quel punto nessuna barriera può più sapere cosa era un valore.
//
//   pg`signals?select=source_url&issue_id=eq.${issue.id}`
//
// Oggi i valori arrivano dal DB o dall'ambiente e sono innocui. Diventano input
// utente con l'endpoint pubblico C1 dell'ADR-0003: la barriera va messa prima.
export const pg = (strings, ...values) =>
  strings.reduce((acc, s, i) => acc + s + (i < values.length ? encodeValue(values[i]) : ""), "");

// GET con querystring PostgREST. Costruiscila con pg`` quando interpoli valori.
export const select = async (pathWithQuery) => (await rest(pathWithQuery)).json();

// INSERT righe; returning=true per riavere le righe (con id).
export async function insert(table, rows, { returning = false } = {}) {
  const r = await rest(table, {
    method: "POST",
    headers: { Prefer: returning ? "return=representation" : "return=minimal" },
    body: JSON.stringify(rows),
  });
  return returning ? r.json() : null;
}

// PATCH righe che matchano il filtro PostgREST, es. update("article_chunks", "id=eq.<uuid>", {embedding}).
export async function update(table, filter, patch) {
  await rest(`${table}?${filter}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
}

// DELETE righe che matchano il filtro PostgREST.
export async function remove(table, filter) {
  await rest(`${table}?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
}

// Chiama una funzione RPC (es. match_article_chunks). Ritorna il JSON.
export async function rpc(fn, args) {
  return (await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) })).json();
}
