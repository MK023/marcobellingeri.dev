// Telemetria Langfuse del Worker (OTLP HTTP/JSON, fetch, zero deps) — stesso
// pattern hand-rolled di engine/lib/langfuse.mjs, adattato al runtime Workers.
//
// SOLO NUMERI, MAI CONTENUTI: né la domanda né la risposta lasciano il Worker
// verso Langfuse — /privacy dice «la domanda non viene salvata» e resta vero.
// Un test dedicato (worker.test.mjs) lo fa rispettare.
//
// Fail-open: senza chiavi è un no-op; un errore d'invio muore in silenzio.
// Si spedisce via ctx.waitUntil, FUORI dal percorso della risposta: latenza
// utente invariata.

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const attr = (key, value) => ({ key, value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) } });
const attrInt = (key, value) => ({ key, value: { intValue: String(value) } });
const ns = (ms) => String(BigInt(Math.round(ms)) * 1000000n);

/**
 * Trace di una richiesta ask: root span + (se il modello è stato chiamato) una
 * generation con gen_ai.usage. `sid` è il session id del client, già validato
 * come UUID dal chiamante; null = trace senza session.
 * @param {Record<string, any>} env
 * @param {{ sid: string | null, locale: string, matches: number, citations: number,
 *           degradato: boolean, usage: { input_tokens?: number, output_tokens?: number } | null,
 *           model: string | null, t0: number, tModel0: number | null, t1: number }} dati
 */
export async function inviaTracciaAsk(env, { sid, locale, matches, citations, degradato, usage, model, t0, tModel0, t1 }) {
  const { LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = env;
  if (!LANGFUSE_BASE_URL || !LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return;

  const traceId = hex(16);
  const rootSpanId = hex(8);
  const root = {
    traceId, spanId: rootSpanId, name: 'ask', kind: 1,
    startTimeUnixNano: ns(t0), endTimeUnixNano: ns(t1),
    status: { code: 1 },
    attributes: [
      attr('langfuse.trace.name', 'ask'),
      attr('langfuse.trace.tags', ['worker', 'ask']),
      ...(sid ? [attr('langfuse.session.id', sid)] : []),
      attr('langfuse.trace.metadata.locale', locale),
      attrInt('langfuse.trace.metadata.matches', matches),
      attrInt('langfuse.trace.metadata.citations', citations),
      attr('langfuse.trace.metadata.esito', degradato ? 'degradato' : matches === 0 ? 'zero-match' : 'ok'),
    ],
  };
  const spans = [root];
  if (model && tModel0 !== null) {
    const g = {
      traceId, spanId: hex(8), parentSpanId: rootSpanId, name: 'haiku-generate', kind: 1,
      startTimeUnixNano: ns(tModel0), endTimeUnixNano: ns(t1),
      status: degradato ? { code: 2, message: 'modello non disponibile' } : { code: 1 },
      attributes: [
        attr('langfuse.observation.type', 'generation'),
        attr('gen_ai.request.model', model),
        ...(degradato ? [attr('langfuse.observation.level', 'ERROR')] : []),
      ],
    };
    for (const [k, v] of Object.entries(usage ?? {})) {
      if (Number.isFinite(v)) g.attributes.push(attrInt(`gen_ai.usage.${k}`, v));
    }
    spans.push(g);
  }

  try {
    await fetch(`${LANGFUSE_BASE_URL}/api/public/otel/v1/traces`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`)}`,
        'Content-Type': 'application/json',
        'x-langfuse-ingestion-version': '4',
      },
      body: JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [attr('service.name', 'marcobellingeri-worker')] },
          scopeSpans: [{ scope: { name: 'worker' }, spans }],
        }],
      }),
    });
  } catch { /* fail-open: la telemetria non ha diritto di far rumore */ }
}
