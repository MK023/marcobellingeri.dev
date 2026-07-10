// Verifica che la CSP prodotta dalla build copra davvero ogni script inline.
// Gira su dist/, quindi presuppone `npm run build`. Nessun framework: node --test.
//
// Il caso che questo test esiste per prendere: lo script anti-FOUC in BaseLayout.astro
// è `is:inline`, quindi Astro NON ne calcola l'hash. L'hash sta a mano in
// astro.config.mjs. Se qualcuno tocca quello script senza aggiornare la config, la
// build resta verde e il sito va offline in produzione. Qui invece fallisce, e il
// messaggio dice esattamente quale hash incollare.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// La 404 è servita da Cloudflare per ogni percorso inesistente: è la pagina che un
// visitatore sbagliato vede per prima, e vale la stessa CSP delle altre.
const PAGES = ['dist/it/index.html', 'dist/en/index.html', 'dist/404.html'];

const sha256 = (s) => 'sha256-' + createHash('sha256').update(s).digest('base64');
const cspOf = (html) =>
  html.match(/<meta http-equiv="content-security-policy" content="([^"]*)"/i)?.[1] ?? '';

// Solo gli inline: quelli con src= sono coperti da 'self'.
const inlineScripts = (html) =>
  [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

for (const page of PAGES) {
  test(`${page}: ogni script inline ha il suo hash in script-src`, () => {
    const html = readFileSync(page, 'utf8');
    const csp = cspOf(html);
    assert.notEqual(csp, '', 'nessun <meta> CSP: security.csp non sta girando');

    const scripts = inlineScripts(html);
    assert.ok(scripts.length > 0, 'nessuno script inline trovato: il selettore è rotto?');

    for (const body of scripts) {
      const hash = sha256(body);
      assert.ok(
        csp.includes(hash),
        `Script inline senza hash nella CSP.\n` +
          `Aggiungi '${hash}' a security.csp.scriptDirective.hashes in astro.config.mjs.\n` +
          `Inizia con: ${body.trim().slice(0, 60)}…`,
      );
    }
  });

  test(`${page}: nessun attributo style= (richiederebbe 'unsafe-hashes')`, () => {
    const html = readFileSync(page, 'utf8');
    const found = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(found, [], `Sposta questi stili in global.css: ${found.join(' | ')}`);
  });
}

test('_headers non dichiara una CSP che annulli il meta', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/im)?.[1] ?? '';
  // frame-ancestors è header-only: è l'unica direttiva ammessa qui.
  const directives = csp.split(';').map((d) => d.trim().split(/\s+/)[0]).filter(Boolean);
  assert.deepEqual(
    directives,
    ['frame-ancestors'],
    'Header e meta si applicano come intersezione: una script-src qui rimette il sito offline.',
  );
});
