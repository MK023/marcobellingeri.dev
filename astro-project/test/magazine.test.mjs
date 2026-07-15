// Canonical-first: ogni numero del magazine ha una pagina propria che si dichiara
// canonical di sé, e il feed RSS (che dev.to importa) punta ESATTAMENTE a quella
// URL. Se il link del feed e il canonical della pagina divergono, il cross-post
// setta il canonical sbagliato e l'autorità SEO va alla piattaforma, non al sito:
// è l'invariante che regge tutta la sindacazione, quindi la sorvegliamo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const SITE = 'https://marcobellingeri.dev';

for (const lang of ['it', 'en']) {
  const feedPath = `dist/${lang}/rss.xml`;

  test(`${lang}: il feed RSS esiste e ha almeno un numero`, () => {
    assert.ok(existsSync(feedPath), `manca ${feedPath}`);
    const items = [...readFileSync(feedPath, 'utf8').matchAll(/<item>([\s\S]*?)<\/item>/g)];
    assert.ok(items.length >= 1, 'nessun <item> nel feed');
  });

  test(`${lang}: ogni link del feed combacia col canonical della pagina articolo`, () => {
    const xml = readFileSync(feedPath, 'utf8');
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    assert.ok(items.length >= 1, 'nessun <item> da verificare');

    for (const item of items) {
      const link = item.match(/<link>([^<]+)<\/link>/)[1];
      assert.ok(link.startsWith(`${SITE}/${lang}/magazine/`), `link fuori rotta: ${link}`);

      // la pagina esiste in dist (slug derivato uguale tra endpoint RSS e route)
      const rel = link.slice(SITE.length);
      const local = 'dist' + rel + (rel.endsWith('/') ? '' : '/') + 'index.html';
      assert.ok(existsSync(local), `manca la pagina per ${link} (${local})`);

      // e si auto-dichiara canonical su quella stessa URL
      const canon = readFileSync(local, 'utf8').match(
        /<link rel="canonical" href="([^"]+)">/,
      )?.[1];
      assert.equal(canon, link, `canonical ≠ link del feed per ${local}`);
    }
  });
}
