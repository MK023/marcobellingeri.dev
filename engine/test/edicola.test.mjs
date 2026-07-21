// Unit della logica card Edicola (lib/edicola.mjs) + guardie CLI di edicola.mjs.
// La merge è pura (zero rete, zero fs); il CLI si spawna con fetch mockata.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mergeCards, slugFromCanonical } from "../lib/edicola.mjs";
import { runEngine } from "./helpers/spawn.mjs";

const CARDS = [
  {
    slug: "tool-use-jobsearch",
    label: { it: "Tool-use in JobSearch", en: "Tool-use in JobSearch" },
    sub: { it: "dev.to · 2026", en: "dev.to · 2026" },
    href: "https://dev.to/mk023/tool-use-3cjg",
  },
  {
    slug: "audit-di-se",
    label: { it: "Il sito che si audita da solo", en: "The site that audits itself" },
    sub: { it: "Sul sito · 2026", en: "On the site · 2026" },
    path: "writing/audit-di-se",
  },
  {
    label: { it: "13 PR in un pomeriggio", en: "13 PRs in one afternoon" },
    sub: { it: "dev.to · 2026", en: "dev.to · 2026" },
    href: "https://dev.to/mk023/13-pr-1274",
  },
];

test("slugFromCanonical: canonical della writing collection -> slug", () => {
  assert.equal(slugFromCanonical("https://marcobellingeri.dev/en/writing/audit-di-se"), "audit-di-se");
});

test("slugFromCanonical: url estranei, sporchi o assenti -> null", () => {
  assert.equal(slugFromCanonical("https://dev.to/mk023/qualcosa"), null);
  assert.equal(slugFromCanonical("https://marcobellingeri.dev/it/writing/audit-di-se"), null);
  assert.equal(slugFromCanonical("https://marcobellingeri.dev/en/writing/../../etc"), null);
  assert.equal(slugFromCanonical(undefined), null);
  assert.equal(slugFromCanonical(null), null);
});

test("mergeCards: articolo nuovo -> card in testa alla pila, sub con anno", () => {
  const out = mergeCards(CARDS, [{
    slug: "csp-a-hash",
    url: "https://dev.to/mk023/csp-a-hash-1abc",
    anno: "2026",
    label: { it: "CSP a hash", en: "Hash-based CSP" },
  }]);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], {
    slug: "csp-a-hash",
    label: { it: "CSP a hash", en: "Hash-based CSP" },
    sub: { it: "dev.to · 2026", en: "dev.to · 2026" },
    href: "https://dev.to/mk023/csp-a-hash-1abc",
  });
  assert.deepEqual(out.slice(1), CARDS);
});

test("mergeCards: slug già in pila -> nessun doppione (anche se la card è interna)", () => {
  // audit-di-se è in pila come card interna (path): se poi esce su dev.to,
  // la casa canonical resta il sito — niente seconda card.
  const out = mergeCards(CARDS, [
    { slug: "audit-di-se", url: "https://dev.to/mk023/audit-9xyz", anno: "2026", label: { it: "x", en: "x" } },
    { slug: "tool-use-jobsearch", url: "https://dev.to/mk023/tool-use-3cjg", anno: "2026", label: { it: "x", en: "x" } },
  ]);
  assert.equal(out, CARDS); // stesso riferimento: nessuna modifica da scrivere
});

test("mergeCards: più articoli nuovi -> tutti in testa, ordine preservato", () => {
  const out = mergeCards(CARDS, [
    { slug: "a", url: "https://dev.to/mk023/a", anno: "2026", label: { it: "A", en: "A" } },
    { slug: "b", url: "https://dev.to/mk023/b", anno: "2027", label: { it: "B", en: "B" } },
  ]);
  assert.equal(out.length, 5);
  assert.equal(out[0].slug, "a");
  assert.equal(out[1].slug, "b");
  assert.equal(out[1].sub.en, "dev.to · 2027");
});

test("CLI edicola: senza DEVTO_API_KEY -> exit 1 e niente scrittura", () => {
  const r = runEngine(["engine/edicola.mjs"], [], { DEVTO_API_KEY: "" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /DEVTO_API_KEY/);
});

test("CLI edicola: nessun articolo con canonical nostro -> nessuna card nuova", () => {
  const r = runEngine(["engine/edicola.mjs"], [
    { match: "/api/articles/me/published", body: [
      { url: "https://dev.to/mk023/altro", canonical_url: "https://dev.to/mk023/altro", published_at: "2026-07-21T08:00:00Z" },
    ] },
  ], { DEVTO_API_KEY: "dk_fake" });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /nessuna card nuova/);
});
