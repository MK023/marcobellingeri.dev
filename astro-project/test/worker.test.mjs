// La scelta della lingua su `/` avviene all'edge, dove nessuno la guarda mai.
// Il caso che questo test esiste per prendere è il redirect cacheabile: con un 301,
// o senza `no-store`, una cache intermedia servirebbe a un americano il redirect
// calcolato per un italiano, e il bug sarebbe invisibile da qui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { scegliLingua, gestisciContatto } from '../worker/index.js';

const asset = { ASSETS: { fetch: async () => new Response('asset') } };
const richiesta = (url, paese) => Object.assign(new Request(url), { cf: { country: paese } });

test('Italia → italiano, resto del mondo → inglese', () => {
  assert.equal(scegliLingua('IT'), 'it');
  assert.equal(scegliLingua('US'), 'en');
  assert.equal(scegliLingua('DE'), 'en');
  // Cloudflare omette `country` per IP anonimizzati e richieste interne.
  assert.equal(scegliLingua(undefined), 'en');
});

test('la root reindirizza conservando la query string', async () => {
  const r = await worker.fetch(richiesta('https://marcobellingeri.dev/?utm=x', 'IT'), asset);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://marcobellingeri.dev/it/?utm=x');
});

test('il redirect non è cacheabile', async () => {
  const r = await worker.fetch(richiesta('https://marcobellingeri.dev/', 'US'), asset);
  // 301 resterebbe nella cache del browser: la lingua dipende da chi chiede, non dall'URL.
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('location'), 'https://marcobellingeri.dev/en/');
});

test('tutto ciò che non è `/` passa agli asset', async () => {
  const r = await worker.fetch(richiesta('https://marcobellingeri.dev/it/', 'US'), asset);
  assert.equal(await r.text(), 'asset');
});

test('la scelta manuale della lingua vince sul paese', () => {
  // UtilityBar scrive `pref-lang` quando si clicca EN/IT: chi vive in Italia e
  // sceglie l'inglese non deve tornare in italiano ogni volta che passa dalla root.
  assert.equal(scegliLingua('IT', 'pref-lang=en'), 'en');
  assert.equal(scegliLingua('US', 'pref-lang=it'), 'it');
  assert.equal(scegliLingua('IT', 'altro=1; pref-lang=en; terzo=2'), 'en');
  // un cookie con un valore che non conosciamo non deve dirottare nulla
  assert.equal(scegliLingua('IT', 'pref-lang=de'), 'it');
  assert.equal(scegliLingua('US', 'pref-lang='), 'en');
  assert.equal(scegliLingua('IT', null), 'it');
});

test('il cookie arriva al Worker dalla richiesta, non da un parametro', async () => {
  const r = await worker.fetch(
    Object.assign(new Request('https://marcobellingeri.dev/', { headers: { cookie: 'pref-lang=en' } }), {
      cf: { country: 'IT' },
    }),
    { ASSETS: { fetch: async () => new Response('asset') } },
  );
  assert.equal(r.headers.get('location'), 'https://marcobellingeri.dev/en/');
});

// ---- form di contatto (/api/contact) ----
const postContatto = (body, env = { RESEND_API_KEY: 'test' }) =>
  gestisciContatto(
    new Request('https://marcobellingeri.dev/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );

test('contatto: honeypot pieno = finto successo, nessun invio', async () => {
  const originale = globalThis.fetch;
  let chiamato = false;
  globalThis.fetch = async () => { chiamato = true; return new Response('', { status: 200 }); };
  try {
    const r = await postContatto({ email: 'bot@x.com', brief: 'messaggio abbastanza lungo', azienda: 'ACME' });
    assert.equal(r.status, 200);
    assert.equal(chiamato, false, 'un honeypot pieno non deve mandare nulla');
  } finally { globalThis.fetch = originale; }
});

test('contatto: email invalida o brief troppo corto = 422', async () => {
  assert.equal((await postContatto({ email: 'non-una-email', brief: 'abbastanza lungo qui' })).status, 422);
  assert.equal((await postContatto({ email: 'ok@x.com', brief: 'corto' })).status, 422);
});

test('contatto: valido = inoltra a Resend con reply_to del visitatore', async () => {
  const originale = globalThis.fetch;
  let inviato;
  globalThis.fetch = async (u, opt) => {
    inviato = { u, body: JSON.parse(opt.body) };
    return new Response('{}', { status: 200 });
  };
  try {
    const r = await postContatto({ nome: 'Mario', email: 'mario@x.com', brief: 'un messaggio vero e lungo' });
    assert.equal(r.status, 200);
    assert.equal(inviato.u, 'https://api.resend.com/emails');
    assert.equal(inviato.body.reply_to, 'mario@x.com');
    assert.equal(inviato.body.to[0], 'mkdevpy@proton.me');
  } finally { globalThis.fetch = originale; }
});

test('contatto: senza API key configurata = 503, non un 500 opaco', async () => {
  const r = await postContatto({ email: 'ok@x.com', brief: 'un messaggio abbastanza lungo' }, {});
  assert.equal(r.status, 503);
});

test('contatto: solo POST', async () => {
  const r = await gestisciContatto(new Request('https://marcobellingeri.dev/api/contact'), {});
  assert.equal(r.status, 405);
});

test('contatto: oltre il rate limit = 429, sotto = passa', async () => {
  const richiestaValida = () =>
    new Request('https://marcobellingeri.dev/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
      body: JSON.stringify({ email: 'ok@x.com', brief: 'un messaggio abbastanza lungo' }),
    });
  const bloccato = await gestisciContatto(richiestaValida(), {
    CONTACT_LIMITER: { limit: async () => ({ success: false }) },
  });
  assert.equal(bloccato.status, 429);

  const originale = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    const passa = await gestisciContatto(richiestaValida(), {
      CONTACT_LIMITER: { limit: async () => ({ success: true }) },
      RESEND_API_KEY: 'test',
    });
    assert.equal(passa.status, 200);
  } finally { globalThis.fetch = originale; }
});

test('contatto: Origin estraneo = 403 (richiesta forgiata da altro sito)', async () => {
  const r = await gestisciContatto(
    new Request('https://marcobellingeri.dev/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attaccante.example' },
      body: JSON.stringify({ email: 'ok@x.com', brief: 'un messaggio abbastanza lungo' }),
    }),
    { RESEND_API_KEY: 'test' },
  );
  assert.equal(r.status, 403);
});

test('contatto: body oltre i 32 KB = 413, senza nemmeno parsarlo', async () => {
  const r = await gestisciContatto(
    new Request('https://marcobellingeri.dev/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' },
      body: '{}',
    }),
    { RESEND_API_KEY: 'test' },
  );
  assert.equal(r.status, 413);
});

test('contatto: un nome con \\r\\n non inietta header nel subject', async () => {
  const originale = globalThis.fetch;
  let inviato;
  globalThis.fetch = async (u, opt) => { inviato = JSON.parse(opt.body); return new Response('{}', { status: 200 }); };
  try {
    const r = await postContatto({ nome: 'Mario\r\nBcc: spam@evil.example', email: 'ok@x.com', brief: 'un messaggio abbastanza lungo' });
    assert.equal(r.status, 200);
    assert.ok(!/[\r\n]/.test(inviato.subject), 'il subject non deve contenere CR/LF');
    assert.match(inviato.subject, /Mario Bcc: spam@evil\.example/);
  } finally { globalThis.fetch = originale; }
});

test('contatto: le risposte API portano no-store e nosniff', async () => {
  const r = await gestisciContatto(new Request('https://marcobellingeri.dev/api/contact'), {});
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('contatto: Resend giù = 502 E segnalato a Sentry (fallimento gestito)', async () => {
  const originale = globalThis.fetch;
  const hookOriginale = globalThis.__SEGNALA_SENTRY__;
  let segnalato = null;
  globalThis.__SEGNALA_SENTRY__ = (msg) => { segnalato = msg; };
  globalThis.fetch = async () => new Response('{}', { status: 500 });
  try {
    const r = await postContatto({ email: 'ok@x.com', brief: 'un messaggio abbastanza lungo' });
    assert.equal(r.status, 502);
    assert.match(String(segnalato), /Resend/);
  } finally {
    globalThis.fetch = originale;
    globalThis.__SEGNALA_SENTRY__ = hookOriginale;
  }
});

test('contatto: Turnstile configurato + token valido = inoltra', async () => {
  const originale = globalThis.fetch;
  globalThis.fetch = async (u) =>
    String(u).includes('siteverify')
      ? new Response(JSON.stringify({ success: true }), { status: 200 })
      : new Response('{}', { status: 200 });
  try {
    const r = await postContatto(
      { email: 'ok@x.com', brief: 'un messaggio abbastanza lungo', turnstile: 'tok' },
      { RESEND_API_KEY: 'test', TURNSTILE_SECRET_KEY: 'sec' },
    );
    assert.equal(r.status, 200);
  } finally { globalThis.fetch = originale; }
});

test('contatto: Turnstile configurato + token invalido = 403, niente invio', async () => {
  const originale = globalThis.fetch;
  let resendChiamato = false;
  globalThis.fetch = async (u) => {
    if (String(u).includes('siteverify')) return new Response(JSON.stringify({ success: false }), { status: 200 });
    resendChiamato = true;
    return new Response('{}', { status: 200 });
  };
  try {
    const r = await postContatto(
      { email: 'ok@x.com', brief: 'un messaggio abbastanza lungo', turnstile: 'cattivo' },
      { RESEND_API_KEY: 'test', TURNSTILE_SECRET_KEY: 'sec' },
    );
    assert.equal(r.status, 403);
    assert.equal(resendChiamato, false, 'un token invalido non deve arrivare a Resend');
  } finally { globalThis.fetch = originale; }
});

test('contatto: TURNSTILE_SECRET_KEY mancante = fail-open ma segnalato a Sentry', async () => {
  const originale = globalThis.fetch;
  const hookOriginale = globalThis.__SEGNALA_SENTRY__;
  let segnalato = null;
  let resendChiamato = false;
  globalThis.__SEGNALA_SENTRY__ = (msg) => { segnalato = msg; };
  globalThis.fetch = async (u) => {
    if (String(u).includes('siteverify')) throw new Error('siteverify non deve essere chiamato senza secret');
    resendChiamato = true;
    return new Response('{}', { status: 200 });
  };
  try {
    // env con Resend ma SENZA TURNSTILE_SECRET_KEY: la verifica bot si salta (fail-open)
    const r = await postContatto(
      { email: 'ok@x.com', brief: 'un messaggio abbastanza lungo' },
      { RESEND_API_KEY: 'test' },
    );
    assert.equal(r.status, 200, 'fail-open: la richiesta valida passa comunque');
    assert.equal(resendChiamato, true, 'senza Turnstile la mail parte lo stesso');
    assert.match(String(segnalato), /TURNSTILE/, 'la config mancante deve arrivare a Sentry');
  } finally {
    globalThis.fetch = originale;
    globalThis.__SEGNALA_SENTRY__ = hookOriginale;
  }
});
