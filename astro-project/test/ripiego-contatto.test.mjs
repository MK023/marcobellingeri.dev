// Quando il guasto è NOSTRO, il form non deve perdere il contatto.
// Gira su dist/, quindi presuppone `npm run build`. Nessun framework: node --test.
//
// IL CASO CHE QUESTO TEST ESISTE PER PRENDERE. Dal 10-07-2026 al 04-09-2026 il
// form ha risposto «ERRORE — RIPROVA» a chiunque premesse Invia, perché la chiave
// Resend nel Worker non era più valida. Il consiglio era falso: riprovare non
// poteva funzionare. Chi voleva scrivere se n'è andato, e nessuno l'ha saputo
// perché un 502 lato Worker e un errore di rete si assomigliano troppo.
//
// Adesso il client distingue i due codici con cui il Worker dice «è colpa
// nostra» (502 send, 503 unconfigured) e offre la via che funziona comunque: un
// mailto con dentro il brief già composto. Il test presidia la parte che si può
// rompere in silenzio — il collegamento fra la copy dichiarata nel componente e
// gli attributi che il client legge a runtime. Se qualcuno rinomina un
// `data-*`, il ramo d'errore smette di avere un testo e il visitatore legge una
// stringa vuota, con build e test verdi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Le due lingue separate: un ripiego che esiste solo in italiano è un ripiego
// che manca per metà dei visitatori, ed è il difetto che passa più facilmente.
const PAGINE = [
  ['dist/it/index.html', 'dalla mia parte'],
  ['dist/en/index.html', 'on my side'],
];

test('entrambe le lingue portano in pagina il testo del ripiego', () => {
  for (const [file, atteso] of PAGINE) {
    const html = readFileSync(file, 'utf8');
    const m = html.match(/data-failed-ours="([^"]*)"/);
    assert.ok(m, `${file}: manca data-failed-ours sul bottone di invio`);
    assert.ok(m[1].includes(atteso), `${file}: testo del ripiego inatteso — "${m[1]}"`);

    const link = html.match(/data-failed-ours-link="([^"]*)"/);
    assert.ok(link && link[1].trim().length > 0, `${file}: manca l'etichetta del link di ripiego`);
  }
});

test('il ramo di ripiego è nel JS servito, con il mailto', () => {
  const html = readFileSync('dist/it/index.html', 'utf8');
  const src = html.match(/<script[^>]+src="(\/_astro\/Servizi[^"]+\.js)"/);
  assert.ok(src, 'chunk di Servizi non referenziato dalla home');
  const js = readFileSync('dist' + src[1], 'utf8');

  // I due codici sono la definizione stessa di «colpa nostra»: se sparissero, il
  // ripiego non scatterebbe più e il visitatore tornerebbe a leggere «riprova».
  assert.ok(js.includes('502'), 'il chunk non tratta più il 502');
  assert.ok(js.includes('503'), 'il chunk non tratta più il 503');
  assert.ok(js.includes('mailto:'), 'il chunk non costruisce più il mailto di ripiego');
});
