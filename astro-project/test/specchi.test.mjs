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

test('ogni limiter usato dal Worker esiste come binding in wrangler.jsonc', () => {
  // La guardia nel codice e' `if (env.X_LIMITER)`: serve perche' il binding non
  // esiste nei test ne' in `wrangler dev`, ma rende il controllo FAIL-OPEN. Se
  // qualcuno toglie una voce da `ratelimits`, il rate limit si spegne in
  // silenzio e ogni test resta verde — la stessa forma del difetto che il
  // 16/08 abbiamo chiuso su /api/agentic-status, dove il limite era dichiarato
  // e non esisteva. Questo specchio la rende una build rossa.
  const worker = (p) => readFileSync(new URL(`../worker/${p}`, import.meta.url).pathname, 'utf8');
  const codice = ['index.js', 'agentic-status.js', 'radar.js'].map(worker).join('\n');
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url).pathname, 'utf8');

  const usati = [...new Set([...codice.matchAll(/env\.([A-Z_]+_LIMITER)\b/g)].map((m) => m[1]))];
  assert.ok(usati.length >= 3, `trovati solo ${usati.length} limiter nel codice: la regex non legge piu' il Worker?`);

  for (const nome of usati) {
    assert.match(
      wrangler,
      new RegExp(`"name":\\s*"${nome}"`),
      `${nome} e' usato nel Worker ma non e' dichiarato in wrangler.jsonc: il limite sarebbe spento in produzione, in silenzio`,
    );
  }
});

test('worker/headers.js rispecchia public/_headers, che resta la fonte', async () => {
  // Il test in agentic-status.test.mjs scrive i cinque valori per esteso e
  // controlla che le risposte del Worker li portino. Nessuno pero' leggeva
  // `public/_headers`: alzare il max-age dell'HSTS solo li' lasciava tutto verde
  // mentre asset statici e risposte del Worker servivano valori diversi. Cioe'
  // esattamente la deriva che worker/headers.js dice di aver chiuso.
  const { HEADER_SICUREZZA } = await import('../worker/headers.js');
  const headers = readFileSync(new URL('../public/_headers', import.meta.url).pathname, 'utf8');
  // Solo il blocco `/*`: le regole successive sono Cache-Control per path.
  const blocco = headers.split(/^\/\*$/m)[1]?.split(/^\/[^*]/m)[0] ?? '';
  assert.ok(blocco.includes('Strict-Transport-Security'), 'blocco /* non trovato in public/_headers');

  for (const [nome, valore] of Object.entries(HEADER_SICUREZZA)) {
    const riga = blocco.split('\n').find((l) => l.trim().toLowerCase().startsWith(`${nome.toLowerCase()}:`));
    assert.ok(riga, `${nome} sta in worker/headers.js ma non in public/_headers: gli asset non lo ricevono`);
    assert.equal(
      riga.slice(riga.indexOf(':') + 1).trim(),
      valore,
      `${nome} diverge fra public/_headers e worker/headers.js: asset e risposte del Worker servono valori diversi`,
    );
  }
});

test('il Retry-After scritto a mano combacia col period dei binding', () => {
  // `Retry-After: '60'` e' hardcoded in tre punti di index.js, mentre il valore
  // autorevole e' `period` in wrangler.jsonc. Alzando il period a 300 la
  // risposta continuerebbe a dire 60, e un client ritenterebbe quattro volte
  // troppo presto: l'header mentirebbe invece di aiutare.
  const codice = readFileSync(new URL('../worker/index.js', import.meta.url).pathname, 'utf8');
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url).pathname, 'utf8');

  const dichiarati = [...wrangler.matchAll(/"period":\s*(\d+)/g)].map((m) => m[1]);
  assert.ok(dichiarati.length >= 3, `letti solo ${dichiarati.length} period: la regex non legge piu' wrangler.jsonc?`);

  const usati = [...new Set([...codice.matchAll(/'Retry-After':\s*'(\d+)'/g)].map((m) => m[1]))];
  assert.ok(usati.length >= 1, "nessun Retry-After trovato in index.js: la regex non legge piu' il codice?");

  // Il confronto e' contro OGNI period, non contro "almeno uno": il valore nella
  // risposta e' scritto a mano ed e' lo stesso per tutte le rotte, quindi basta
  // che UN binding cambi period perche' quella rotta menta. La prima versione di
  // questo test usava `includes` e restava verde alzando un solo period a 300.
  const distinti = [...new Set([...dichiarati, ...usati])];
  assert.equal(
    distinti.length,
    1,
    `period dichiarati (${dichiarati.join(', ')}) e Retry-After usati (${usati.join(', ')}) non coincidono piu': ` +
      'o si riallinea il period, o il Retry-After va reso specifico per rotta',
  );
});
