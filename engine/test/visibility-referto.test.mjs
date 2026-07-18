// engine/test/visibility-referto.test.mjs
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { prescription } from "../lib/referto.mjs";

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
