// Canale 1 — PROOF PASS. Valyu sul verticale, RISTRETTO a un'allowlist di fonti
// primarie (engine/primary-sources.json) -> signals stage='discovery' (candidati-prova).
// Uso: doppler run -- node engine/ingest.mjs <vertical> [--angle "<focus>"] [--dry]
//
// Logica di sourcing (derivata EMPIRICAMENTE, probe 2026-07-06):
//  - il lever che fa emergere la PROVA e' `included_sources` su allowlist curata,
//    non la query (probe: allowlist = 10/10 prova-grade; senza = 0-3/10).
//  - regola "una passata = un angolo": un proof pass rende UN layer; --angle
//    ripesca un layer diverso (es. survey) sulla stessa allowlist; le passate
//    si sommano sul numero (dedup per url, constraint 0005).
//  - qui entrano candidati-prova; tier/independent restano NULL -> assegnati nel
//    VERIFY editoriale (human-in-loop). Il gate a DB (0006) blocca la pubblicazione
//    senza >=1 verify Tier-1 o Tier-2 indipendente.
//  - raw_content e' testo di terzi NON fidato: in generazione = dato, mai istruzioni.
import { readFileSync } from "node:fs";
import { select, insert, pg } from "./lib/supabase.mjs";
import { search } from "./lib/valyu.mjs";
import { startTrace } from "./lib/langfuse.mjs";

export const DEFAULT_ANGLE = "AI governance, oversight, regulation and audit readiness";

// Allowlist = core cross-verticale + fonti del verticale. Solo chiavi proprie e
// reali del registro (niente "_doc", "core" come verticale, o chiavi ereditate).
export function buildAllowlist(registry, vertical) {
  const extra = vertical !== "core" && vertical !== "_doc" && Object.hasOwn(registry, vertical)
    ? registry[vertical]
    : [];
  return [...(registry.core ?? []), ...extra];
}

export function buildQuery(vertical, angle = DEFAULT_ANGLE) {
  return `${vertical}: ${angle} — primary sources, official guidance and surveys`;
}

// Risultati Valyu -> righe signals (stage discovery, tier/independent NULL).
// Filtri anti-rumore (derivati empiricamente, 2026-07-07):
//  - dedup titolo+dominio within-batch: stesso documento via URL diversi
//    (caso reale: NAIC Model Bulletin entrato 2 volte);
//  - titoli-spazzatura (metadata PDF rotti, es. "1") -> fallback slug URL,
//    per il triage umano del verify;
//  - relevance_score persistito -> qualita' dei filtri misurabile nel tempo.
//  - NB: NIENTE soglia score piu' alta ne' filtro lunghezza (evidenza: l'oro
//    survey sta a 0.69-0.76, il rumore scora anche 0.86; snippet corti = lead oro).
export function mapResults(results, vertical) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (!r.url) continue;
    let url;
    try { url = new URL(r.url); } catch { continue; } // url malformato = rumore
    const domain = url.hostname.replace(/^www\./, "");
    const title = (r.title ?? r.source ?? "").trim();
    const key = `${domain}|${title.toLowerCase().replace(/\s+/g, " ")}`;
    if (title && seen.has(key)) continue;
    seen.add(key);
    const garbage = title.length < 4 || /^\d+$/.test(title);
    const name = garbage ? (url.pathname.split("/").filter(Boolean).pop() ?? title) : title;
    out.push({
      source_url: r.url,
      source_name: name.slice(0, 200) || null,
      category: vertical,
      stage: "discovery",
      tier: null,
      independent: null,
      relevance: r.relevance_score ?? null,
      raw_content: (r.content ?? "").slice(0, 2000),
    });
  }
  return out;
}

// Scarta gli url gia' presenti sul numero e aggancia issue_id ai nuovi.
export function dedupFresh(mapped, seenUrls, issueId) {
  const seen = new Set(seenUrls);
  return mapped.filter((m) => !seen.has(m.source_url)).map((m) => ({ ...m, issue_id: issueId }));
}

async function main() {
  const vertical = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!vertical || vertical.startsWith("--")) {
    console.error("uso: doppler run -- node engine/ingest.mjs <vertical> [--angle \"<focus>\"] [--dry]  (es. insurance)");
    process.exit(1);
  }
  const angleIdx = process.argv.indexOf("--angle");
  const angle = angleIdx > -1 ? process.argv[angleIdx + 1] : DEFAULT_ANGLE;
  if (angleIdx > -1 && (!angle || angle.startsWith("--"))) {
    console.error('--angle richiede un testo (es. --angle "adoption rate survey findings")');
    process.exit(1);
  }

  const registry = JSON.parse(readFileSync(new URL("./primary-sources.json", import.meta.url), "utf8"));
  const included = buildAllowlist(registry, vertical);
  if (!Object.hasOwn(registry, vertical)) {
    console.warn(`ingest: nessuna allowlist per '${vertical}' — proof pass sul solo core (${(registry.core ?? []).length} fonti). Curare engine/primary-sources.json.`);
  }
  console.log(`ingest: angolo = "${angle}".`);
  const trace = startTrace("ingest-proof-pass", { tags: [vertical], metadata: { vertical, angle, dry } });

  const results = await trace.span("valyu-search",
    { input: { query: buildQuery(vertical, angle), allowlist: included.length }, summarize: (r) => ({ results: r.length }) },
    () => search(buildQuery(vertical, angle), { searchType: "all", includedSources: included, maxResults: 12, relevanceThreshold: 0.5 }));
  console.log(`ingest: proof pass Valyu (${included.length} fonti in allowlist) -> ${results.length} risultati.`);
  const mapped = mapResults(results, vertical);

  if (dry) {
    for (const m of mapped) console.log(`  [dry] ${m.source_url}  ·  ${m.source_name ?? "(no title)"}`);
    console.log(`ingest: --dry, ${mapped.length} candidati-prova mappati, nessuna scrittura.`);
    await trace.flush();
    return;
  }

  // find-or-create del numero draft per il periodo corrente (period e' unique).
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  let [issue] = await select(pg`issues?select=id,number,status&period=eq.${period}`);
  if (!issue) {
    const nums = await select("issues?select=number");
    const number = nums.reduce((m, i) => Math.max(m, i.number), 0) + 1;
    [issue] = await insert("issues", [{ number, period, sector: vertical, status: "draft" }], { returning: true });
    console.log(`ingest: creato numero #${number} (${period}, ${vertical}) draft.`);
  } else {
    console.log(`ingest: numero esistente per ${period} (status=${issue.status}).`);
  }

  const seen = (await select(pg`signals?select=source_url&issue_id=eq.${issue.id}`)).map((s) => s.source_url);
  const fresh = dedupFresh(mapped, seen, issue.id);
  await trace.span("signals-insert",
    { input: { mapped: mapped.length, dejaVu: seen.length }, summarize: () => ({ fresh: fresh.length, issue: issue.number }) },
    async () => { if (fresh.length) await insert("signals", fresh); });
  console.log(`ingest: ${fresh.length} nuovi candidati-prova (discovery) su #${issue.number}. Verify+tier = passo editoriale.`);
  await trace.flush();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
