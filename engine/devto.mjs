// engine/devto.mjs
// Cross-post canonical-first: writing collection (EN) -> dev.to. Draft di default,
// live solo con --publish; idempotente per canonical_url (re-run = update).
// Run: doppler run -- node engine/devto.mjs <slug> [--publish]
//      doppler run -- node engine/devto.mjs --due
//
// --due = uscita programmata: pubblica i pezzi la cui `date` e' arrivata e che non
// sono ancora live, e stampa quelli in uscita domani (il workflow ne fa il
// preavviso). L'approvazione resta UNA, al merge della PR: qui non si decide
// nulla di editoriale, si gira l'interruttore alla data che l'autore ha scritto.
import { readFile, readdir } from "node:fs/promises";
import { parseArticle, upsertArticle, publishedArticles, inUscita } from "./lib/devto.mjs";
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("devto");

const WRITING_EN = new URL("../astro-project/src/content/writing/en/", import.meta.url);
const canonicalDi = (slug) => `https://marcobellingeri.dev/en/writing/${slug}`;

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const due = args.includes("--due");

if (due) {
  // Gli slug arrivano da nomi di file del repo, ma finiscono in un URL: stessa
  // regola del ramo a slug singolo, nessuna eccezione per "tanto e' roba nostra".
  const nomi = (await readdir(WRITING_EN))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((s) => /^[a-z0-9-]+$/.test(s));

  const articoli = [];
  for (const slug of nomi) {
    const md = await readFile(new URL(`${slug}.md`, WRITING_EN), "utf8");
    articoli.push({ slug, ...parseArticle(md), canonicalUrl: canonicalDi(slug) });
  }

  const canonicalPubblicati = (await publishedArticles()).map((a) => a.canonical_url);
  const oggi = new Date().toISOString().slice(0, 10);
  const { daPubblicare, domani } = inUscita({ articoli, canonicalPubblicati, oggi });

  for (const a of daPubblicare) {
    const r = await upsertArticle({ ...a, publish: true });
    console.log(`devto: PUBBLICATO ${a.slug} (data ${a.date}) — ${logsafe(r.url ?? "")}`);
  }
  if (!daPubblicare.length) console.log(`devto: niente in uscita oggi (${oggi})`);

  // Riga di contratto col workflow: da qui nasce l'issue di preavviso.
  console.log(`DOMANI=${domani.map((a) => a.slug).join(",")}`);
  process.exit(0);
}

const slug = args.find((a) => !a.startsWith("--"));
// Lo slug entra in un path: solo minuscole/cifre/trattini, niente traversal.
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("uso: node engine/devto.mjs <slug> [--publish] | node engine/devto.mjs --due");
  process.exit(1);
}

const file = new URL(`${slug}.md`, WRITING_EN);
const md = await readFile(file, "utf8").catch(() => null);
if (md === null) {
  console.error(`devto: articolo non trovato: writing/en/${slug}.md`);
  process.exit(1);
}

const canonicalUrl = canonicalDi(slug);
const r = await upsertArticle({ ...parseArticle(md), canonicalUrl, publish });
console.log(`devto: ${r.updated ? "aggiornato" : "creato"} id ${logsafe(r.id)} — ${publish ? "PUBBLICATO" : "draft"} — ${logsafe(r.url ?? "")}`);
console.log(`devto: canonical -> ${canonicalUrl}`);
