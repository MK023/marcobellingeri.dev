// Unit della logica card Edicola (lib/edicola.mjs) + guardie CLI di edicola.mjs.
// La merge è pura (zero rete, zero fs); il CLI si spawna con fetch mockata.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canonicalDi } from "../lib/devto.mjs";
import { annoPubblicazione, hrefSicuro, mergeCards, slugFromCanonical } from "../lib/edicola.mjs";
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

// La #218 ha aggiunto lo slash finale a canonicalDi perche' la pagina si
// dichiara canonical cosi'. Qui c'era il SECONDO parser dello stesso URL,
// ancorato con $ e senza slash: da quel merge un articolo nuovo tornava slug
// null, quindi niente card in Edicola, in silenzio. I test non l'hanno vista
// perche' provavano solo la forma vecchia.
// La guardia vera e' il giro completo: chi costruisce l'URL e chi lo rilegge
// devono restare d'accordo da soli, senza che qualcuno se lo ricordi.
test("giro completo: quello che canonicalDi costruisce, slugFromCanonical lo rilegge", () => {
  for (const slug of ["audit-di-se", "canonical-first", "x"]) {
    assert.equal(slugFromCanonical(canonicalDi(slug)), slug);
  }
});

test("slugFromCanonical: lo slash finale non azzera lo slug", () => {
  assert.equal(slugFromCanonical("https://marcobellingeri.dev/en/writing/audit-di-se/"), "audit-di-se");
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

test("mergeCards: card a mano senza slug ma con lo stesso href -> nessun doppione", () => {
  // Finding Seer (PR #97): una card aggiunta a mano con href di un articolo
  // canonical nostro ma senza slug non deve essere duplicata dal cron.
  const out = mergeCards(CARDS, [
    { slug: "tredici-pr", url: "https://dev.to/mk023/13-pr-1274", anno: "2026", label: { it: "x", en: "x" } },
  ]);
  assert.equal(out, CARDS);
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

// L'url dell'articolo arriva dalla API di dev.to e finisce dritto in un href
// renderizzato dal sito. Il guasto che questi test esistono per prendere è che un
// URL BEN FORMATO non è per questo innocuo: `javascript:alert(1)` è un URL valido,
// e l'escaping di Astro mette in salvo l'attributo, non lo schema. Il canonical
// dice che l'articolo è nostro; l'url dice dove va il lettore, ed è un campo
// diverso della stessa risposta non fidata.

test("hrefSicuro: gli url veri di dev.to passano", () => {
  for (const url of [
    "https://dev.to/mk023/a-week-of-green-runs-1100",
    "https://dev.to/mk023/qualcosa",
    "https://www.dev.to/mk023/qualcosa",
    // Il punto finale è lo stesso host per il DNS: scartarlo sarebbe scartare un
    // url legittimo in silenzio, e su una run verde non se ne accorgerebbe nessuno.
    "https://dev.to./mk023/qualcosa",
  ]) {
    assert.ok(hrefSicuro(url), url);
  }
});

test("hrefSicuro: torna l'url NORMALIZZATO, che è quello guardato", () => {
  // Validare una stringa e salvarne un'altra lascia una fessura: questo url supera
  // il controllo perché il parser lo legge come `https://dev.to/@evil.com`, ma il
  // testo grezzo letto con regole diverse (un feed, una unfurl, una mail) direbbe
  // un'altra cosa. Si salva quello che si è guardato.
  assert.equal(hrefSicuro("https://dev.to\\@evil.com"), "https://dev.to/@evil.com");
  assert.equal(hrefSicuro("  https://dev.to/x  "), "https://dev.to/x");
  assert.equal(hrefSicuro("https://DEV.TO/x"), "https://dev.to/x");
  assert.equal(hrefSicuro("https://dev.to./x"), "https://dev.to./x".replace("dev.to.", "dev.to."));
});

test("hrefSicuro: gli schemi che eseguono codice non passano", () => {
  for (const url of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ]) {
    assert.equal(hrefSicuro(url), null, url);
  }
});

test("hrefSicuro: un altro host non passa, nemmeno se ci somiglia", () => {
  for (const url of [
    "https://evil.com/mk023/pezzo",
    "https://dev.to.evil.com/pezzo",
    "https://notdev.to/pezzo",
    "https://sottodominio.dev.to/pezzo",
    "https://dev.to@evil.com/pezzo",
    "http://dev.to/mk023/pezzo",
  ]) {
    assert.equal(hrefSicuro(url), null, url);
  }
});

test("hrefSicuro: url assente, relativo o spazzatura non passa", () => {
  for (const url of [undefined, null, "", "/it/writing/pezzo", "dev.to/mk023", "://"]) {
    assert.equal(hrefSicuro(url), null, String(url));
  }
});

// La guardia esiste, ma finché nessuno prova il CLI resta scollegata: invertire la
// condizione o perdere il `!` lascerebbe tutti i test verdi. Qui l'articolo ha un
// canonical NOSTRO — quindi supera slugFromCanonical, che è il controllo di prima —
// e un url che esegue codice. Deve essere saltato, non messo in pila.
test("CLI edicola: canonical nostro ma url pericoloso -> nessuna card, e lo dice", () => {
  const r = runEngine(["engine/edicola.mjs"], [
    { match: "/api/articles/me/published", body: [
      {
        url: "javascript:alert(1)",
        canonical_url: "https://marcobellingeri.dev/en/writing/audit-di-se/",
        published_at: "2026-07-21T08:00:00Z",
      },
    ] },
  ], { DEVTO_API_KEY: "dk_fake" });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /nessuna card nuova/);
  assert.match(r.stderr, /url non ammesso/);
});

// `published_at` viene dalla stessa risposta di `url`. Non è una falla — finisce
// in un nodo di testo escapato — ma è lo stesso confine, e trattarlo diversamente
// sarebbe dire mezza verità nel commento sopra.
test("annoPubblicazione: le date vere di dev.to danno l'anno", () => {
  const adesso = new Date("2026-09-09T00:00:00Z");
  assert.equal(annoPubblicazione("2026-07-21T08:00:00Z", adesso), "2026");
  assert.equal(annoPubblicazione("2016-01-01T00:00:00Z", adesso), "2016");
  // Un fuso avanti non è un errore: l'anno successivo si accetta.
  assert.equal(annoPubblicazione("2027-01-01T00:00:00Z", adesso), "2027");
});

test("annoPubblicazione: quello che non è un anno torna null", () => {
  const adesso = new Date("2026-09-09T00:00:00Z");
  for (const v of [undefined, null, "", "ieri", "0000-01-01", "1999-01-01", "2100-01-01", "20x6-01-01", {}]) {
    assert.equal(annoPubblicazione(v, adesso), null, String(v));
  }
});
