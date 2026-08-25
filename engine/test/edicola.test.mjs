// Unit della logica card Edicola (lib/edicola.mjs) + guardie CLI di edicola.mjs.
// La merge è pura (zero rete, zero fs); il CLI si spawna con fetch mockata.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canonicalDi } from "../lib/devto.mjs";
import { mergeCards, slugFromCanonical, nuove, inEmbargo } from "../lib/edicola.mjs";
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

// CoderLegion non restituisce MAI il source_url (misurato su /posts/25338), e
// con chiave Personal non esiste un endpoint "i miei post" (/users/{handle} ->
// 403 "restricted to Master Key only"). Non c'e' nessuna domanda da fargli per
// sapere se un pezzo e' gia' di la': la risposta deve essere qui.
//
// Ed e' gia' qui: la card in pila E' il registro. `nuove()` e' lo stesso
// filtro che mergeCards usa da sempre per non fare doppioni — esportarlo
// permette al CLI di sapere COSA postare PRIMA di postarlo. Un secondo filtro
// scritto a parte divergerebbe dal primo, e il doppione tornerebbe da li'.
test("nuove: e' lo stesso filtro di mergeCards, non una seconda lista", () => {
  const pubblicati = [
    { slug: "a", url: "https://dev.to/mk023/a", anno: "2026", label: { it: "A", en: "A" } },
    { slug: "tool-use-jobsearch", url: "https://dev.to/mk023/tool-use-3cjg", anno: "2026", label: { it: "x", en: "x" } },
  ];
  const n = nuove(CARDS, pubblicati);
  assert.deepEqual(n.map((p) => p.slug), ["a"]);
  // Il giro completo: cio' che nuove() seleziona e' esattamente cio' che
  // mergeCards aggiunge. Se le due meta' divergono, questo test cade.
  assert.deepEqual(mergeCards(CARDS, pubblicati).slice(0, n.length).map((c) => c.slug), ["a"]);
});

// I dieci pezzi gia' in pila NON vanno cross-postati: il cron ripubblicherebbe
// mesi di archivio su CoderLegion al primo run. Il filtro e' gia' quello giusto
// — solo le card NUOVE nascono, quindi solo quelle vengono postate — ma la
// guardia sta qui perche' e' la differenza fra "esce il pezzo del 28" e "escono
// nove pezzi tutti insieme".
test("nuove: le card gia' in pila non tornano mai, nessun ripescaggio d'archivio", () => {
  const gia = CARDS.map((c) => ({ slug: c.slug, url: c.href, anno: "2026", label: c.label }));
  assert.deepEqual(nuove(CARDS, gia), []);
});

// Il doppione del 22-07-2026: "audit-di-se" era nato DUE volte su dev.to, col
// canonical con e senza slash. `slugFromCanonical` accetta di proposito
// entrambe le forme, quindi i due articoli danno lo STESSO slug — e nessuno dei
// due e' in pila, quindi passavano entrambi. Due create su CoderLegion e due
// card con lo stesso slug, exit 0. Il filtro deve deduplicare anche fra i
// candidati, non solo contro la pila.
test("nuove: due articoli dev.to sullo stesso slug -> uno solo, il primo", () => {
  const doppio = [
    { slug: "csp-a-hash", url: "https://dev.to/mk023/csp-1abc", anno: "2026", label: { it: "x", en: "x" } },
    { slug: "csp-a-hash", url: "https://dev.to/mk023/csp-2def", anno: "2026", label: { it: "x", en: "x" } },
  ];
  assert.deepEqual(nuove(CARDS, doppio).map((p) => p.url), ["https://dev.to/mk023/csp-1abc"]);
  assert.equal(mergeCards(CARDS, doppio).length, CARDS.length + 1, "una card sola, non due");
});

test("mergeCards: card nuova con id CoderLegion -> sub con entrambe le fonti", () => {
  const out = mergeCards(CARDS, [{
    slug: "csp-a-hash",
    url: "https://dev.to/mk023/csp-a-hash-1abc",
    anno: "2026",
    label: { it: "CSP a hash", en: "Hash-based CSP" },
    coderlegion: 25431,
  }]);
  assert.deepEqual(out[0].sub, { it: "dev.to · coderlegion · 2026", en: "dev.to · coderlegion · 2026" });
  assert.equal(out[0].coderlegion, 25431, "l'id resta nel dato: e' il registro di cosa e' stato creato");
  assert.equal(out[0].href, "https://dev.to/mk023/csp-a-hash-1abc", "la card resta un solo link, e resta dev.to");
});

// Il post CoderLegion puo' fallire mentre dev.to e' andato: la card deve
// nascere lo stesso, e dire il vero — solo dev.to. Una card che dichiara
// coderlegion senza averlo creato e' una bugia che nessun test successivo vede.
test("mergeCards: card nuova senza id CoderLegion -> sub con la sola dev.to", () => {
  const out = mergeCards(CARDS, [{
    slug: "csp-a-hash", url: "https://dev.to/mk023/csp-a-hash-1abc", anno: "2026",
    label: { it: "CSP a hash", en: "Hash-based CSP" },
  }]);
  assert.deepEqual(out[0].sub, { it: "dev.to · 2026", en: "dev.to · 2026" });
  assert.ok(!("coderlegion" in out[0]), "niente chiave coderlegion quando il post non c'e'");
});

// L'orchestrazione del cross-post vive nel top-level del CLI, e i test puri non
// la toccano: la revisione avversaria ha mutato `for (const p of nuove(...))` in
// `for (const p of [])` — cioe' ha CANCELLATO il cross-post — e la suite e'
// rimasta a 265 pass, 0 fail. Con lei sono sopravvissute la perdita dell'id, lo
// scambio EN/IT (su CoderLegion sarebbe finito l'articolo italiano col canonical
// inglese) e il canonical preso da dev.to invece che dal nostro — che regalerebbe
// a dev.to esattamente il SEO che tutta la canonical-first esiste per tenere.
// Questo test gira il CLI vero e le uccide tutte e quattro.
const FILE_CARD = new URL("../../astro-project/src/data/edicola.json", import.meta.url);
const feedVuoto = { match: "categories/articles/posts", body: { status: "success", data: [] } };

test("CLI edicola: una card nuova -> POST su CoderLegion col pezzo EN e il nostro canonical", async () => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { parseArticle } = await import("../lib/devto.mjs");
  const originale = await readFile(FILE_CARD, "utf8");
  const SLUG = "thirteen-prs-one-afternoon"; // it+en presenti, data passata, card in pila
  const en = parseArticle(await readFile(new URL(`../../astro-project/src/content/writing/en/${SLUG}.md`, import.meta.url), "utf8"));

  try {
    // Si toglie la sua card: cosi' il pezzo torna "nuovo" e il cammino completo gira.
    const senza = JSON.parse(originale).filter((c) => c.slug !== SLUG);
    assert.equal(senza.length, JSON.parse(originale).length - 1, "la fixture presuppone quella card in pila");
    await writeFile(FILE_CARD, JSON.stringify(senza, null, 2) + "\n");

    const r = runEngine(["engine/edicola.mjs"], [
      feedVuoto,
      { match: "coderlegion.com/api/v1/posts", method: "POST", status: 201,
        body: { status: "success", queued: false, data: { id: 25431 } } },
      { match: "articles/me/published", body: [{
        url: "https://dev.to/mk023/13-pr-1274",
        canonical_url: `https://marcobellingeri.dev/en/writing/${SLUG}/`,
        published_at: "2026-04-15T08:00:00Z",
      }] },
    ], { DEVTO_API_KEY: "dk_fake", CODERLEGION_API_KEY: "cl_fake" });

    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /coderlegion: creato thirteen-prs-one-afternoon/,
      "il cross-post non e' partito: il ciclo puo' essere stato svuotato");

    const scritte = JSON.parse(await readFile(FILE_CARD, "utf8"));
    const card = scritte.find((c) => c.slug === SLUG);
    assert.equal(card.coderlegion, 25431, "l'id non e' finito nel registro");
    assert.equal(card.sub.en, "dev.to · coderlegion · 2026");
    assert.equal(card.href, "https://dev.to/mk023/13-pr-1274", "la card resta un solo link, e resta dev.to");
  } finally {
    await writeFile(FILE_CARD, originale);
  }
});

// La seconda meta' del test sopra: cosa e' stato MANDATO. Gira lo stesso cammino
// e legge il corpo della POST dal log del figlio, perche' lo scambio EN/IT e il
// canonical sbagliato non si vedono guardando la card.
test("CLI edicola: alla POST vanno il corpo EN e il canonical costruito da noi", async () => {
  const { readFile, writeFile } = await import("node:fs/promises");
  const { parseArticle, canonicalDi } = await import("../lib/devto.mjs");
  const originale = await readFile(FILE_CARD, "utf8");
  const SLUG = "thirteen-prs-one-afternoon";
  const base = new URL("../../astro-project/src/content/writing/", import.meta.url);
  const en = parseArticle(await readFile(new URL(`en/${SLUG}.md`, base), "utf8"));
  const it = parseArticle(await readFile(new URL(`it/${SLUG}.md`, base), "utf8"));
  assert.notEqual(en.body, it.body, "la fixture non discrimina se i due corpi sono uguali");

  try {
    await writeFile(FILE_CARD, JSON.stringify(JSON.parse(originale).filter((c) => c.slug !== SLUG), null, 2) + "\n");
    const r = runEngine(["engine/edicola.mjs"], [
      feedVuoto,
      { match: "coderlegion.com/api/v1/posts", method: "POST", status: 201,
        body: { status: "success", queued: false, data: { id: 25431 } } },
      { match: "articles/me/published", body: [{
        url: "https://dev.to/mk023/13-pr-1274",
        canonical_url: canonicalDi(SLUG),
        published_at: "2026-04-15T08:00:00Z",
      }] },
    ], { DEVTO_API_KEY: "dk_fake", CODERLEGION_API_KEY: "cl_fake", FETCH_LOG: "1" });

    assert.equal(r.code, 0, r.stderr);
    const riga = r.stdout.split("\n").map((l) => l.match(/^FETCH_LOG=(.*)$/)).find(Boolean);
    assert.ok(riga, "nessuna richiesta col corpo: la POST non e' partita");
    const inviato = JSON.parse(JSON.parse(riga[1]).body);
    assert.equal(inviato.title, en.title);
    assert.equal(inviato.content, en.body, "su CoderLegion e' finito il corpo sbagliato (IT invece di EN?)");
    assert.equal(inviato.source_url, canonicalDi(SLUG),
      "il canonical dev'essere il NOSTRO: preso da dev.to, regalerebbe a dev.to il SEO del pezzo");
    assert.equal(inviato.category_id, 2);
  } finally {
    await writeFile(FILE_CARD, originale);
  }
});

// Il cancello del rilascio e' la nostra `date`, non la risposta di dev.to: un
// pezzo sotto embargo non parte verso un terzo neanche se dev.to lo dichiara
// pubblicato. `oggi` e' iniettato, non letto dall'orologio: un test che dipende
// dal giorno in cui gira comincia a mentire da solo il giorno dopo.
test("inEmbargo: la data futura ferma il pezzo, quella arrivata lo lascia passare", () => {
  assert.equal(inEmbargo({ date: "2026-08-28" }, "2026-08-25"), true);
  assert.equal(inEmbargo({ date: "2026-08-25" }, "2026-08-25"), false, "il giorno dell'uscita esce");
  assert.equal(inEmbargo({ date: "2026-04-15" }, "2026-08-25"), false);
  // Un frontmatter senza data non deve diventare un lasciapassare per errore:
  // parseArticle la pretende, ma questa funzione decide cosa esce verso terzi.
  assert.equal(inEmbargo({}, "2026-08-25"), false);
  assert.equal(inEmbargo(undefined, "2026-08-25"), false);
});

test("CLI edicola: senza CODERLEGION_API_KEY -> exit 1 e niente scrittura", () => {
  const r = runEngine(["engine/edicola.mjs"], [], { DEVTO_API_KEY: "dk_fake", CODERLEGION_API_KEY: "" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /CODERLEGION_API_KEY/);
});

test("CLI edicola: senza DEVTO_API_KEY -> exit 1 e niente scrittura", () => {
  const r = runEngine(["engine/edicola.mjs"], [], { DEVTO_API_KEY: "", CODERLEGION_API_KEY: "cl_fake" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /DEVTO_API_KEY/);
});

test("CLI edicola: nessun articolo con canonical nostro -> nessuna card nuova", () => {
  const r = runEngine(["engine/edicola.mjs"], [
    { match: "/api/articles/me/published", body: [
      { url: "https://dev.to/mk023/altro", canonical_url: "https://dev.to/mk023/altro", published_at: "2026-07-21T08:00:00Z" },
    ] },
  ], { DEVTO_API_KEY: "dk_fake", CODERLEGION_API_KEY: "cl_fake" });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /nessuna card nuova/);
  assert.doesNotMatch(r.stdout, /coderlegion/, "nessuna card nuova = nessuna create, e nessuna chiamata a vuoto");
});
