// Stadio 5 EXPORT (ADR-0002): numero APPROVATO -> file Markdown del MAGAZINE
// (astro-project/src/content/magazine/{it,en}/) -> status=published. NON committa:
// il contenuto lo merge Marco (memoria: il codice lo mergio io, i contenuti lui).
//
// Il magazine è la sezione secondaria degli articoli AI (nei domini di Marco);
// Field Notes resta separato e personale. Gestisce anche i numeri già 'published'
// (ri-esportazione idempotente del contenuto, senza ri-transizione di stato).
//
// Sicurezza: ri-screening di ogni campo testo PRIMA di scriverlo nel repo — ultimo
// cancello prima che il contenuto entri nel codice del sito. I valori finiscono nel
// frontmatter come scalari JSON (YAML è superset): virgolette/newline non rompono
// il YAML né iniettano campi.
//
// Uso: doppler run -- node engine/export.mjs [<period YYYY-MM>]
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { select, update, pg } from "./lib/supabase.mjs";
import { screen } from "./lib/guardrails.mjs";
import { startTrace } from "./lib/langfuse.mjs";
import { catchTopLevel } from "./lib/sentry.mjs";

// Errore non gestito -> Sentry (fail-open) -> exit 1: vedi lib/sentry.mjs.
catchTopLevel("export");

const MAGAZINE_DIR = fileURLToPath(new URL("../astro-project/src/content/magazine", import.meta.url));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

// "2026-07" -> "Luglio 2026" / "July 2026" (Intl, capitalizzata).
const monthLabel = (period, bcp47) => {
  const m = new Date(`${period}-01T00:00:00Z`).toLocaleDateString(bcp47, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

// DB + meta del numero -> forma magazine.
function toIssue(tr, meta, locale) {
  const o = {
    lang: locale,
    number: meta.number,
    sector: meta.sector ?? "",
    month: monthLabel(meta.period, locale === "it" ? "it-IT" : "en-US"),
    date: `${meta.period}-01`,
    title: tr.title,
    problem: tr.problem,
    approach: tr.approach,
    result: tr.result,
    lesson: tr.lesson ?? "",
  };
  if (typeof meta.stat === "number") {
    o.stat = meta.stat;
    o.statSuffix = meta.statSuffix ?? "";
  }
  return o;
}

// Frontmatter con scalari JSON: sicuro contro virgolette/newline/iniezione YAML.
// `number` e `stat` sono numeri (bare); `stat`/`statSuffix` omessi se assenti.
function frontmatter(o) {
  const f = (v) => JSON.stringify(v ?? "");
  const lines = [
    "---",
    `lang: ${f(o.lang)}`,
    `number: ${o.number}`,
    `sector: ${f(o.sector)}`,
    `month: ${f(o.month)}`,
    `date: ${f(o.date)}`,
    `title: ${f(o.title)}`,
  ];
  if (typeof o.stat === "number") {
    lines.push(`stat: ${o.stat}`, `statSuffix: ${f(o.statSuffix)}`);
  }
  lines.push(
    `problem: ${f(o.problem)}`,
    `approach: ${f(o.approach)}`,
    `result: ${f(o.result)}`,
    `lesson: ${f(o.lesson)}`,
    "---",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const period = process.argv[2] ?? null;
  if (period && !PERIOD.test(period)) throw new Error(`period non valido: ${period} (atteso YYYY-MM)`);
  const trace = startTrace("export-issue", { tags: ["engine", "export"], metadata: { period: period ?? "all" } });

  try {
    const base = "issues?select=id,number,period,sector,status&status=in.(approved,published)&order=number.asc";
    // base FUORI dal tag: pg`` codifica ogni valore interpolato, e una querystring
    // passata come valore diventerebbe issues%3Fselect%3D... → 404 PostgREST.
    // Stesso pattern di competitors.mjs: si interpola solo il dato, mai la query.
    const issues = await select(period ? base + pg`&period=eq.${period}` : base);
    if (!issues.length) throw new Error(period ? `nessun numero approved/published per ${period}` : "nessun numero approved/published da esportare");

    for (const issue of issues) {
      const [article] = await select(pg`articles?select=id,slug,stat,stat_suffix&issue_id=eq.${issue.id}&limit=1`);
      if (!article) { console.warn(`numero ${issue.number}: nessun articolo, salto`); continue; }
      if (!SLUG.test(article.slug)) throw new Error(`numero ${issue.number}: slug non sicuro (${article.slug})`);

      const trs = await select(pg`article_translations?select=locale,title,problem,approach,result,lesson&article_id=eq.${article.id}`);
      const byLoc = Object.fromEntries(trs.map((t) => [t.locale, t]));
      if (!byLoc.it || !byLoc.en) throw new Error(`numero ${issue.number}: mancano le traduzioni it+en`);

      // Solo quando si TRANSITA ad published: pre-check chunk embeddati (il gate
      // 0006 li pretende). Un numero già published li ha già → ri-esporta e basta.
      if (issue.status === "approved") {
        const [chunk] = await select(pg`article_chunks?select=id&article_id=eq.${article.id}&embedding=not.is.null&limit=1`);
        if (!chunk) throw new Error(`numero ${issue.number}: chunk non embeddati — esegui engine/embed.mjs prima`);
      }

      const meta = { number: issue.number, sector: issue.sector, period: issue.period, stat: article.stat, statSuffix: article.stat_suffix };
      const written = [];
      for (const locale of ["it", "en"]) {
        const o = toIssue(byLoc[locale], meta, locale);
        for (const [field, val] of Object.entries(o)) {
          if (typeof val !== "string") continue;
          const hits = screen(val);
          if (hits.length) throw new Error(`numero ${issue.number} ${locale}.${field} bloccato allo screening: ${hits.join(", ")}`);
        }
        const dir = `${MAGAZINE_DIR}/${locale}`;
        mkdirSync(dir, { recursive: true });
        const file = `${dir}/${issue.period}-${article.slug}.md`;
        writeFileSync(file, frontmatter(o), "utf8");
        written.push(file.replace(MAGAZINE_DIR + "/", "magazine/"));
      }

      if (issue.status === "approved") {
        await update("issues", pg`id=eq.${issue.id}`, { status: "published" });
        console.log(`numero ${issue.number} (${issue.period}) -> published`);
      } else {
        console.log(`numero ${issue.number} (${issue.period}) — ri-esportato (già published)`);
      }
      written.forEach((f) => console.log(`  scritto ${f}`));
    }
    console.log("\nfatto. Rivedi i file in astro-project/src/content/magazine/, poi committa il contenuto (lo merge tu).");
  } finally {
    await trace.flush();
  }
}

// Self-check delle funzioni pure (niente rete/DB): `node export.mjs --selfcheck`.
if (process.argv[2] === "--selfcheck") {
  const { strict: assert } = await import("node:assert");
  assert.equal(monthLabel("2026-07", "it-IT"), "Luglio 2026");
  assert.equal(monthLabel("2026-07", "en-US"), "July 2026");
  const o = toIssue(
    { title: "T", problem: "P", approach: "A", result: "R", lesson: "L" },
    { number: 1, sector: "security", period: "2026-07", stat: null, statSuffix: null },
    "it",
  );
  assert.equal(o.approach, "A");
  assert.equal(o.result, "R");
  assert.equal(o.lesson, "L");
  assert.equal(o.number, 1);
  assert.equal(o.sector, "security");
  const fm = frontmatter(o);
  assert.ok(fm.startsWith("---\n") && fm.endsWith("---\n"), "delimitatori frontmatter");
  assert.ok(fm.includes('lang: "it"') && fm.includes("number: 1"), "campi base serializzati");
  assert.ok(!fm.includes("stat:"), "niente stat se assente");
  const withStat = frontmatter({ ...o, stat: 75, statSuffix: "%" });
  assert.ok(withStat.includes("stat: 75") && withStat.includes('statSuffix: "%"'), "stat grounded serializzata");
  const tricky = frontmatter({ ...o, title: 'con "virgolette"\ne newline' });
  assert.ok(tricky.includes(String.raw`title: "con \"virgolette\"\ne newline"`), "scalare JSON a prova di iniezione YAML");
  console.log("export.mjs self-check OK");
} else {
  try {
    await main();
  } catch (e) {
    console.error(`export: ${e.message}`);
    process.exit(1);
  }
}
