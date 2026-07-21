// engine/edicola.mjs
// Card automatiche dell'Edicola: interroga dev.to (articoli PUBBLICATI con
// canonical sul sito) e aggiunge le card mancanti a src/data/edicola.json.
// Il publish resta un gesto umano su dev.to: qui si fotografa l'esito.
// L'etichetta viene dal frontmatter `edicola` (corta) o dal titolo.
// Run: doppler run -- node engine/edicola.mjs
import { readFile, writeFile } from "node:fs/promises";
import { parseArticle, publishedArticles } from "./lib/devto.mjs";
import { mergeCards, slugFromCanonical } from "./lib/edicola.mjs";
import { logsafe } from "./lib/logsafe.mjs";

const FILE = new URL("../astro-project/src/data/edicola.json", import.meta.url);
const cards = JSON.parse(await readFile(FILE, "utf8"));

const pubblicati = [];
for (const a of await publishedArticles()) {
  const slug = slugFromCanonical(a.canonical_url);
  if (!slug) continue;
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
  const anno = (a.published_at ?? "").slice(0, 4) || String(new Date().getUTCFullYear());
  pubblicati.push({ slug, url: a.url, anno, label });
}

const merged = mergeCards(cards, pubblicati);
if (merged === cards) {
  console.log("edicola: nessuna card nuova");
} else {
  await writeFile(FILE, JSON.stringify(merged, null, 2) + "\n");
  console.log(`edicola: +${merged.length - cards.length} card (${merged.length} in pila)`);
}
