// E2E GATED — catena reale ingest→verify→scrittura→embed→publish→retrieve sul
// DB live (dati sintetici namespace 9999-01, teardown a cascade). Costa ~2 call
// Voyage (free tier), zero Valyu. Skippa senza RUN_E2E=1 + env Doppler.
// Run: doppler run -- npm run test:e2e   (da engine/)
import { test } from "node:test";
import { strict as assert } from "node:assert";

const enabled = process.env.RUN_E2E === "1" && !!process.env.SUPABASE_URL;

test("e2e: il publish gate morde a ogni anello mancante, poi la catena passa", { skip: !enabled, timeout: 120_000 }, async () => {
  const { select, insert, update, remove, rpc } = await import("../lib/supabase.mjs");
  const { chunk, embed, toVector } = await import("../lib/voyage.mjs");

  const PERIOD = "9999-01";
  const PROOF_URL = "https://e2e.test/proof";
  // cleanup preventivo (idempotenza se un run precedente e' crashato).
  // NB: signals ha FK on delete SET NULL (non cascade) -> va rimosso esplicitamente.
  const cleanup = async () => {
    await remove("issues", `period=eq.${PERIOD}`);
    await remove("signals", `source_url=eq.${encodeURIComponent(PROOF_URL)}`);
  };
  await cleanup();

  try {
    // 1) numero draft sintetico
    const [issue] = await insert("issues", [{ number: 999, period: PERIOD, sector: "__e2e__", status: "draft" }], { returning: true });

    // 2) publish SENZA prova -> il gate rifiuta
    await assert.rejects(
      () => update("issues", `id=eq.${issue.id}`, { status: "published" }),
      /Tier-1 o Tier-2/,
      "senza fonte verify il publish deve fallire",
    );

    // 3) prova Tier-1 verificata -> ma manca l'articolo
    await insert("signals", [{ issue_id: issue.id, source_url: PROOF_URL, source_name: "E2E proof", category: "__e2e__", stage: "verify", tier: 1, independent: true }]);
    await assert.rejects(
      () => update("issues", `id=eq.${issue.id}`, { status: "published" }),
      /it\+en/,
      "senza articolo it+en il publish deve fallire",
    );

    // 4) articolo + traduzioni -> ma chunks non embeddati
    const [art] = await insert("articles", [{ issue_id: issue.id, slug: "__e2e__" }], { returning: true });
    await insert("article_translations", [
      { article_id: art.id, locale: "it", title: "T", problem: "p", application: "a", solution: "s", body: "Il gate di pubblicazione blocca i numeri senza prova verificata ed embedding." },
      { article_id: art.id, locale: "en", title: "T", problem: "p", application: "a", solution: "s", body: "The publication gate blocks issues lacking verified proof and embeddings." },
    ]);
    await assert.rejects(
      () => update("issues", `id=eq.${issue.id}`, { status: "published" }),
      /chunk non embeddati/,
      "senza embedding il publish deve fallire",
    );

    // 5) embed reale (chunk -> voyage -> insert)
    const trans = await select(`article_translations?article_id=eq.${art.id}&select=locale,body`);
    const rows = [];
    for (const { locale, body } of trans) {
      chunk(body).forEach((content, i) => rows.push({ article_id: art.id, locale, chunk_index: i, content }));
    }
    const vecs = await embed(rows.map((r) => r.content));
    rows.forEach((r, i) => { r.embedding = toVector(vecs[i]); });
    await insert("article_chunks", rows);

    // 6) da draft il RAG non deve vedere nulla (gate di lettura)
    const [qvec] = await embed(["does the publication gate block unverified issues"], "query");
    const q = { query_embedding: toVector(qvec), match_threshold: 0.3, match_count: 5, filter_locale: null };
    assert.equal((await rpc("match_article_chunks", q)).length, 0, "draft mai retrievabile");

    // 7) catena completa -> il publish passa, timestamp auto-valorizzati
    await update("issues", `id=eq.${issue.id}`, { status: "published" });
    const [pub] = await select(`issues?id=eq.${issue.id}&select=status,approved_at,published_at`);
    assert.equal(pub.status, "published");
    assert.ok(pub.approved_at, "approved_at auto-set");
    assert.ok(pub.published_at, "published_at auto-set");

    // 8) da published il RAG risponde (stessa query di prima)
    const hits = await rpc("match_article_chunks", q);
    assert.ok(hits.length >= 1, "published retrievabile");
  } finally {
    // teardown: cascade su articles/translations/chunks; signals rimosso esplicitamente
    await cleanup();
  }

  const leftover = await select(`issues?period=eq.${PERIOD}&select=id`);
  assert.equal(leftover.length, 0, "teardown pulito (issues)");
  const orphans = await select(`signals?source_url=eq.${encodeURIComponent(PROOF_URL)}&select=id`);
  assert.equal(orphans.length, 0, "teardown pulito (signals, FK set-null)");
});
