// engine/lib/referto.mjs
// Ruleset statico: dato lo stato di un'osservazione, una riga d'azione (o null).
// Volutamente piccolo: la prescrizione generata da LLM è Fase 2 (sconfina nell'adapter).
import { logsafe } from "./logsafe.mjs";

// Le fonti AEO condividono la prescrizione: cambia il motore interrogato, non
// cosa si fa quando un pezzo esiste e non emerge.
const AEO = new Set(["perplexity", "chatgpt"]);

export function prescription(o) {
  if (AEO.has(o.engine)) {
    if (o.present) return null;
    if (o.contentRef) {
      return `«${o.contentRef}» esiste ma non emerge: rendilo estraibile — un H2 che è la ` +
        `domanda, risposta secca in apertura, schema FAQPage.`;
    }
    return `Nessun contenuto copre questa domanda: candidato per un nuovo pezzo d'Edicola.`;
  }
  if (o.engine === "gsc") {
    // deltaRank positivo = posizione peggiorata (numero più alto = più in basso).
    if (typeof o.deltaRank === "number" && o.deltaRank >= 1) {
      return `Perdi posizione su «${logsafe(o.queryText)}»: controlla title/description e freschezza.`;
    }
    return null;
  }
  return null;
}

// Rende il referto markdown da osservazioni correnti + precedenti (per il trend).
// `perplexity`: [{ queryText, contentRef, present, rank, prevPresent }]
// `gsc`: [{ query, position, prevPosition }]
// `gscTotali`: { impressions, clicks, position } — il dato di proprietà, sempre
//   disponibile anche quando le query non lo sono.
// `gscPagine`: [{ page, impressions, position }]
//
// Il perché dei totali: con poco traffico GSC OMETTE le righe per query (sotto
// la soglia di anonimizzazione), e il referto stampava un'intestazione vuota —
// che si legge come "nessun problema" invece che come "non te lo posso dire".
export function renderReferto({
  runAt, perplexity = [], chatgpt = [], gsc = [], gscTotali = null, gscPagine = [],
}) {
  return [
    `# Referto discoverability — ${runAt}`,
    "",
    ...sezioneAeo("perplexity", "Perplexity", perplexity),
    "",
    ...sezioneAeo("chatgpt", "ChatGPT (proxy API)", chatgpt, NOTA_CHATGPT),
    "",
    ...sezioneSeo({ gsc, gscTotali, gscPagine }),
  ].join("\n");
}

// Il dato arriva dall'API OpenAI con ricerca web, non da chatgpt.com: stesso
// indice, contesto e personalizzazione diversi. Senza questa riga, fra sei mesi
// "citato su ChatGPT" si legge come una cosa che non e' stata misurata.
const NOTA_CHATGPT =
  "> Misurato con l'API OpenAI + `web_search`, **non** con chatgpt.com: stesso indice web, " +
  "ma contesto e personalizzazione sono diversi. È un proxy, e va letto come tale.";

function sezioneAeo(engine, titolo, osservazioni, nota = null) {
  const lines = [`## AEO — ${titolo}`, ""];
  if (nota) lines.push(nota, "");
  for (const p of osservazioni) {
    const stato = p.present ? `citato (pos ${p.rank})` : "non citato";
    lines.push(`- **${logsafe(p.queryText)}** — ${stato}${trendAeo(p)}`);
    const rx = prescription({ engine, present: p.present, contentRef: p.contentRef });
    if (rx) lines.push(`  - → ${rx}`);
  }
  // Stessa lezione della sezione SEO: una sezione bianca si legge come "nessun
  // problema", non come "la fonte non ha risposto".
  if (!osservazioni.length) lines.push("- Nessun dato: la fonte non ha risposto per nessuna query.");
  return lines;
}

function trendAeo(p) {
  if (p.prevPresent === undefined) return "";
  if (p.present && !p.prevPresent) return " 🆕";
  if (!p.present && p.prevPresent) return " ⚠️ perso";
  return "";
}

function sezioneSeo({ gsc, gscTotali, gscPagine }) {
  const lines = ["## SEO — Google Search Console", ""];

  if (gscTotali) {
    lines.push(
      `- **Proprietà** — ${gscTotali.impressions} impression, ${gscTotali.clicks} clic, ` +
        `pos media ${gscTotali.position.toFixed(1)}`,
    );
  }

  for (const g of gsc) {
    const delta = typeof g.prevPosition === "number" ? g.position - g.prevPosition : null;
    const deltaTxt = delta === null ? "" : ` (Δ ${delta > 0 ? "+" : ""}${delta.toFixed(1)})`;
    lines.push(`- **${logsafe(g.query)}** — pos ${g.position.toFixed(1)}${deltaTxt}`);
    const rx = prescription({ engine: "gsc", present: true, deltaRank: delta ?? 0, queryText: g.query });
    if (rx) lines.push(`  - → ${rx}`);
  }

  if (gsc.length) return lines;

  // Nessuna riga per query: la sezione non puo' restare bianca, o si legge come
  // "nessun problema" invece che come "non te lo posso dire".
  if (!gscTotali) {
    lines.push("- Nessun dato: GSC non ha restituito nessuna impression per la finestra.");
    return lines;
  }

  lines.push(
    "",
    "> Nessuna riga per query: sotto una certa soglia di traffico Google le **omette** " +
      "(anonimizzazione), quindi l'assenza qui non dice niente sul posizionamento. " +
      "Le pagine sotto sono l'unica vista disponibile finché le impression restano poche.",
  );
  if (gscPagine.length) lines.push("");
  for (const p of gscPagine) {
    lines.push(`- \`${logsafe(p.page)}\` — ${p.impressions} impression, pos ${p.position.toFixed(1)}`);
  }
  return lines;
}
