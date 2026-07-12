// Client Anthropic Messages API — zero dipendenze (fetch globale, Node >=20).
// Solo il minimo che serve al generatore: generateJson() con structured output
// e countTokens() per il preflight. Segreto via env (Doppler), MAI loggato.
//
// Sicurezza: niente eval/shell; il body è JSON; l'API key vive solo nell'header
// e non compare in log né errori. Controllo su rate-limit e retry: 429 onora
// Retry-After, 5xx/rete → backoff esponenziale, 4xx (400/401/403) → stop subito.
import { randomInt } from "node:crypto";

const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";

function key() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("missing env: ANTHROPIC_API_KEY (usa `doppler run`)");
  return k;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// backoff con jitter, tetto 30s. randomInt e non Math.random (S2245): per un
// jitter il CSPRNG non servirebbe, ma costa uguale e il finding sparisce.
const backoff = (attempt) => Math.min(30_000, 1000 * 2 ** attempt) + randomInt(500);

// POST con retry controllato. Ritenta solo ciò che ha senso ritentare.
async function post(path, body, { maxRetries = 4, timeoutMs = 300_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let r;
    try {
      r = await fetch(`${API}/${path}`, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "x-api-key": key(),
          "anthropic-version": VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = e; // rete/timeout → ritenta
      if (attempt < maxRetries) await sleep(backoff(attempt));
      continue;
    }
    if (r.ok) return r.json();
    const status = r.status;
    const text = (await r.text()).slice(0, 500); // messaggio API, non contiene la key
    if (status === 429 || status >= 500) {
      lastErr = new Error(`anthropic ${path} -> ${status}: ${text}`);
      if (attempt < maxRetries) {
        const ra = Number(r.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt));
      }
      continue;
    }
    throw new Error(`anthropic ${path} -> ${status}: ${text}`); // 4xx: non ritentabile
  }
  throw lastErr ?? new Error(`anthropic ${path}: tentativi esauriti`);
}

// Preflight: quanti token pesa il prompt. Tetto duro deciso dal chiamante.
export async function countTokens({ model, system, messages }) {
  const r = await post("messages/count_tokens", { model, system, messages });
  return r.input_tokens;
}

// Genera con structured output. thinking disabilitato di proposito: budget
// deterministico (tutto il max_tokens all'articolo, niente troncamento da parte
// del ragionamento) — la fattualità è imposta da prompt + validazione, non dal
// thinking. Ritorna { data, usage }; data = JSON già parsato e garantito a schema.
export async function generateJson({ model, system, messages, schema, maxTokens }) {
  const r = await post("messages", {
    model,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
    system,
    messages,
    output_config: { format: { type: "json_schema", schema } },
  });
  if (r.stop_reason === "refusal") {
    throw new Error(`anthropic: rifiuto safety (${r.stop_details?.category ?? "?"})`);
  }
  if (r.stop_reason === "max_tokens") {
    throw new Error("anthropic: output troncato (max_tokens) — riduci le fonti");
  }
  const block = (r.content ?? []).find((b) => b.type === "text");
  if (!block) throw new Error("anthropic: nessun blocco testo nella risposta");
  let data;
  try {
    data = JSON.parse(block.text);
  } catch {
    throw new Error("anthropic: JSON non parseabile nonostante lo schema");
  }
  return { data, usage: r.usage ?? {} };
}
