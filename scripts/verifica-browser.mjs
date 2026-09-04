#!/usr/bin/env node
// Le prove che solo un browser vero può dare, contro il sito servito da workerd.
//
// PERCHÉ ESISTE. I test in `astro-project/test/` girano su `dist/`: leggono HTML
// e JS costruiti, e prendono tutto ciò che è visibile nel prodotto della build.
// Non prendono quello che succede quando il codice GIRA — uno script di terzi che
// arriva in ritardo, un widget non ancora reso, una callback che non parte. Il
// 04-09-2026 è esattamente lì che una regressione sul form contatti è passata
// oltre 291 test verdi ed è finita in produzione (PR #272, riparata dal #273).
//
// Da dentro Docker: `docker compose run --rm verifica`. Contro un bersaglio
// remoto, sempre dal container, perché playwright vive solo nell'immagine:
//   docker compose run --rm -e BASE_URL=https://marcobellingeri.dev verifica
//
// COSA GIRA DOVE, e perché non è la stessa cosa. In locale la sitekey è quella
// di test, quindi il token non supera `siteverify` col secret vero: il form
// arriva alla chiamata di rete e si ferma lì, senza effetti. Contro un dominio
// REMOTO no — lì la sitekey è quella di produzione, il token è buono, e un
// invio manda una mail vera e spende budget del modello. Quindi le prove che
// premono INVIA o lanciano `ask` girano SOLO su un bersaglio locale; su un
// bersaglio remoto restano le verifiche in sola lettura, che sono anche quelle
// che contano lì (nessun terzo contattato al caricamento, tag statico assente).
//
// Questa distinzione è nata da una review: la versione precedente dichiarava in
// questo stesso commento di non inviare mai niente di irreversibile, e il README
// suggeriva di puntare lo script alla produzione. Le due cose insieme facevano
// esattamente il danno che il commento escludeva.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8788';
const LOCALE = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname);
const TS = /challenges\.cloudflare\.com/;
const esiti = [];

// Un fallimento non ferma le altre prove: serve il quadro intero, non il primo
// intoppo — su due lingue un difetto che ne tocca una sola è il caso peggiore.
function verifica(nome, condizione, dettaglio) {
  esiti.push({ nome, ok: Boolean(condizione), dettaglio });
}

// La riga qui sopra però non bastava, e la differenza è tutta qui: `verifica()`
// registra booleani, ma `goto`, `fill`, `click` e `press` LANCIANO. Un selettore
// che cambia faceva morire l'intera esecuzione al primo intoppo — niente
// riepilogo, niente lingua successiva, browser lasciato aperto, e l'operatore
// davanti a uno stack trace senza nessuna delle prove che erano passate. Cioè
// proprio la classe di guasto che stiamo cercando riusciva a nascondere le
// altre. Qui il lancio diventa un esito rosso come gli altri.
async function blocco(nome, fn) {
  try {
    await fn();
  } catch (e) {
    verifica(nome, false, `eccezione: ${String(e.message ?? e).split('\n')[0]}`);
  }
}

// Aspetta la chiamata che DEVE partire, invece di dormire un tempo fisso e poi
// guardare cosa è successo. Non è eleganza: un'attesa fissa abbastanza lunga da
// non essere fragile rende la verifica lenta al punto che poi non la si lancia,
// e una corta la rende intermittente. Così finisce appena la chiamata arriva, e
// fallisce solo quando davvero non arriva.
const attendiChiamata = (page, percorso, ms = 20000) =>
  page.waitForRequest((r) => new URL(r.url()).pathname === percorso, { timeout: ms })
    .then(() => true, () => false);

function osserva(page) {
  const s = { turnstile: [], api: [], errori: [], csp: [] };
  page.on('request', (r) => {
    if (TS.test(r.url())) s.turnstile.push(r.url());
    else if (r.url().includes('/api/')) s.api.push(r.method() + ' ' + new URL(r.url()).pathname);
  });
  page.on('pageerror', (e) => s.errori.push(String(e.message ?? e)));
  page.on('console', (m) => { if (/Content Security|Refused to/i.test(m.text())) s.csp.push(m.text()); });
  return s;
}

const browser = await chromium.launch();
try {
  for (const lang of ['it', 'en']) {
    // --- il terminale su una pagina SENZA form: è dove `ask` era morto ---
    await blocco(`/${lang}/radar/ terminale`, async () => {
      const page = await browser.newPage();
      const s = osserva(page);
      await page.goto(`${BASE}/${lang}/radar/`, { waitUntil: 'networkidle' });

      verifica(`/${lang}/radar/ non contatta Cloudflare al caricamento`,
        s.turnstile.length === 0, `richieste: ${s.turnstile.length}`);

      if (LOCALE) {
        await page.evaluate(() => window.openNeonTerminal?.());
        await page.waitForTimeout(400);
        await page.fill('#crt-input', lang === 'it' ? 'ask prova' : 'ask test');
        const chiamata = attendiChiamata(page, '/api/ask');
        await page.press('#crt-input', 'Enter');
        const partita = await chiamata;

        verifica(`/${lang}/radar/ rende il widget dopo \`ask\``,
          await page.evaluate(() => !!document.querySelector('#ask-turnstile input[name="cf-turnstile-response"]')));
        verifica(`/${lang}/radar/ carica Turnstile solo su richiesta`,
          s.turnstile.length > 0, `richieste: ${s.turnstile.length}`);
        verifica(`/${lang}/radar/ chiama /api/ask`, partita, s.api.join(', ') || 'nessuna');
      }
      // L'eccezione non gestita in pagina è il segnale più diretto che avrebbe
      // preso #272: il lancio di `execute()` arriva a `window` da un setTimeout.
      // Raccoglierlo e non guardarlo sarebbe stato tenere la prova nel cassetto.
      verifica(`/${lang}/radar/ senza errori JS`, s.errori.length === 0, s.errori.join(' | '));
      verifica(`/${lang}/radar/ senza violazioni CSP`, s.csp.length === 0, s.csp.join(' | '));
      await page.close();
    });

    // --- il form contatti: la rotta che porta clienti ---
    await blocco(`/${lang}/ form`, async () => {
      const page = await browser.newPage();
      const s = osserva(page);
      await page.goto(`${BASE}/${lang}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      verifica(`/${lang}/ non contatta Cloudflare al caricamento`,
        s.turnstile.length === 0, `richieste: ${s.turnstile.length}`);
      verifica(`/${lang}/ non ha il tag statico di api.js`,
        !(await page.evaluate(() => [...document.querySelectorAll('script[src]')]
          .some((el) => el.src.includes('turnstile/v0/api.js')))));

      // Premere INVIA contro un bersaglio remoto manderebbe una mail vera: là il
      // token è buono e il Worker lo accetta. Si fa solo in locale.
      if (LOCALE) {
        await page.evaluate(() => document.querySelector('#svc-order .svc-chip')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        await page.fill('#svc-name', 'Verifica Automatica');
        await page.fill('#svc-email', 'verifica@example.com');
        await page.evaluate(() => document.getElementById('svc-send')?.scrollIntoView());
        const chiamata = attendiChiamata(page, '/api/contact');
        await page.click('#svc-send');
        const partita = await chiamata;
        // Il bottone torna utilizzabile dopo la risposta, non prima: qui l'attesa
        // fissa è breve e sorveglia proprio quel ritorno.
        await page.waitForTimeout(2500);

        verifica(`/${lang}/ rende il widget del form dopo INVIA`,
          await page.evaluate(() => !!document.querySelector('#svc-turnstile input[name="cf-turnstile-response"]')));
        verifica(`/${lang}/ chiama /api/contact`, partita, s.api.join(', ') || 'nessuna');
        // Il bottone deve tornare utilizzabile comunque vada: inchiodato su "INVIO…"
        // è il guasto peggiore, perché il visitatore non ha modo di riprovare.
        verifica(`/${lang}/ lascia il bottone riprovabile`,
          await page.evaluate(() => document.getElementById('svc-send')?.disabled === false));
      }
      verifica(`/${lang}/ senza errori JS`, s.errori.length === 0, s.errori.join(' | '));
      verifica(`/${lang}/ senza violazioni CSP`, s.csp.length === 0, s.csp.join(' | '));
      await page.close();
    });
  }
} finally {
  // Anche quando qualcosa esplode: un chromium lasciato in giro è un processo
  // che nessuno ucciderà, e su una macchina di sviluppo se ne accumulano.
  await browser.close();
}

console.log(LOCALE
  ? 'bersaglio locale: eseguite anche le prove che inviano (form e ask)'
  : 'bersaglio REMOTO: solo verifiche in sola lettura — premere INVIA di là manderebbe una mail vera');
for (const e of esiti) console.log(`${e.ok ? 'ok  ' : 'NO  '}${e.nome}${e.dettaglio ? `  — ${e.dettaglio}` : ''}`);
const falliti = esiti.filter((e) => !e.ok);
console.log(`\n${esiti.length - falliti.length}/${esiti.length} verifiche passate su ${BASE}`);
process.exit(falliti.length === 0 ? 0 : 1);
