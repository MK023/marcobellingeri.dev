// Il sommario, la palette comandi e il terminale derivano tutti da src/lib/sections.ts.
// Questi test sorvegliano l'invariante che conta: ogni sezione dichiarata lì compare
// nel sommario e nella pagina con lo stesso numero, senza salti. La sezione Magazine
// è sempre presente; l'Archivio a fetch runtime è stato rimosso.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGES = ['dist/it/index.html', 'dist/en/index.html'];

const navEntries = (html) => {
  const nav = html.match(/<nav class="toc mono" id="toc-nav">([\s\S]*?)<\/nav>/)[1];
  return [...nav.matchAll(/data-section="([^"]+)"[^>]*>\s*<span class="num">(\d+)<\/span>/g)].map(
    (m) => ({ id: m[1], num: m[2] }),
  );
};

for (const page of PAGES) {
  test(`${page}: la sezione Magazine compare nel sommario e nella pagina`, () => {
    const html = readFileSync(page, 'utf8');

    assert.ok(
      navEntries(html).some((e) => e.id === 'magazine'),
      'il sommario deve elencare il Magazine.',
    );
    assert.ok(html.includes('id="magazine"'), 'la sezione Magazine deve essere renderizzata.');
    // `ls` nel terminale non deve mandare l'utente sull'Archivio rimosso.
    const ls = html.match(/data-ls="([^"]*)"/)?.[1] ?? '';
    assert.ok(!ls.includes('archive/'), `\`ls\` elenca l'Archivio rimosso: ${ls}`);
  });

  test(`${page}: la numerazione del sommario non salta`, () => {
    const nums = navEntries(readFileSync(page, 'utf8')).map((e) => e.num);
    const attesi = nums.map((_, i) => String(i + 1).padStart(2, '0'));
    assert.deepEqual(nums, attesi, 'Togliendo una sezione la numerazione deve richiudersi.');
  });

  test(`${page}: il numero nel titolo coincide con quello nel sommario`, () => {
    const html = readFileSync(page, 'utf8');

    // Il numero stampato nel titolo di ogni sezione, per id.
    // `[^>]*` non è cosmetico: Astro aggiunge `data-astro-cid-…` agli elementi dei
    // componenti che hanno uno <style> scoped, e senza quello sfuggivano proprio
    // `booking` e `servizi` — cioè uno dei due che questo test deve sorvegliare.
    const titoli = new Map(
      [
        ...html.matchAll(
          /<section id="([^"]+)"[\s\S]{0,400}?<span class="num mono"[^>]*>(\d{2})<\/span>/g,
        ),
      ].map((m) => [m[1], m[2]]),
    );

    for (const { id, num } of navEntries(html)) {
      const titolo = titoli.get(id);
      if (titolo === undefined) continue; // `contact` è il footer, non ha numero
      assert.equal(
        titolo,
        num,
        `La sezione "${id}" mostra ${titolo} nel titolo e ${num} nel sommario. ` +
          'I numeri devono venire da src/lib/sections.ts, non essere scritti nel componente.',
      );
    }
    assert.ok(titoli.size >= 7, `trovati solo ${titoli.size} titoli numerati: il selettore è rotto?`);
  });
}
