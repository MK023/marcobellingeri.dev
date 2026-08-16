// /api/agentic-status: l'hub Agentic OS (Railway, dietro Cloudflare Tunnel) è
// un esperimento che può venire spento. Il contratto qui è "degrada, non
// rompe": campi a null e pagina viva, mai un errore al visitatore. E le due credenziali devono partire entrambe — Access
// davanti, token della status API dietro.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gestisciAgenticStatus, sondaHub } from '../worker/agentic-status.js';
import worker from '../worker/index.js';

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

// --- la sonda schedulata -----------------------------------------------------
// Cloudflare Cron Trigger ogni 2 minuti. Esiste perche' smoke.yml, che gira su
// GitHub Actions, CHIEDE `*/10` ma misurato ne fa ~55: GitHub strozza i cron
// frequenti sui repo pubblici, quindi un disservizio di due minuti gli passa
// sotto. Questa sonda sta sul bordo e non viene strozzata.
//
// Il lavoro vero lo fa gia' `gestisciAgenticStatus`, che segnala a Sentry quando
// l'hub non risponde. Alla sonda manca solo di INVOCARLO quando nessun
// visitatore lo sta facendo: e' quello, e nient'altro, il valore che aggiunge.

test('la sonda dice degradato quando l hub non risponde', async () => {
  const viste = catturaSegnalazioni();
  globalThis.fetch = async () => { throw new Error('network down'); };

  assert.equal(await sondaHub(ENV), true);
  // Segnalato UNA volta, dal percorso condiviso: la sonda non aggiunge un
  // secondo evento sullo stesso guasto.
  assert.equal(viste.length, 1);
});

test('la sonda dice sano quando i tre numeri arrivano', async () => {
  const viste = catturaSegnalazioni();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ sessions_today: 3, tokens_today: 48213, cost_usd_today: 1.42 }), { status: 200 });

  assert.equal(await sondaHub(ENV), false);
  assert.equal(viste.length, 0);
});

test('numeri VECCHI dalla cache sono degradato, non salute', async () => {
  // Il caso che il fail-open rende invisibile: l'hub e' giu' ma il Worker serve
  // l'ultimo valore buono, quindi i tre campi sono pieni. Guardare solo i null
  // direbbe "tutto bene" per un'ora intera.
  catturaSegnalazioni();
  const cache = cacheFinta();
  cache.semina({ sessionsToday: 3, tokensToday: 48213, costUsdToday: 1.42, salvatoIl: Date.now() - 60_000 });
  globalThis.fetch = async () => { throw new Error('network down'); };

  assert.equal(await sondaHub(ENV), true);
});

test('la sonda non esplode mai: un guasto suo non deve diventare un cron rosso', async () => {
  catturaSegnalazioni();
  globalThis.fetch = async () => { throw new Error('network down'); };

  // env senza URL: il percorso condiviso risponde vuoto senza chiamare nessuno.
  assert.equal(await sondaHub({}), true);
});

test('il Worker espone scheduled, ed e la sonda', async () => {
  catturaSegnalazioni();
  let chiamate = 0;
  globalThis.fetch = async () => {
    chiamate += 1;
    return new Response(JSON.stringify({ sessions_today: 1, tokens_today: 2, cost_usd_today: 3 }), { status: 200 });
  };

  assert.equal(typeof worker.scheduled, 'function');
  await worker.scheduled({ cron: '*/2 * * * *', scheduledTime: Date.now() }, ENV, { waitUntil: () => {} });
  assert.equal(chiamate, 1);
});

// ─── La superficie pubblica della rotta ──────────────────────────────────────
//
// Tre rilievi di un assessment OWASP API del 16/08, tutti misurati in
// produzione: la rotta rispondeva 200 a POST/PUT/DELETE/PATCH, usciva col solo
// `nosniff` mentre l'HTML riceve cinque header, e non aveva nessun limite.

const richiestaConMetodo = (metodo) =>
  new Request('https://marcobellingeri.dev/api/agentic-status', { method: metodo });

const richiestaDa = (ip) =>
  new Request('https://marcobellingeri.dev/api/agentic-status', { headers: { 'CF-Connecting-IP': ip } });

const hubSano = () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ sessions_today: 3, tokens_today: 48213, cost_usd_today: 1.42 }), { status: 200 });
};

// I valori stanno scritti qui per esteso e non importati dal Worker: un test che
// confronta una costante con se stessa non puo' fallire. Questi sono gli stessi
// cinque header di public/_headers, che resta la fonte di verita'.
const HEADER_ATTESI = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'content-security-policy': "frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
};

const assertHeaderSicurezza = (risposta, dove) => {
  for (const [nome, valore] of Object.entries(HEADER_ATTESI)) {
    assert.equal(risposta.headers.get(nome), valore, `${dove}: header ${nome} assente o diverso`);
  }
};

test('un metodo che non e GET riceve 405 e Allow, non i tre numeri', async () => {
  hubSano();
  for (const metodo of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const r = await gestisciAgenticStatus(richiestaConMetodo(metodo), ENV);
    assert.equal(r.status, 405, `${metodo} doveva essere rifiutato`);
    // Senza `Allow` un 405 non dice al client cosa dovrebbe usare.
    assert.equal(r.headers.get('Allow'), 'GET', `${metodo}: manca Allow`);
  }
});

test('la risposta coi numeri freschi porta gli header di sicurezza', async () => {
  hubSano();
  assertHeaderSicurezza(await gestisciAgenticStatus(richiesta(), ENV), 'risposta fresca');
});

test('anche il degradato e il vuoto portano gli header di sicurezza', async () => {
  catturaSegnalazioni();
  globalThis.fetch = async () => { throw new Error('network down'); };
  assertHeaderSicurezza(await gestisciAgenticStatus(richiesta(), ENV), 'degradato');
  // Senza URL configurato non si chiama nessuno: e' l'altra risposta possibile.
  assertHeaderSicurezza(await gestisciAgenticStatus(richiesta(), {}), 'vuoto');
});

test('oltre il limite la rotta risponde 429 con Retry-After', async () => {
  hubSano();
  const env = { ...ENV, STATUS_LIMITER: { limit: async () => ({ success: false }) } };
  const r = await worker.fetch(richiestaDa('203.0.113.7'), env, { waitUntil: () => {} });

  assert.equal(r.status, 429);
  // Il periodo del binding e' 60s: dire al client quando ritentare evita che
  // ritenti subito e resti fuori piu' a lungo.
  assert.equal(r.headers.get('Retry-After'), '60');
});

test('il limite conta per IP di chi chiede', async () => {
  hubSano();
  let chiave = null;
  const env = { ...ENV, STATUS_LIMITER: { limit: async ({ key }) => { chiave = key; return { success: true }; } } };
  const r = await worker.fetch(richiestaDa('203.0.113.7'), env, { waitUntil: () => {} });

  assert.equal(chiave, '203.0.113.7');
  assert.equal(r.status, 200);
});

test('la sonda NON passa dal rate limit: un flood non le fa dire "hub giu"', async () => {
  // Il test che discrimina fra le due implementazioni possibili. Se il limite
  // stesse dentro `gestisciAgenticStatus`, la sonda del cron — che chiama la
  // funzione, non la rotta, e non ha nessun IP — finirebbe nel secchio
  // 'sconosciuto' insieme a chiunque altro non ne abbia. Un flood la farebbe
  // rimbalzare con 429, lei leggerebbe una risposta che non sono i numeri e
  // segnalerebbe a Sentry un hub giu' che invece sta benissimo: un allarme
  // falso generato dalla nostra stessa difesa.
  catturaSegnalazioni();
  hubSano();
  let chiamate = 0;
  const env = { ...ENV, STATUS_LIMITER: { limit: async () => { chiamate += 1; return { success: false }; } } };

  assert.equal(await sondaHub(env), false, 'la sonda deve vedere l hub sano');
  assert.equal(chiamate, 0, 'la sonda non deve consumare il limite');
});
