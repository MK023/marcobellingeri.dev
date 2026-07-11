// Stadio 5 EXPORT (ADR-0002): numero APPROVATO -> file Markdown Field Notes
// (astro-project/src/content/cases/{it,en}/) -> status=published. NON committa:
// il contenuto lo merge Marco (memoria: il codice lo mergio io, i contenuti lui).
//
// Mappatura inversa rispetto a generate.mjs (colonne article_translations legacy):
// application->approach, solution->result, body->lesson.
//
// Sicurezza: ri-screening di ogni campo PRIMA di scriverlo nel repo — è l'ultimo
// cancello prima che il contenuto entri nel codice del sito. I valori di testo
// finiscono nel frontmatter come scalari JSON (YAML è superset di JSON): virgolette
// e newline non possono rompere il YAML né iniettare campi.
//
// Uso: doppler run -- node engine/export.mjs [<period YYYY-MM>]
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { select, update, pg } from "./lib/supabase.mjs";
import { screen } from "./lib/guardrails.mjs";
import { startTrace } from "./lib/langfuse.mjs";

const CASES_DIR = fileURLToPath(new URL("../astro-project/src/content/cases", import.meta.url));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

// "2026-07" -> "Luglio 2026" / "July 2026" (Intl, capitalizzata come nell'esempio).
const monthLabel = (period, bcp47) => {
  const m = new Date(`${period}-01T00:00:00Z`).toLocaleDateString(bcp47, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

// DB (colonne legacy) -> forma Field Notes.
function toCase(tr, period, locale) {
  return {
    lang: locale,
    month: monthLabel(period, locale === "it" ? "it-IT" : "en-US"),
    date: `${period}-01`,
    title: tr.title,
    problem: tr.problem,
    approach: tr.application,
    result: tr.solution,
    lesson: tr.body ?? "",
  };
}

// Frontmatter con scalari JSON: sicuro contro virgolette/newline/iniezione YAML.
function frontmatter(c) {
  const f = (v) => JSON.stringify(v ?? "");
  return [
    "---",
    `lang: ${f(c.lang)}`,
    `month: ${f(c.month)}`,
    `date: ${f(c.date)}`,
    `title: ${f(c.title)}`,
    `problem: ${f(c.problem)}`,
    `approach: ${f(c.approach)}`,
    `result: ${f(c.result)}`,
    `lesson: ${f(c.lesson)}`,
    "---",
    "",
  ].join("\n");
}

async function main() {
  const period = process.argv[2] ?? null;
  if (period && !PERIOD.test(period)) throw new Error(`period non valido: ${period} (atteso YYYY-MM)`);
  const trace = startTrace("export-issue", { tags: ["engine", "export"], metadata: { period: period ?? "all" } });

  try {
    const q = period
      ? pg`issues?select=id,number,period&status=eq.approved&period=eq.${period}&order=number.asc`
      : "issues?select=id,number,period&status=eq.approved&order=number.asc";
    const issues = await select(q);
    if (!issues.length) throw new Error(period ? `nessun numero 'approved' per ${period}` : "nessun numero 'approved' da esportare");

    for (const issue of issues) {
      const [article] = await select(pg`articles?select=id,slug&issue_id=eq.${issue.id}&limit=1`);
      if (!article) { console.warn(`numero ${issue.number}: nessun articolo, salto`); continue; }
      if (!SLUG.test(article.slug)) throw new Error(`numero ${issue.number}: slug non sicuro (${article.slug})`);

      const trs = await select(pg`article_translations?select=locale,title,problem,application,solution,body&article_id=eq.${article.id}`);
      const byLoc = Object.fromEntries(trs.map((t) => [t.locale, t]));
      if (!byLoc.it || !byLoc.en) throw new Error(`numero ${issue.number}: mancano le traduzioni it+en`);

      // Pre-check: chunk embeddati. Il gate 0006 li pretende per 'published' —
      // controllarlo qui evita di scrivere i file per un numero non pubblicabile.
      const [chunk] = await select(pg`article_chunks?select=id&article_id=eq.${article.id}&embedding=not.is.null&limit=1`);
      if (!chunk) throw new Error(`numero ${issue.number}: chunk non embeddati — esegui engine/embed.mjs prima`);

      const written = [];
      for (const locale of ["it", "en"]) {
        const c = toCase(byLoc[locale], issue.period, locale);
        for (const [field, val] of Object.entries(c)) {
          const hits = screen(val);
          if (hits.length) throw new Error(`numero ${issue.number} ${locale}.${field} bloccato allo screening: ${hits.join(", ")}`);
        }
        const dir = `${CASES_DIR}/${locale}`;
        mkdirSync(dir, { recursive: true });
        const file = `${dir}/${issue.period}-${article.slug}.md`;
        writeFileSync(file, frontmatter(c), "utf8");
        written.push(file.replace(CASES_DIR + "/", "cases/"));
      }

      // Ultima transizione: il gate 0006 rivalida prova + traduzioni + chunk.
      await update("issues", pg`id=eq.${issue.id}`, { status: "published" });
      console.log(`numero ${issue.number} (${issue.period}) -> published`);
      written.forEach((f) => console.log(`  scritto ${f}`));
    }
    console.log("\nfatto. Rivedi i file in astro-project/src/content/cases/, poi committa il contenuto (lo merge tu).");
  } finally {
    await trace.flush();
  }
}

// Self-check delle funzioni pure (niente rete/DB): `node export.mjs --selfcheck`.
if (process.argv[2] === "--selfcheck") {
  const { strict: assert } = await import("node:assert");
  assert.equal(monthLabel("2026-07", "it-IT"), "Luglio 2026");
  assert.equal(monthLabel("2026-07", "en-US"), "July 2026");
  const c = toCase({ title: "T", problem: "P", application: "A", solution: "R", body: "L" }, "2026-07", "it");
  assert.equal(c.approach, "A");
  assert.equal(c.result, "R");
  assert.equal(c.lesson, "L");
  const fm = frontmatter(c);
  assert.ok(fm.startsWith("---\n") && fm.endsWith("---\n"), "delimitatori frontmatter");
  assert.ok(fm.includes('lang: "it"'), "lang serializzato");
  const tricky = frontmatter({ ...c, title: 'con "virgolette"\ne newline' });
  assert.ok(tricky.includes('title: "con \\"virgolette\\"\\ne newline"'), "scalare JSON a prova di iniezione YAML");
  console.log("export.mjs self-check OK");
} else {
  main().catch((e) => { console.error(`export: ${e.message}`); process.exit(1); });
}
