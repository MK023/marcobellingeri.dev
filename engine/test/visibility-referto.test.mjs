// engine/test/visibility-referto.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { prescription, renderReferto } from "../lib/referto.mjs";

test("prescription: citato -> nessuna prescrizione", () => {
  assert.equal(prescription({ engine: "perplexity", present: true, contentRef: "audit-di-se" }), null);
});

test("prescription: non citato + il pezzo esiste -> adatta il pezzo", () => {
  const p = prescription({ engine: "perplexity", present: false, contentRef: "audit-di-se" });
  assert.match(p, /audit-di-se/);
  assert.match(p, /estraibile|H2|FAQPage/i);
});

test("prescription: non citato + nessun pezzo -> candidato nuovo articolo", () => {
  const p = prescription({ engine: "perplexity", present: false, contentRef: null });
  assert.match(p, /nuovo pezzo|Edicola/i);
});

test("prescription: GSC posizione in calo -> controlla title/description", () => {
  const p = prescription({ engine: "gsc", present: true, deltaRank: 4.2, queryText: "cloud security" });
  assert.match(p, /posizione|title|description/i);
});

test("prescription: GSC stabile/migliorata -> nessuna prescrizione", () => {
  assert.equal(prescription({ engine: "gsc", present: true, deltaRank: 0, queryText: "x" }), null);
});

test("prescription: engine sconosciuto -> null (fallback difensivo)", () => {
  assert.equal(prescription({ engine: "boh", present: false }), null);
});

test("renderReferto: caratteri di controllo nelle query -> neutralizzati (S5145)", () => {
  const md = renderReferto({
    runAt: "2026-07-21",
    perplexity: [{ queryText: "riga\nfalsa", contentRef: null, present: false, rank: null }],
    gsc: [{ query: "a\nb", position: 12, prevPosition: 5 }],
  });
  assert.doesNotMatch(md, /riga\nfalsa/);
  assert.doesNotMatch(md, /a\nb/);
  assert.match(md, /riga falsa/);
  assert.match(md, /Perdi posizione su «a b»/);
});

test("renderReferto: trend 🆕/perso e delta posizione", () => {
  const md = renderReferto({
    runAt: "2026-07-18",
    perplexity: [
      { queryText: "a", contentRef: "audit-di-se", present: true, rank: 1, prevPresent: false },
      { queryText: "b", contentRef: null, present: false, rank: null, prevPresent: true },
    ],
    gsc: [{ query: "cloud", position: 5, prevPosition: 3 }],
  });
  assert.match(md, /🆕/);           // a: citato ora, non prima
  assert.match(md, /perso/);         // b: citato prima, non ora
  assert.match(md, /Δ \+2\.0/);     // cloud: 5 - 3
  assert.match(md, /candidato per un nuovo pezzo/); // b senza content_ref
});

// Il 12-08-2026 la gamba SEO del monitor era muta da tre settimane: zero righe a
// ogni corsa, job verde. Non era rotta — chiedeva a GSC la vista per `query`, e
// con 30 impression in un mese ogni singola query cade sotto la soglia di
// anonimizzazione di Google, che le omette tutte. Il referto stampava
// un'intestazione vuota, che si legge come "nessun problema" invece che come
// "non te lo posso dire".
test("referto SEO: senza righe per query ma con totali, mostra i totali e dice perche'", () => {
  const r = renderReferto({
    runAt: "2026-08-12T00:00:00Z",
    perplexity: [],
    gsc: [],
    gscTotali: { impressions: 30, clicks: 0, position: 8.1 },
    gscPagine: [{ page: "https://marcobellingeri.dev/cv-it.pdf", impressions: 6, position: 7.2 }],
  });
  assert.match(r, /30/, "le impression totali devono comparire");
  assert.match(r, /8[.,]1/, "la posizione media deve comparire");
  assert.match(r, /soglia|anonimizz|omette/i, "deve spiegare perche' le query mancano");
  assert.match(r, /cv-it\.pdf/, "le pagine sono l'unica vista disponibile: vanno mostrate");
});

test("referto SEO: senza alcun dato lo dice, invece di lasciare la sezione vuota", () => {
  const r = renderReferto({ runAt: "2026-08-12T00:00:00Z", perplexity: [], gsc: [] });
  const sezione = r.slice(r.indexOf("## SEO"));
  assert.match(sezione, /nessun dato|nessuna impression/i, "una sezione vuota si legge come 'tutto bene'");
});

test("referto SEO: con le query disponibili resta il referto di prima", () => {
  const r = renderReferto({
    runAt: "2026-08-12T00:00:00Z",
    perplexity: [],
    gsc: [{ query: "cloud security torino", position: 12.4, prevPosition: 8.0 }],
    gscTotali: { impressions: 900, clicks: 30, position: 11.0 },
  });
  assert.match(r, /cloud security torino/);
  assert.match(r, /Δ \+4\.4/, "il trend per query non deve regredire");
  assert.doesNotMatch(r, /soglia|anonimizz/i, "la spiegazione serve solo quando le query mancano");
});
