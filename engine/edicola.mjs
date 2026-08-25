// engine/edicola.mjs
// Card automatiche dell'Edicola: interroga dev.to (articoli PUBBLICATI con
// canonical sul sito) e aggiunge le card mancanti a src/data/edicola.json.
// Il publish resta un gesto umano su dev.to: qui si fotografa l'esito.
// L'etichetta viene dal frontmatter `edicola` (corta) o dal titolo.
// Run: doppler run -- node engine/edicola.mjs
//
// Qui nasce anche il cross-post su CoderLegion, e non nel cron del publish, per
// un motivo che e' di dato e non di comodita': CoderLegion non ha nessuna
// idempotenza interrogabile (source_url e' write-only, "i miei post" e' riservato
// alla Master Key — vedi lib/coderlegion.mjs), quindi il registro deve essere
// nostro. Un registro c'e' gia' ed e' edicola.json, e questo e' l'unico workflow
// che lo committa. Un pezzo entra in `nuove()` una volta sola nella sua vita:
// quella e' la volta in cui viene creato di la'. Le card gia' in pila non si
// toccano — altrimenti il primo run ripubblicherebbe mesi di archivio.
import { readFile, writeFile } from "node:fs/promises";
import { parseArticle, publishedArticles, canonicalDi } from "./lib/devto.mjs";
import { creaPost } from "./lib/coderlegion.mjs";
import { mergeCards, slugFromCanonical, nuove } from "./lib/edicola.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("edicola");

// Controllo in testa e non dentro creaPost: la chiave serve solo quando c'e' una
// card nuova, cioe' il giorno in cui un pezzo esce. Scoprire che manca proprio
// quel giorno, dopo aver gia' letto dev.to, e' il momento peggiore.
if (!process.env.CODERLEGION_API_KEY) {
  console.error("missing env: CODERLEGION_API_KEY (usa `doppler run`)");
  process.exit(1);
}

const FILE = new URL("../astro-project/src/data/edicola.json", import.meta.url);
const cards = JSON.parse(await readFile(FILE, "utf8"));

const pubblicati = [];
for (const a of await publishedArticles()) {
  const slug = slugFromCanonical(a.canonical_url);
  if (!slug) continue;
  const label = {};
  let en = null; // l'articolo EN serve intero: e' quello che va su CoderLegion
  for (const lang of ["it", "en"]) {
    const file = new URL(`../astro-project/src/content/writing/${lang}/${slug}.md`, import.meta.url);
    const md = await readFile(file, "utf8").catch(() => null);
    if (md === null) break; // canonical nostro ma file assente: card impossibile, salta
    const art = parseArticle(md);
    label[lang] = art.edicola ?? art.title;
    if (lang === "en") en = art;
  }
  if (!label.it || !label.en) {
    console.error(`edicola: salto ${logsafe(slug)} — manca la coppia it/en nella writing collection`);
    continue;
  }
  const anno = (a.published_at ?? "").slice(0, 4) || String(new Date().getUTCFullYear());
  pubblicati.push({ slug, url: a.url, anno, label, en });
}

// Cross-post su CoderLegion dei soli pezzi che stanno entrando in pila adesso:
// pubblicato su dev.to con canonical nostro = deve stare anche di la'.
//
// Se una create fallisce l'errore sale: niente scrittura, niente commit, e
// domani si riparte da capo — la card mancante rimette il pezzo in `nuove()`.
// La card e il cross-post si muovono insieme, sempre: una card scritta senza
// l'id toglierebbe quel pezzo da `nuove()` per sempre, e la sindacazione
// sparirebbe in silenzio. Un ritardo si vede, una perdita muta no.
for (const p of nuove(cards, pubblicati)) {
  const r = await creaPost({
    title: p.en.title,
    body: p.en.body,
    tags: p.en.tags,
    // Il canonical si ricostruisce da noi e non si rilegge da dev.to: e' la
    // stessa URL che la pagina si dichiara, e non una stringa altrui.
    canonicalUrl: canonicalDi(p.slug),
  });
  p.coderlegion = r.id;
  console.log(`coderlegion: creato ${logsafe(p.slug)} — ${logsafe(r.url)}${r.inCoda ? " (in coda di moderazione)" : ""}`);
}

const merged = mergeCards(cards, pubblicati);
if (merged === cards) {
  console.log("edicola: nessuna card nuova");
} else {
  await writeFile(FILE, JSON.stringify(merged, null, 2) + "\n");
  console.log(`edicola: +${merged.length - cards.length} card (${merged.length} in pila)`);
}
