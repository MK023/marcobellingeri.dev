// engine/edicola.mjs
// Card automatiche dell'Edicola: interroga dev.to (articoli PUBBLICATI con
// canonical sul sito) e aggiunge le card mancanti a src/data/edicola.json.
// Il publish resta un gesto umano su dev.to: qui si fotografa l'esito.
// L'etichetta viene dal frontmatter `edicola` (corta) o dal titolo.
// Run: doppler run -- node engine/edicola.mjs
import { readFile, writeFile } from "node:fs/promises";
import { parseArticle, publishedArticles } from "./lib/devto.mjs";
import { annoPubblicazione, hrefSicuro, mergeCards, slugFromCanonical } from "./lib/edicola.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("edicola");

const FILE = new URL("../astro-project/src/data/edicola.json", import.meta.url);
const cards = JSON.parse(await readFile(FILE, "utf8"));

const pubblicati = [];
for (const a of await publishedArticles()) {
  const slug = slugFromCanonical(a.canonical_url);
  if (!slug) continue;
  // Il canonical dice che l'articolo è nostro; l'url dice dove va il lettore, e
  // quello arriva dalla stessa risposta non fidata. Va guardato a parte.
  const href = hrefSicuro(a.url);
  if (!href) {
    // L'url scartato entra nel log, tagliato e passato da logsafe: su una run
    // verde questa riga è l'unica traccia, e senza sapere QUALE url era non ci si
    // fa niente. Non va invece nel messaggio grezzo: arriva da fuori.
    console.error(
      `edicola: salto ${logsafe(slug)} — url non ammesso (serve https su dev.to): ${logsafe(String(a.url).slice(0, 200))}`,
    );
    continue;
  }
  const label = {};
  for (const lang of ["it", "en"]) {
    const file = new URL(`../astro-project/src/content/writing/${lang}/${slug}.md`, import.meta.url);
    const md = await readFile(file, "utf8").catch(() => null);
    if (md === null) break; // canonical nostro ma file assente: card impossibile, salta
    const art = parseArticle(md);
    label[lang] = art.edicola ?? art.title;
  }
  if (!label.it || !label.en) {
    console.error(`edicola: salto ${logsafe(slug)} — manca la coppia it/en nella writing collection`);
    continue;
  }
  // Se la data non si legge si usa l'anno corrente: una card con l'anno di oggi è
  // meno sbagliata di una senza anno, e l'articolo esiste adesso. Prima ci finiva
  // solo la data VUOTA: `"abcd-01-01".slice(0,4)` tornava "abcd", e quella stringa
  // arrivava fino alla card.
  const anno = annoPubblicazione(a.published_at) ?? String(new Date().getUTCFullYear());
  // `href` e non `a.url`: si salva la forma normalizzata, cioè quella guardata.
  pubblicati.push({ slug, url: href, anno, label });
}

const merged = mergeCards(cards, pubblicati);
if (merged === cards) {
  console.log("edicola: nessuna card nuova");
} else {
  await writeFile(FILE, JSON.stringify(merged, null, 2) + "\n");
  console.log(`edicola: +${merged.length - cards.length} card (${merged.length} in pila)`);
}
