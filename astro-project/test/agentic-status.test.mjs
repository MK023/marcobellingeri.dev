// /api/agentic-status: l'hub Agentic OS è un VPS a mesi, che può non esserci.
// Il contratto qui è "degrada, non rompe": campi a null e pagina viva, mai un
// errore al visitatore. E le due credenziali devono partire entrambe — Access
// davanti, token della status API dietro.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gestisciAgenticStatus } from '../worker/agentic-status.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete globalThis.__SEGNALA_SENTRY__; });

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
