// Preload (--import) per i processi figli spawnati dai test: sostituisce la
// fetch globale con un router di risposte finte lette da env FETCH_MOCK (JSON).
// Serve per i moduli che eseguono tutto al top-level (embed/retrieve/competitors/
// generate/export): si spawnano come processi reali — la coverage dei figli viene
// raccolta comunque — ma NESSUNA chiamata esce sulla rete.
//
// Ogni rotta: { match, method?, times?, status?, body?, type? }
//  - match:  substring dell'URL (la prima rotta che matcha vince)
//  - method: default GET
//  - times:  n. massimo di risposte (per sequenze sullo stesso endpoint)
//  - type "voyage": genera embedding fittizi 1024-dim, uno per input del batch
const DIM = 1024;
const routes = JSON.parse(process.env.FETCH_MOCK ?? "[]");

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = (init.method ?? "GET").toUpperCase();
  const r = routes.find(
    (x) => u.includes(x.match) && (x.method ?? "GET").toUpperCase() === method && (x.times === undefined || x.times > 0),
  );
  if (!r) throw new Error(`fetch non mockata: ${method} ${u}`);
  if (r.times !== undefined) r.times -= 1;
  let body = r.body;
  if (r.type === "voyage") {
    const input = JSON.parse(init.body).input;
    body = { data: input.map((_, i) => ({ index: i, embedding: Array(DIM).fill(0.01) })) };
  }
  return new Response(typeof body === "string" ? body : JSON.stringify(body ?? null), { status: r.status ?? 200 });
};
