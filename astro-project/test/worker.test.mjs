// La scelta della lingua su `/` avviene all'edge, dove nessuno la guarda mai.
// Il caso che questo test esiste per prendere è il redirect cacheabile: con un 301,
// o senza `no-store`, una cache intermedia servirebbe a un americano il redirect
// calcolato per un italiano, e il bug sarebbe invisibile da qui.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { scegliLingua } from '../worker/index.js';

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
