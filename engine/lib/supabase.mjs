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

async function rest(path, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
  if (!r.ok) throw new Error(`supabase ${init.method || "GET"} ${path} -> ${r.status}: ${await r.text()}`);
  return r;
}

// GET con querystring PostgREST già formata, es. select("articles?select=id&limit=1").
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
