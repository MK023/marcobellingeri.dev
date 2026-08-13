// /api/agentic-status: l'hub Agentic OS (Railway, dietro Cloudflare Tunnel) è
// un esperimento che può venire spento. Il contratto qui è "degrada, non
// rompe": campi a null e pagina viva, mai un errore al visitatore. E le due credenziali devono partire entrambe — Access
// davanti, token della status API dietro.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gestisciAgenticStatus } from '../worker/agentic-status.js';

const realFetch = globalThis.fetch;
const realCaches = globalThis.caches;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  delete globalThis.__SEGNALA_SENTRY__;
});

// La Cache API non esiste in node:test, ed è il motivo per cui il Worker la usa
// via `globalThis.caches?.default`: senza il doppio qui sotto il codice deve
// funzionare identico, solo senza ultimo-valore-buono. Due metodi soli, match e
// put, perché sono gli unici due che il Worker chiama.
const cacheFinta = () => {
  let salvato = null;
  const finta = {
    match: async () => (salvato ? salvato.clone() : undefined),
    put: async (_richiesta, risposta) => { salvato = risposta.clone(); },
    semina: (corpo) => { salvato = new Response(JSON.stringify(corpo), { status: 200 }); },
    haSalvato: () => salvato !== null,
  };
  globalThis.caches = { default: finta };
  return finta;
};

const catturaSegnalazioni = () => {
  const viste = [];
  globalThis.__SEGNALA_SENTRY__ = (messaggio, extra) => viste.push({ messaggio, extra });
  return viste;
};

const ENV = {
  AGENTIC_OS_STATUS_URL: 'https://status.example.com/status',
  AGENTIC_OS_ACCESS_CLIENT_ID: 'id-di-prova',
  AGENTIC_OS_ACCESS_CLIENT_SECRET: 'secret-di-prova',
  AGENTIC_OS_STATUS_TOKEN: 'token-di-prova',
};

const richiesta = () => new Request('https://marcobellingeri.dev/api/agentic-status');

test('mappa i tre campi dell hub in camelCase e li lascia cacheare', async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ sessions_today: 3, tokens_today: 48213, cost_usd_today: 1.42 }), { status: 200 });

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);

  assert.equal(risposta.status, 200);
  assert.deepEqual(await risposta.json(), { sessionsToday: 3, tokensToday: 48213, costUsdToday: 1.42 });
  assert.match(risposta.headers.get('Cache-Control'), /max-age=30/);
  assert.equal(risposta.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('manda ENTRAMBE le credenziali: Access davanti, token della status API dietro', async () => {
  let visti = null;
  globalThis.fetch = async (_url, opzioni) => {
    visti = opzioni.headers;
    return new Response(JSON.stringify({ sessions_today: 0, tokens_today: 0, cost_usd_today: 0 }), { status: 200 });
  };

  await gestisciAgenticStatus(richiesta(), ENV);

  assert.equal(visti['CF-Access-Client-Id'], 'id-di-prova');
  assert.equal(visti['CF-Access-Client-Secret'], 'secret-di-prova');
  assert.equal(visti.Authorization, 'Bearer token-di-prova');
});

test('hub irraggiungibile: campi a null, niente cache, segnalazione a Sentry', async () => {
  const viste = catturaSegnalazioni();
  globalThis.fetch = async () => { throw new Error('network down'); };

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);

  assert.equal(risposta.status, 200);
  assert.deepEqual(await risposta.json(), { sessionsToday: null, tokensToday: null, costUsdToday: null });
  assert.equal(risposta.headers.get('Cache-Control'), 'no-store');
  assert.equal(viste.length, 1);
});

test('hub che risponde male: null, e nei log lo stato nostro, non il corpo altrui', async () => {
  const viste = catturaSegnalazioni();
  globalThis.fetch = async () => new Response('boom, dettagli interni', { status: 502 });

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);

  assert.deepEqual(await risposta.json(), { sessionsToday: null, tokensToday: null, costUsdToday: null });
  assert.deepEqual(viste[0].extra, { stato: 502 });
  assert.doesNotMatch(JSON.stringify(viste[0]), /dettagli interni/);
});

test('senza URL configurato non chiama nessuno', async () => {
  let chiamate = 0;
  globalThis.fetch = async () => { chiamate += 1; return new Response('{}', { status: 200 }); };

  const risposta = await gestisciAgenticStatus(richiesta(), {});

  assert.equal(chiamate, 0);
  assert.deepEqual(await risposta.json(), { sessionsToday: null, tokensToday: null, costUsdToday: null });
});

test('JSON upstream malformato: degrada, non esplode', async () => {
  catturaSegnalazioni();
  globalThis.fetch = async () => new Response('non-json', { status: 200 });

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);

  assert.equal(risposta.status, 200);
  assert.deepEqual(await risposta.json(), { sessionsToday: null, tokensToday: null, costUsdToday: null });
});

// --- ultimo valore buono ----------------------------------------------------
// Il 13/08 due riavvii di Prometheus di pochi minuti hanno fatto mostrare "—" al
// widget. Un riavvio di un servizio interno non dovrebbe essere visibile su una
// pagina pubblica: meglio "numeri di qualche minuto fa", dichiarati tali, che un
// trattino. Cache API e non KV: nessun binding nuovo, nessuna infrastruttura da
// creare.

test('un successo salva l ultimo valore buono in cache', async () => {
  const cache = cacheFinta();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ sessions_today: 3, tokens_today: 48213, cost_usd_today: 1.42 }), { status: 200 });

  await gestisciAgenticStatus(richiesta(), ENV);

  assert.equal(cache.haSalvato(), true);
});

test('hub giu CON ultimo valore buono: serve i numeri vecchi, dichiarati vecchi', async () => {
  catturaSegnalazioni();
  const cache = cacheFinta();
  cache.semina({ sessionsToday: 3, tokensToday: 48213, costUsdToday: 1.42, salvatoIl: Date.now() - 120_000 });
  globalThis.fetch = async () => { throw new Error('network down'); };

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);
  const dati = await risposta.json();

  assert.equal(risposta.status, 200);
  assert.equal(dati.sessionsToday, 3);
  assert.equal(dati.tokensToday, 48213);
  assert.equal(dati.costUsdToday, 1.42);
  // Dichiarato vecchio, non spacciato per fresco: la pagina lo dice al visitatore
  // e smoke.yml lato hub ci fallisce sopra invece di vedere verde.
  assert.equal(dati.stale, true);
  assert.ok(dati.ageSeconds >= 120 && dati.ageSeconds < 130, `ageSeconds inatteso: ${dati.ageSeconds}`);
  assert.equal(risposta.headers.get('Cache-Control'), 'no-store');
});

test('un ultimo valore buono troppo vecchio non si serve: meglio il trattino', async () => {
  catturaSegnalazioni();
  const cache = cacheFinta();
  // Oltre l ora: "qualche minuto fa" e' utile, "stamattina" e' una bugia.
  cache.semina({ sessionsToday: 9, tokensToday: 1, costUsdToday: 1, salvatoIl: Date.now() - 3_600_001 });
  globalThis.fetch = async () => { throw new Error('network down'); };

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);

  assert.deepEqual(await risposta.json(), { sessionsToday: null, tokensToday: null, costUsdToday: null });
});

test('hub giu SENZA niente in cache: null come prima', async () => {
  catturaSegnalazioni();
  cacheFinta();
  globalThis.fetch = async () => { throw new Error('network down'); };

  const risposta = await gestisciAgenticStatus(richiesta(), ENV);

  assert.deepEqual(await risposta.json(), { sessionsToday: null, tokensToday: null, costUsdToday: null });
});
