// Guardie anti-deriva sugli SPECCHI: superfici che promettono di rispecchiare
// una fonte e che finora si allineavano a mano. La classe di bug ha già morso
// due volte (whoami, PR #120; liste del terminale, 12ª superficie): questi test
// la rendono strutturale invece che affidata a un commento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sorgente = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url).pathname, 'utf8');

test('terminale: servizi() rispecchia TUTTE le card di Servizi.astro', () => {
  const titoli = [...sorgente('components/Servizi.astro').matchAll(/tag: '[A-Z-]+', title: '([^']+)'/g)]
    .map((m) => m[1].toLowerCase())
    .slice(0, 6); // le card IT (il blocco EN ripete gli stessi servizi tradotti)
  assert.ok(titoli.length >= 6, `estratte solo ${titoli.length} card: la regex non legge più Servizi.astro?`);
  const term = sorgente('components/NeonTerminal.astro').toLowerCase().replace(/&amp;/g, '&');
  for (const t of titoli) {
    assert.ok(term.includes(t), `il terminale non elenca "${t}" — lo specchio dei servizi ha perso un pezzo`);
  }
});

test('terminale: projects() rispecchia i progetti di Projects.astro', () => {
  const nomi = [...sorgente('components/Projects.astro').matchAll(/name: '([^']+)'/g)]
    .map((m) => m[1].toLowerCase());
  const unici = [...new Set(nomi)];
  assert.ok(unici.length >= 4, `estratti solo ${unici.length} progetti`);
  // separatori normalizzati: la card dice "LLM Council", il prompt del CRT
  // "llm-council" — stesso progetto, ortografia da terminale
  const norma = (s) => s.replace(/[\s-]+/g, '-');
  const term = norma(sorgente('components/NeonTerminal.astro').toLowerCase());
  for (const n of unici) {
    assert.ok(term.includes(norma(n)), `il terminale non elenca "${n}" — lo specchio dei progetti ha perso un pezzo`);
  }
});

// Il punto singolo che rende veri in produzione i 4 test di osservabilità del
// radar: worker/sentry.js registra il reporter, wrangler lo usa come entry.
// Nessun test importa sentry.js (per design: niente SDK nei test) — quindi la
// guardia è testuale: rozza, ma cancella quella riga e QUESTO test lo dice.
test('produzione: sentry.js registra __SEGNALA_SENTRY__ ed è la entry di wrangler', () => {
  const entry = readFileSync(new URL('../worker/sentry.js', import.meta.url).pathname, 'utf8');
  assert.ok(
    /globalThis\.__SEGNALA_SENTRY__\s*=/.test(entry),
    'sentry.js non registra più il reporter: i segnala() di index.js e radar.js sono muti in produzione',
  );
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url).pathname, 'utf8');
  assert.match(wrangler, /"main":\s*"worker\/sentry\.js"/, 'wrangler non usa più sentry.js come entry');
});
