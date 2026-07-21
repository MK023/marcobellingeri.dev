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
