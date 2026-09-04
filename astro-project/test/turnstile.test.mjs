// Turnstile: chi mostra il widget deve anche saper caricare lo script.
// Gira su dist/, quindi presuppone `npm run build`. Nessun framework: node --test.
//
// IL CASO CHE QUESTO TEST ESISTE PER PRENDERE. Il tag <script src=".../api.js">
// stava in Servizi.astro, cioè su home e privacy, mentre il terminale (e il suo
// widget `ask-turnstile`) sta in BaseLayout, cioè su tutte e 39 le pagine. Sulle
// altre 37 `window.turnstile` non esisteva e il comando `ask` moriva prima di
// partire — con build e test verdi, perché nessuno guardava il JS delle callback.
// L'invariante è quella violata allora: se in pagina c'è un widget Turnstile,
// in pagina deve arrivare anche il codice che carica l'API.
//
// Il secondo test presidia il verso opposto, ed è una promessa scritta nella
// privacy: lo script NON deve partire da solo. privacy.astro dichiara che
// Turnstile tratta l'IP «se usi il form» e «se fai una domanda»; un tag statico
// rimesso in pagina renderebbe quel testo falso senza rompere niente altro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const API = 'turnstile/v0/api.js';

const htmlSotto = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((voce) =>
    voce.isDirectory()
      ? htmlSotto(join(dir, voce.name))
      : voce.name.endsWith('.html')
        ? [join(dir, voce.name)]
        : [],
  );

const pagine = htmlSotto('dist');

// I moduli entry della pagina, più i chunk che quegli entry importano. Un solo
// livello di discesa basta e serve: il loader è un modulo condiviso, quindi il
// bundler lo stacca in un chunk suo e negli entry resta solo l'import.
function jsRaggiungibile(fileHtml) {
  const html = readFileSync(fileHtml, 'utf8');
  const entry = [...html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
  return entry.flatMap((src) => {
    const percorso = join('dist', src.slice(1));
    const codice = readFileSync(percorso, 'utf8');
    const importati = [...codice.matchAll(/from"(\.\/[^"]+\.js)"/g)].map((m) =>
      readFileSync(join(dirname(percorso), m[1]), 'utf8'),
    );
    return [codice, ...importati];
  });
}

test('ogni pagina con un widget Turnstile riceve anche il loader', () => {
  const conWidget = pagine.filter((f) => readFileSync(f, 'utf8').includes('class="cf-turnstile"'));

  // Se il selettore cambia e non trova più niente, il test passerebbe a vuoto.
  assert.ok(conWidget.length > 0, 'nessuna pagina con un widget: selettore da aggiornare');

  const orfane = conWidget.filter((f) => !jsRaggiungibile(f).some((js) => js.includes(API)));
  assert.deepEqual(orfane, [], 'widget Turnstile senza il codice che carica api.js');
});

test('nessuna pagina carica lo script Turnstile da sola', () => {
  const eager = pagine.filter((f) => readFileSync(f, 'utf8').includes(API));
  assert.deepEqual(eager, [], "api.js in un tag statico: si carica su richiesta, non all'apertura della pagina");
});
