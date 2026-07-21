// Tracing Langfuse via endpoint OTel (OTLP HTTP/JSON) — l'endpoint /ingestion
// e' legacy, questo e' il percorso raccomandato dai docs. Zero dipendenze.
//
// FAIL-OPEN by design: senza chiavi il tracing e' disattivo (no-op) e un errore
// di invio NON deve mai rompere la pipeline (warn e avanti). Gli errori
// dell'APPLICAZIONE invece si propagano normalmente (lo span li registra).
//
// Pitfall #1 degli script CLI (dalla skill): dimenticare il flush -> nessuna
// trace inviata. Chiamare SEMPRE `await trace.flush()` a fine script.
import { randomBytes } from "node:crypto";

const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = process.env;
const enabled = Boolean(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY && LANGFUSE_BASE_URL);

const hex = (bytes) => randomBytes(bytes).toString("hex");
const nowNs = () => String(BigInt(Date.now()) * 1_000_000n);
const attr = (key, value) => ({
  key,
  value: { stringValue: typeof value === "string" ? value : JSON.stringify(value) },
});
// OTLP vuole gli interi come intValue (string-encoded), non come stringValue JSON.
const attrInt = (key, value) => ({ key, value: { intValue: String(value) } });

// Crea una trace con span annidati sotto una root. `metadata` = coppie piatte
// (finiscono in langfuse.trace.metadata.*). Input/output degli span: passare
// SEMPRE riassunti piccoli (mai raw_content di terzi: non fidato e pesante).
export function startTrace(name, { tags = [], metadata = {} } = {}) {
  const traceId = hex(16);
  const rootSpanId = hex(8);
  const startNs = nowNs();
  const spans = [];

  return {
    enabled,

    // Esegue fn dentro uno span. `input` = riassunto (opzionale);
    // `summarize(result)` = output piccolo (opzionale). Gli errori di fn si
    // propagano al chiamante, ma lo span li registra come ERROR prima.
    // `generation: { model, parameters }` marca lo span come generation
    // (langfuse.observation.type) e `usage(result)` mappa i token della
    // risposta sugli attributi gen_ai.usage.* — costi calcolati da Langfuse.
    async span(spanName, { input, summarize, generation, usage } = {}, fn) {
      const s = {
        traceId,
        spanId: hex(8),
        parentSpanId: rootSpanId,
        name: spanName,
        kind: 1,
        startTimeUnixNano: nowNs(),
        attributes: [],
        status: { code: 1 },
      };
      if (input !== undefined) s.attributes.push(attr("langfuse.observation.input", input));
      if (generation) {
        s.attributes.push(attr("langfuse.observation.type", "generation"));
        if (generation.model) s.attributes.push(attr("gen_ai.request.model", generation.model));
        if (generation.parameters) s.attributes.push(attr("langfuse.observation.model.parameters", generation.parameters));
      }
      try {
        const result = await fn();
        if (summarize) s.attributes.push(attr("langfuse.observation.output", summarize(result)));
        // usage è telemetria: se esplode o rende sporco, lo span parte senza
        // token — mai rompere la pipeline per un contatore.
        if (usage) {
          try {
            for (const [k, v] of Object.entries(usage(result) ?? {})) {
              if (Number.isFinite(v)) s.attributes.push(attrInt(`gen_ai.usage.${k}`, v));
            }
          } catch { /* fail-open */ }
        }
        return result;
      } catch (e) {
        s.status = { code: 2, message: String(e?.message ?? e).slice(0, 200) };
        s.attributes.push(attr("langfuse.observation.level", "ERROR"));
        throw e;
      } finally {
        s.endTimeUnixNano = nowNs();
        spans.push(s);
      }
    },

    // Invia la trace (root + span). Da chiamare UNA volta, a fine script.
    async flush() {
      if (!enabled) return;
      const root = {
        traceId,
        spanId: rootSpanId,
        name,
        kind: 1,
        startTimeUnixNano: startNs,
        endTimeUnixNano: nowNs(),
        status: { code: spans.some((s) => s.status.code === 2) ? 2 : 1 },
        attributes: [
          attr("langfuse.trace.name", name),
          ...(tags.length ? [attr("langfuse.trace.tags", tags)] : []),
          ...Object.entries(metadata).map(([k, v]) => attr(`langfuse.trace.metadata.${k}`, v)),
        ],
      };
      const payload = {
        resourceSpans: [{
          resource: { attributes: [attr("service.name", "marcobellingeri-engine")] },
          scopeSpans: [{ scope: { name: "engine" }, spans: [root, ...spans] }],
        }],
      };
      try {
        const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");
        const r = await fetch(`${LANGFUSE_BASE_URL}/api/public/otel/v1/traces`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
            "x-langfuse-ingestion-version": "4",
          },
          body: JSON.stringify(payload),
        });
        if (!r.ok) console.warn(`langfuse: invio fallito ${r.status} (pipeline non impattata)`);
      } catch (e) {
        console.warn(`langfuse: invio fallito (${e?.message}) — pipeline non impattata`);
      }
    },
  };
}
