// `ldJson` e' l'unica difesa fra un titolo della pipeline e il tag <script> che
// lo contiene: un `</script>` dentro un titolo chiuderebbe il blocco e il resto
// del JSON diventerebbe markup della pagina. I titoli del magazine li scrive un
// modello, quindi sono input non fidato per regola del repo.
//
// Due livelli, e servono entrambi:
//  - unit sulla funzione (importa il .ts: Node >= 22.18 toglie i tipi da solo),
//    e questi test CADONO se si toglie l'escape;
//  - guardia sulla build, che sorveglia l'invariante su tutte le pagine vere.
//    Oggi nessun titolo contiene "<", quindi la guardia da sola non potrebbe
//    fallire — per questo esiste anche la unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ldJson } from '../src/lib/jsonld.ts';

test('ldJson: un </script> nel titolo non chiude il tag', () => {
  const out = ldJson({ name: 'Titolo</script><style>rotto</style>' });
  assert.ok(!out.includes('</script>'), `il tag si chiude ancora: ${out}`);
  assert.ok(!out.includes('<'), 'nessun "<" deve sopravvivere in chiaro');
});

test('ldJson: resta JSON valido e i crawler leggono gli stessi dati', () => {
  const dati = { name: 'a<b', nested: { x: ['<c>', 1] } };
  assert.deepEqual(JSON.parse(ldJson(dati)), dati);
});

test('ldJson: un titolo senza "<" non viene toccato', () => {
  const dati = { name: "L'IA nel codice e' ovunque" };
  assert.equal(ldJson(dati), JSON.stringify(dati));
});

const pagine = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? pagine(p) : e.name.endsWith('.html') ? [p] : [];
  });

test('nessun blocco ld+json della build contiene un "<" in chiaro', () => {
  const file = pagine('dist');
  assert.ok(file.length > 20, `build assente o parziale: ${file.length} pagine`);

  let blocchi = 0;
  const colpevoli = [];
  for (const f of file) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
      blocchi += 1;
      if (m[1].includes('<')) colpevoli.push(`${f}: ${m[1].slice(0, 90)}`);
    }
  }
  assert.ok(blocchi >= file.length, `troppi pochi blocchi ld+json trovati: ${blocchi}`);
  assert.deepEqual(colpevoli, [], 'un "<" dentro ld+json puo chiudere il tag');
});

test('i blocchi ld+json restano JSON valido dopo l escape', () => {
  for (const f of pagine('dist')) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(m[1]), `JSON-LD rotto in ${f}`);
    }
  }
});
