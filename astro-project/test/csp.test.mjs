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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// OGNI pagina costruita, non un elenco scritto a mano. L'elenco era la falla: le
// pagine dedicate (atlas, ai, radar, agentic-os) non erano coperte, e un inline
// specifico di una di quelle sarebbe andato live senza hash con i test verdi —
// cioè esattamente il caso per cui questo file esiste. Una pagina nuova adesso
// entra nel controllo da sola, senza che nessuno si ricordi di aggiungerla.
// La 404 è servita da Cloudflare per ogni percorso inesistente, quindi vale la
// stessa CSP delle altre e il glob la prende insieme al resto.
const htmlSotto = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((voce) =>
    voce.isDirectory()
      ? htmlSotto(join(dir, voce.name))
      : voce.name.endsWith('.html')
        ? [join(dir, voce.name)]
        : [],
  );

const PAGES = htmlSotto('dist');

// Senza questa, `dist/` assente significa zero test registrati e suite verde: un
// gate che non può fallire non è un gate.
test('la build ha prodotto pagine da controllare', () => {
  assert.ok(PAGES.length > 0, 'nessun .html sotto dist/: eseguire `npm run build` prima dei test');
});

const sha256 = (s) => 'sha256-' + createHash('sha256').update(s).digest('base64');
const cspOf = (html) =>
  html.match(/<meta http-equiv="content-security-policy" content="([^"]*)"/i)?.[1] ?? '';

// Solo gli inline: quelli con src= sono coperti da 'self'.
// Esclusi i data block (application/ld+json): il browser non li esegue mai —
// "prepare a script" li scarta prima del check CSP — quindi script-src non li
// tocca e un hash sarebbe solo rumore da mantenere. Qualunque cosa dichiari un
// type non-JS non può eseguire, per costruzione: l'esenzione non apre nulla.
const inlineScripts = (html) =>
  [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type="application\/ld\+json"/i.test(m[1]))
    .map((m) => m[2]);

// Il canary "il selettore funziona ancora" è GLOBALE, non per pagina: con
// l'elenco scritto a mano tutte le pagine passavano da BaseLayout e portavano il
// suo inline anti-FOUC, quindi pretenderlo ovunque era lecito. Sul glob non lo è
// più — `dist/index.html` è il fallback nudo del meta-refresh, non passa dal
// layout, non ha script e non ha CSP, e in produzione non viene mai servito
// (worker/index.js la intercetta, run_worker_first). Una pagina senza inline non
// ha niente da dimostrare; se però NESSUNA ne ha, è la regex a essere rotta.
const inlineTotali = PAGES.reduce((n, p) => n + inlineScripts(readFileSync(p, 'utf8')).length, 0);

test('il selettore degli script inline non è rotto', () => {
  assert.ok(inlineTotali > 0, 'nessuno script inline in tutta dist/: la regex non trova più niente');
});

for (const page of PAGES) {
  test(`${page}: ogni script inline ha il suo hash in script-src`, () => {
    const html = readFileSync(page, 'utf8');
    const scripts = inlineScripts(html);
    if (scripts.length === 0) return;

    const csp = cspOf(html);
    assert.notEqual(csp, '', 'pagina con script inline ma senza <meta> CSP: quegli script sono bloccati in produzione');

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

  test(`${page}: nessun handler inline on…= (richiederebbe 'unsafe-hashes')`, () => {
    // Stessa classe di regressione degli style=: un onclick sfuggito passerebbe
    // la build e morirebbe solo in produzione sotto CSP.
    const html = readFileSync(page, 'utf8');
    const found = [...html.matchAll(/\son(?:click|error|load|mouseover|focus|submit|input|change)="([^"]*)"/gi)].map((m) => m[0].trim());
    assert.deepEqual(found, [], `Sposta questi handler in uno <script>: ${found.join(' | ')}`);
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
