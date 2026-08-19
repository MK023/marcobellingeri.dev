// Canonical-first: magazine e writing hanno una pagina propria che si dichiara
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

// L'altra meta' dell'invariante, per la writing collection. Il canonical che
// engine/lib/devto.mjs manda a dev.to e' costruito a mano (canonicalDi), quindi
// non puo' accorgersi da solo se le pagine cambiano forma: il 19-08-2026 le
// pagine si dichiaravano con lo slash finale e l'engine ne mandava uno senza,
// cioe' un rel=canonical verso un 307. Corretto l'engine, qui si pianta l'altro
// capo: se `trailingSlash` di Astro cambia, questo diventa rosso prima che il
// mirror ricominci a puntare a un redirect.
import { readdirSync } from 'node:fs';

for (const lang of ['it', 'en']) {
  test(`${lang}: ogni pagina writing si dichiara canonical con lo slash finale`, () => {
    const dir = `dist/${lang}/writing`;
    const slugs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    assert.ok(slugs.length >= 1, `nessuna pagina writing in ${dir}: il test non guarda niente`);

    for (const slug of slugs) {
      const local = `${dir}/${slug}/index.html`;
      const canon = readFileSync(local, 'utf8').match(
        /<link rel="canonical" href="([^"]+)">/,
      )?.[1];
      assert.equal(
        canon,
        `${SITE}/${lang}/writing/${slug}/`,
        `canonical inatteso in ${local}: engine/lib/devto.mjs manda questa stessa URL a dev.to`,
      );
    }
  });
}
