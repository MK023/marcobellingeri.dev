// engine/devto.mjs
// Cross-post canonical-first: writing collection (EN) -> dev.to. Draft di default,
// live solo con --publish; idempotente per canonical_url (re-run = update).
// Run: doppler run -- node engine/devto.mjs <slug> [--publish]
import { readFile } from "node:fs/promises";
import { parseArticle, upsertArticle } from "./lib/devto.mjs";
import { logsafe } from "./lib/logsafe.mjs";

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const slug = args.find((a) => !a.startsWith("--"));
// Lo slug entra in un path: solo minuscole/cifre/trattini, niente traversal.
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("uso: node engine/devto.mjs <slug> [--publish]");
  process.exit(1);
}

const file = new URL(`../astro-project/src/content/writing/en/${slug}.md`, import.meta.url);
const md = await readFile(file, "utf8").catch(() => null);
if (md === null) {
  console.error(`devto: articolo non trovato: writing/en/${slug}.md`);
  process.exit(1);
}

const canonicalUrl = `https://marcobellingeri.dev/en/writing/${slug}`;
const r = await upsertArticle({ ...parseArticle(md), canonicalUrl, publish });
console.log(`devto: ${r.updated ? "aggiornato" : "creato"} id ${logsafe(r.id)} — ${publish ? "PUBBLICATO" : "draft"} — ${logsafe(r.url ?? "")}`);
console.log(`devto: canonical -> ${canonicalUrl}`);
