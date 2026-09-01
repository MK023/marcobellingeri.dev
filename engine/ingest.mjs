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
import { logsafe } from "./lib/logsafe.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("ingest");

// L'angolo del magazine: IA utile APPLICATA sul lavoro (adozione, pratica,
// risultati concreti), non governance/regolamentazione — che aveva reso il #1
// staccato dal sito. Entra nella query Valyu (buildQuery) e nel focus di generate.
export const DEFAULT_ANGLE = "how teams put AI to work in engineering practice: real use, patterns and measurable outcomes";

// Allowlist = core cross-verticale + fonti del verticale. Solo chiavi proprie e
// reali del registro (niente chiavi di servizio "_*", "core" come verticale, o
// chiavi ereditate). Il prefisso `_` e' la convenzione: prima era il solo "_doc"
// nominato a mano, e "_rotation" sarebbe passato per un verticale con dentro
// nomi di verticali invece di domini.
export function buildAllowlist(registry, vertical) {
  const extra = vertical !== "core" && !vertical.startsWith("_") && Object.hasOwn(registry, vertical)
    ? registry[vertical]
    : [];
  return [...(registry.core ?? []), ...extra];
}

// I verticali in rotazione. Sta nel registro e non nel workflow perche' la
// domanda "quali verticali esistono" e "quali ne escono a turno" sono due cose
// diverse: togliere insurance dalla rotazione (01/09/2026) non deve cancellare
// le sue fonti, che restano curate per quando tornera'. Senza `_rotation` si
// ricade sulle chiavi, che e' il comportamento di prima.
// La validazione NON e' difensiva per abitudine: senza, una rotazione degenere
// non fallisce, RIESCE MALE. `??` non copre `_rotation: []` (un array vuoto e'
// truthy), e da li': `x % 0` = NaN, `[][NaN]` = undefined, che `console.log`
// stampa come la STRINGA "undefined" — e la guardia `^[a-z0-9-]+$` del workflow
// la accetta. Il cron mensile girerebbe su un verticale inesistente: ricerca
// Valyu pagata, numero draft con `sector: "undefined"` a DB, issue aperta a
// Marco, check-in Sentry `ok`, job verde. Su un cron non presidiato non se ne
// accorgerebbe nessuno. Anche una stringa passa: `"security"` ha `.length` 8 e
// l'indice ne pesca UN CARATTERE.
export function rotazione(registry) {
  const r = registry._rotation ?? Object.keys(registry).filter((k) => !k.startsWith("_") && k !== "core");
  if (!Array.isArray(r) || r.length === 0 || r.some((v) => typeof v !== "string" || !v)) {
    throw new Error("primary-sources.json: `_rotation` deve essere una lista non vuota di nomi di verticali");
  }
  return r;
}

// Indice deterministico sul mese. NON e' stabile agli edit del registro: il
// modulo e' sulla LUNGHEZZA, quindi aggiungere o togliere un verticale rimescola
// anche i mesi degli altri. E' accettato — il calendario non e' un impegno — ma
// va saputo prima di toccare `_rotation`, non dopo.
export function verticaleDelMese(registry, now = new Date()) {
  const r = rotazione(registry);
  return r[(now.getUTCFullYear() * 12 + now.getUTCMonth()) % r.length];
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
    // Senza titolo la chiave dominio+titolo collasserebbe risultati diversi dello
    // stesso dominio: si ricade sull'URL. Il dedup scatta sempre, titolo o no.
    const key = title ? `${domain}|${title.toLowerCase().replace(/\s+/g, " ")}` : url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    const garbage = title.length < 4 || /^\d+$/.test(title);
    const name = garbage ? (url.pathname.split("/").findLast(Boolean) ?? title) : title;
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
    console.log(`ingest: creato numero #${logsafe(number)} (${period}, ${logsafe(vertical)}) draft.`);
  } else {
    console.log(`ingest: numero esistente per ${period} (status=${logsafe(issue.status)}).`);
  }

  const seen = (await select(pg`signals?select=source_url&issue_id=eq.${issue.id}`)).map((s) => s.source_url);
  const fresh = dedupFresh(mapped, seen, issue.id);
  await trace.span("signals-insert",
    { input: { mapped: mapped.length, dejaVu: seen.length }, summarize: () => ({ fresh: fresh.length, issue: issue.number }) },
    async () => { if (fresh.length) await insert("signals", fresh); });
  console.log(`ingest: ${fresh.length} nuovi candidati-prova (discovery) su #${logsafe(issue.number)}. Verify+tier = passo editoriale.`);
  await trace.flush();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
