// engine/lib/referto.mjs
// Ruleset statico: dato lo stato di un'osservazione, una riga d'azione (o null).
// Volutamente piccolo: la prescrizione generata da LLM è Fase 2 (sconfina nell'adapter).

export function prescription(o) {
  if (o.engine === "perplexity") {
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
      return `Perdi posizione su «${o.queryText}»: controlla title/description e freschezza.`;
    }
    return null;
  }
  return null;
}

// Rende il referto markdown da osservazioni correnti + precedenti (per il trend).
// `perplexity`: [{ queryText, contentRef, present, rank, prevPresent }]
// `gsc`: [{ query, position, prevPosition }]
export function renderReferto({ runAt, perplexity = [], gsc = [] }) {
  const lines = [`# Referto discoverability — ${runAt}`, ""];

  lines.push("## AEO — Perplexity", "");
  for (const p of perplexity) {
    const stato = p.present ? `citato (pos ${p.rank})` : "non citato";
    const trend = p.prevPresent === undefined ? "" :
      p.present && !p.prevPresent ? " 🆕" :
      !p.present && p.prevPresent ? " ⚠️ perso" : "";
    lines.push(`- **${p.queryText}** — ${stato}${trend}`);
    const rx = prescription({ engine: "perplexity", present: p.present, contentRef: p.contentRef });
    if (rx) lines.push(`  - → ${rx}`);
  }

  lines.push("", "## SEO — Google Search Console", "");
  for (const g of gsc) {
    const delta = typeof g.prevPosition === "number" ? g.position - g.prevPosition : null;
    const deltaTxt = delta === null ? "" : ` (Δ ${delta > 0 ? "+" : ""}${delta.toFixed(1)})`;
    lines.push(`- **${g.query}** — pos ${g.position.toFixed(1)}${deltaTxt}`);
    const rx = prescription({ engine: "gsc", present: true, deltaRank: delta ?? 0, queryText: g.query });
    if (rx) lines.push(`  - → ${rx}`);
  }

  return lines.join("\n");
}
