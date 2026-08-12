// engine/lib/openai.mjs
// Client OpenAI Responses API con lo strumento `web_search`. Zero-dep: fetch nativo.
// Il match host/citazione vive in urlmatch.mjs, come per Perplexity.
// NB: si misura un PROXY di ChatGPT, non chatgpt.com — stesso indice web, contesto e
// personalizzazione diversi. Il referto lo dichiara: vedi lib/referto.mjs.
import { findCitation } from "./urlmatch.mjs";

const DOMAIN = "marcobellingeri.dev";
// Il costo e' dominato dalla call ($10/1k), non dai token: da qui il modello
// piccolo. `search_context_size` resta al default: misurato il 12-08-2026 su una
// query reale, "low" e "medium" hanno dato gli stessi token (8174) e le stesse
// citazioni — un parametro che non sposta niente e' un parametro da non avere.
const MODEL = "gpt-4.1-mini";

// Interroga il modello con `question`. Ritorna { present, rank, matchedUrl, raw }.
export async function checkCitation(question) {
  const { OPENAI_API_KEY } = process.env;
  if (!OPENAI_API_KEY) throw new Error("missing env: OPENAI_API_KEY (usa `doppler run`)");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: question,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const hit = findCitation(citations(j), DOMAIN);
  return { ...hit, raw: JSON.stringify(j).slice(0, 30_000) };
}

// Le citazioni stanno nelle annotations del messaggio. Le `sources` del
// web_search_call sono il ripiego, e devono restarlo: misurate su una query
// reale erano 12 pagine sul TEMA (il modello riscrive la domanda in una query di
// ricerca), contro 1 sola davvero citata. Contarle come citazioni gonfierebbe il
// rank con roba che il lettore non vede mai.
function citations(j) {
  const output = Array.isArray(j?.output) ? j.output : [];
  const annotate = output
    .flatMap((o) => (Array.isArray(o?.content) ? o.content : []))
    .flatMap((c) => (Array.isArray(c?.annotations) ? c.annotations : []))
    .filter((a) => a?.type === "url_citation");
  if (annotate.length) return annotate;
  return output.flatMap((o) => (Array.isArray(o?.action?.sources) ? o.action.sources : []));
}
