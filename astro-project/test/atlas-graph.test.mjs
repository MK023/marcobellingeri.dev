// Il grafo di Atlas è l'unico posto dove un pezzo della wiki PRIVATA di Marco
// diventa pubblico. Queste guardie sono il contratto: solo i layer ammessi,
// solo etichette che vengono da lì, dimensione da pagina leggera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const path = new URL('../src/data/atlas-graph.json', import.meta.url).pathname;
const grafo = JSON.parse(readFileSync(path, 'utf8'));
const AMMESSI = ['concepts/', 'entities/tools/'];

test('privacy: ogni nodo appartiene ai soli layer pubblicabili', () => {
  assert.deepEqual(grafo.layers, AMMESSI);
  for (const n of grafo.nodes) {
    assert.ok(AMMESSI.some((p) => n.id.startsWith(p)), `nodo fuori allowlist: ${n.id}`);
  }
});

test('i link ai layer privati sono un conteggio, mai un elenco', () => {
  assert.equal(typeof grafo.linkEsclusi, 'number');
  // se qualcuno un giorno serializzasse gli id esclusi, questo test lo becca
  const testo = readFileSync(path, 'utf8');
  for (const proibito of ['personal/', 'career/', 'entities/people', 'entities/companies', 'lessons/']) {
    assert.ok(!testo.includes(proibito), `il JSON contiene un riferimento a ${proibito}`);
  }
});

test('forma: archi validi, coordinate nel quadro, peso da pagina leggera', () => {
  assert.ok(grafo.nodes.length > 50, 'grafo sospettosamente piccolo');
  for (const [a, b] of grafo.edges) {
    assert.ok(a >= 0 && a < grafo.nodes.length && b >= 0 && b < grafo.nodes.length, 'indice arco fuori range');
  }
  for (const n of grafo.nodes) {
    assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1, `coordinate fuori quadro: ${n.id}`);
  }
  assert.ok(statSync(path).size < 60_000, 'il JSON del grafo supera i 60KB: tagliare nodi, non aggiungere librerie');
});

test('atlas: la pagina esiste in dist con la dichiarazione del filtro', () => {
  for (const lang of ['it', 'en']) {
    const p = new URL(`../dist/${lang}/atlas/index.html`, import.meta.url).pathname;
    assert.ok(existsSync(p), `manca dist/${lang}/atlas`);
    const html = readFileSync(p, 'utf8');
    // la pagina DICHIARA che gli strati personali non ci sono: è parte del patto
    const dichiarazione = lang === 'it' ? 'strati personali' : 'personal layers';
    assert.ok(html.includes(dichiarazione), `${lang}: manca la dichiarazione del filtro`);
    // fallback senza JS: l'elenco dei concetti più connessi è nell'HTML
    assert.ok(html.includes('AWS IAM'), `${lang}: manca il fallback testuale`);
  }
});
