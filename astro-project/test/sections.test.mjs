// Il sommario, la palette comandi e il terminale derivano tutti da src/lib/sections.ts,
// che nasconde l'Archivio finché public/data/issues/index.json è vuoto.
//
// Il rischio che questo test esiste per prendere non è "l'archivio si vede quando
// non dovrebbe" — quello si nota subito. È il contrario: che il giorno in cui la
// pipeline pubblica il primo numero, l'Archivio resti invisibile e nessuno se ne
// accorga. Qui il sommario viene confrontato con l'indice reale, in entrambi i versi.

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

const issueCount = () =>
  JSON.parse(readFileSync('public/data/issues/index.json', 'utf8')).issues.length;

for (const page of PAGES) {
  test(`${page}: l'Archivio compare se e solo se esiste un numero`, () => {
    const html = readFileSync(page, 'utf8');
    const atteso = issueCount() > 0;

    assert.equal(
      navEntries(html).some((e) => e.id === 'archive'),
      atteso,
      atteso
        ? 'index.json ha dei numeri ma il sommario non elenca l’Archivio.'
        : 'index.json è vuoto ma il sommario elenca l’Archivio.',
    );
    assert.equal(
      html.includes('id="archive"'),
      atteso,
      'La sezione Archivio e la voce di sommario devono comparire insieme.',
    );
    // `ls` nel terminale non deve mandare l'utente su un'ancora morta.
    const ls = html.match(/data-ls="([^"]*)"/)?.[1] ?? '';
    assert.equal(ls.includes('archive/'), atteso, `\`ls\` elenca sezioni inesistenti: ${ls}`);
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
