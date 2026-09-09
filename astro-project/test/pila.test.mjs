// La pila da edicola cresce da sola: l'Edicola la riempie il cron
// (engine/edicola.mjs) ed è passata da 8 a 12 voci senza che nessuno toccasse la
// geometria. Il difetto che ne è uscito, e che questo test esiste per prendere:
// con 12 fogli la riga chiusa misurava 1106px, più larga di ogni iPad. Su un
// viewport da 1024 la pagina arrivava a 1130 (106px di overflow), da 834 a 1130
// (296px), da 768 a 1130 (362px), con gli ultimi fogli fuori schermo — e aprendo
// la pila la pagina si RESTRINGEVA a 974, che è lo scatto che si vedeva.
//
// Niente lo prendeva, perché niente legava il numero di voci alla larghezza
// disponibile. Qui il legame è una funzione pura, e la promessa si verifica su
// tutta la griglia dei casi invece che sui due che capitava di guardare.
//
// Quello che questo test NON copre, e va misurato nel browser: che i pezzi passati
// alla funzione (foglio, gap, padding, larghezza del contenitore) siano davvero
// quelli che il layout usa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  geometriaPila,
  larghezzaRiga,
  SFALSO_DISEGNO,
  STRISCIA_MINIMA,
} from '../src/lib/pila.ts';

// I valori veri del componente, dal suo CSS.
const sorgente = readFileSync('src/components/Newsstand.astro', 'utf8');
const FOGLIO = Number(sorgente.match(/\.paper\{[^}]*width:min\((\d+)px/)[1]);
const GAP = Number(sorgente.match(/\.newsstand-stack\{[^}]*gap:(\d+)px/)[1]);
const PADDING = 2 * Number(sorgente.match(/\.newsstand-stack\{[^}]*padding:\d+px (\d+)px/)[1]);

const base = (n, disponibile) => ({ n, foglio: FOGLIO, gap: GAP, padding: PADDING, disponibile });

test('dove c\'è spazio lo sfalso resta quello di disegno', () => {
  // La larghezza di prova non è un numero scelto a mano: è esattamente quella che
  // la riga occupa con lo sfalso di disegno. Da lì in su non deve stringere nulla.
  for (const n of [2, 8, 12, 20]) {
    const p = base(n, 0);
    const giusta = larghezzaRiga(p, SFALSO_DISEGNO);
    for (const disponibile of [giusta, giusta + 1, giusta + 400]) {
      const g = geometriaPila({ ...p, disponibile });
      assert.equal(g.sfalso, SFALSO_DISEGNO, `n=${n} contenitore=${disponibile}`);
      assert.equal(g.verticale, false, `n=${n} contenitore=${disponibile}`);
    }
  }
});

test('la riga chiusa sta nel contenitore, o si impila in verticale', () => {
  // La promessa, su tutta la griglia: da 2 a 40 voci, da un iPhone stretto a un
  // desktop largo. 40 non è un numero a caso: è dove arriverebbe l'Edicola in poco
  // più di due anni al ritmo attuale.
  const falliti = [];
  for (let n = 2; n <= 40; n++) {
    for (let disponibile = 300; disponibile <= 1600; disponibile += 4) {
      const p = base(n, disponibile);
      const g = geometriaPila(p);
      if (g.verticale) continue; // impilata in verticale: la larghezza non è più un problema
      const larghezza = larghezzaRiga(p, g.sfalso);
      if (larghezza > disponibile) falliti.push(`n=${n} contenitore=${disponibile} riga=${larghezza}`);
    }
  }
  assert.deepEqual(falliti.slice(0, 5), [], `${falliti.length} combinazioni sbordano dal contenitore`);
});

test('quando resta orizzontale, il taglio da edicola resta leggibile', () => {
  const falliti = [];
  for (let n = 2; n <= 40; n++) {
    for (let disponibile = 300; disponibile <= 1600; disponibile += 4) {
      const g = geometriaPila(base(n, disponibile));
      if (g.verticale) continue;
      const striscia = FOGLIO + GAP - g.sfalso;
      if (striscia < STRISCIA_MINIMA) falliti.push(`n=${n} contenitore=${disponibile} striscia=${striscia}`);
    }
  }
  assert.deepEqual(falliti.slice(0, 5), [], `${falliti.length} combinazioni schiacciano i fogli sotto la striscia minima`);
});

test('una misura che non c\'è non manda in vacca la pila', () => {
  // getComputedStyle su un elemento non reso dà stringhe vuote, e parseFloat NaN.
  for (const rotta of [{ foglio: NaN }, { gap: NaN }, { padding: NaN }, { disponibile: NaN }]) {
    const g = geometriaPila({ ...base(12, 800), ...rotta });
    assert.equal(g.sfalso, SFALSO_DISEGNO, `con ${Object.keys(rotta)[0]} NaN`);
    assert.ok(Number.isFinite(g.sfalso), 'uno sfalso NaN diventa --sfalso:-NaNpx e il browser lo scarta');
  }
});

test('la pila non perde voci per stare dentro', () => {
  // Il tetto al numero di fogli era la soluzione facile ed è stata bocciata: la
  // pila deve mostrarle tutte, e a cedere è la geometria.
  assert.ok(
    !/\.slice\(/.test(sorgente),
    'il componente taglia le voci: la pila deve mostrarle tutte e stringersi invece',
  );
});

test('lo sfalso arriva al CSS dalla misura, non da una costante', () => {
  assert.match(
    sorgente,
    /margin-left:var\(--sfalso/,
    'il margine è tornato a un numero fisso: la pila torna a sbordare appena crescono le voci',
  );
  assert.match(sorgente, /setProperty\('--sfalso'/, 'nessuno calcola più lo sfalso');
});

test('chi ha ridotto le animazioni non si ritrova la pila', () => {
  // La deroga reduced-motion prima pareggiava la specificità con la variante
  // verticale, che stava in una media query, e vinceva perché scritta dopo. Ora la
  // variante porta una classe in più: se la deroga non la nomina, perde, e chi ha
  // chiesto meno movimento riceve la colonna coi fogli sovrapposti — esattamente
  // ciò che la riga di commento sopra promette di non dargli.
  const blocco = sorgente.match(/@media \(prefers-reduced-motion: reduce\)\{([\s\S]*?)\n {2}\}/);
  assert.ok(blocco, 'sparito il blocco reduced-motion');
  assert.match(
    blocco[1],
    /\.is-vertical/,
    'la deroga reduced-motion non nomina .is-vertical: perde di specificità e la pila resta sovrapposta',
  );
});

test('la pila verticale non dipende da una soglia in pixel', () => {
  assert.match(sorgente, /\.newsstand-stack\.is-enhanced\.is-vertical\{/, 'manca la variante verticale');
  assert.ok(
    !/@media \(max-width:\d+px\)\{?[\s\S]{0,400}is-enhanced/.test(sorgente),
    'la variante verticale è tornata dentro una media query: quel numero è tarato su un conto di voci che cambia',
  );
});
