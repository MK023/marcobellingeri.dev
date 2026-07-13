// Il minificatore, se lasciato libero, riscrive `@media (max-width:640px)` come
// `@media (width<=640px)`: la sintassi a intervalli di Media Queries Level 4, che
// Safari capisce solo dalla 16.4 (marzo 2023).
//
// Il caso che questo test esiste per prendere è il peggiore che ci sia: la build resta
// verde, i test passano, il sito è perfetto su ogni macchina di chi lo scrive — e su un
// iPhone fermo a iOS 15 perde in silenzio tutto il layout mobile, perché quelle media
// query vengono semplicemente ignorate. Nessuno lo scopre finché non lo dice un
// visitatore. Il target sta in astro.config.mjs (`vite.build.cssTarget`).
//
// Con `build.inlineStylesheets: 'always'` il CSS non vive più in file .css: sta
// negli <style> dentro l'HTML. Il controllo è lo stesso, cambia solo dove si legge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagine = ['dist/it/index.html', 'dist/en/index.html'].map((f) => {
  const html = readFileSync(f, 'utf8');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  return { nome: f, css };
});

test('esistono stili inline da controllare', () => {
  assert.ok(
    pagine.every((p) => p.css.length > 1000),
    'niente <style> sostanziosi nelle pagine: la build è cambiata? (inlineStylesheets)',
  );
});

for (const { nome, css } of pagine) {
  test(`${nome}: nessuna media query in sintassi a intervalli`, () => {
    const trovate = [...css.matchAll(/@media[^{]*?\(\s*(width|height)\s*[<>]=?/g)].map((m) => m[0]);
    assert.deepEqual(
      trovate,
      [],
      'Media Queries Level 4 non è capito da Safari < 16.4. ' +
        `Controlla \`vite.build.cssTarget\` in astro.config.mjs. Trovate: ${trovate.join(', ')}`,
    );
  });

  test(`${nome}: le media query responsive usano max-width/min-width`, () => {
    const classiche = css.match(/@media\s*\((max|min)-width:/g) ?? [];
    assert.ok(
      classiche.length > 0,
      `Nessuna media query classica in ${nome}: o il layout responsive è sparito, o il minificatore le ha riscritte.`,
    );
  });
}
