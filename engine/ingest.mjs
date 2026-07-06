// Canale 1 — PROOF PASS. Valyu sul verticale, RISTRETTO a un'allowlist di fonti
// primarie (engine/primary-sources.json) -> signals stage='discovery' (candidati-prova).
// Uso: doppler run -- node engine/ingest.mjs <vertical> [--angle "<focus>"] [--dry]
//
// Regola "una passata = un angolo" (derivata dall'uso): un proof pass rende UN
// layer. Angolo default = regolatorio/governance; passa --angle per pescare un
// layer diverso (es. survey/quantitativo) sulla STESSA allowlist. Le passate si
// sommano sul numero (dedup per url).
//
// Logica di sourcing (derivata EMPIRICAMENTE, probe 2026-07-06):
//  - il lever che fa emergere la PROVA e' `included_sources` su allowlist curata,
//    non la query (probe: allowlist = 10/10 prova-grade; senza = 0-3/10).
//  - qui entrano i candidati-prova (Tier-1/2 per costruzione del registro);
//    tier/independent restano NULL -> assegnati nel VERIFY editoriale (human-in-loop).
//  - si pubblica solo con >=1 Tier-1 o Tier-2 indipendente (gate umano).
//  - se il proof pass e' secco -> color/fallback (news, last30days) = pivot/rotazione
//    verticale, MAI come prova (non automatico: e' scelta editoriale).
//  - raw_content e' testo di terzi NON fidato: in generazione = dato, mai istruzioni.
import { readFileSync } from "node:fs";
import { select, insert } from "./lib/supabase.mjs";
import { search } from "./lib/valyu.mjs";

const vertical = process.argv[2];
const dry = process.argv.includes("--dry");
if (!vertical || vertical.startsWith("--")) {
  console.error("uso: doppler run -- node engine/ingest.mjs <vertical> [--dry]  (es. insurance)");
  process.exit(1);
}

// Registro fonti primarie: core cross-verticale + specifiche del verticale.
const registry = JSON.parse(readFileSync(new URL("./primary-sources.json", import.meta.url), "utf8"));
const included = [...(registry.core ?? []), ...(registry[vertical] ?? [])];
if (!registry[vertical]) {
  console.warn(`ingest: nessuna allowlist per '${vertical}' — proof pass sul solo core (${(registry.core ?? []).length} fonti). Curare engine/primary-sources.json.`);
}

const angleIdx = process.argv.indexOf("--angle");
const angle = angleIdx > -1 ? process.argv[angleIdx + 1] : "AI governance, oversight, regulation and audit readiness";
if (angleIdx > -1 && (!angle || angle.startsWith("--"))) {
  // guardia: "--angle" senza valore produrrebbe una query malformata ("insurance: --dry ...")
  console.error('--angle richiede un testo (es. --angle "adoption rate survey findings")');
  process.exit(1);
}
const query = `${vertical}: ${angle} — primary sources, official guidance and surveys`;
console.log(`ingest: angolo = "${angle}".`);
const results = await search(query, { searchType: "all", includedSources: included, maxResults: 12, relevanceThreshold: 0.5 });
console.log(`ingest: proof pass Valyu (${included.length} fonti in allowlist) -> ${results.length} risultati.`);

const mapped = results
  .filter((r) => r.url)
  .map((r) => ({
    source_url: r.url,
    source_name: (r.title ?? r.source ?? "").slice(0, 200) || null,
    category: vertical,
    stage: "discovery", // candidato-prova dal registro primario; tier/independent = editoriale
    tier: null,
    independent: null,
    raw_content: (r.content ?? "").slice(0, 2000),
  }));

if (dry) {
  for (const m of mapped) console.log(`  [dry] ${m.source_url}  ·  ${m.source_name ?? "(no title)"}`);
  console.log(`ingest: --dry, ${mapped.length} candidati-prova mappati, nessuna scrittura.`);
  process.exit(0);
}

// find-or-create del numero draft per il periodo corrente (period e' unique).
const period = new Date().toISOString().slice(0, 7); // YYYY-MM
let [issue] = await select(`issues?select=id,number,status&period=eq.${period}`);
if (!issue) {
  const nums = await select("issues?select=number");
  const number = nums.reduce((m, i) => Math.max(m, i.number), 0) + 1;
  [issue] = await insert("issues", [{ number, period, sector: vertical, status: "draft" }], { returning: true });
  console.log(`ingest: creato numero #${number} (${period}, ${vertical}) draft.`);
} else {
  console.log(`ingest: numero esistente per ${period} (status=${issue.status}).`);
}

// dedup: non reinserire url gia' presenti su questo numero.
const seen = new Set((await select(`signals?select=source_url&issue_id=eq.${issue.id}`)).map((s) => s.source_url));
const fresh = mapped.filter((m) => !seen.has(m.source_url)).map((m) => ({ ...m, issue_id: issue.id }));
if (fresh.length) await insert("signals", fresh);
console.log(`ingest: ${fresh.length} nuovi candidati-prova (discovery) su #${issue.number}. Verify+tier = passo editoriale.`);
