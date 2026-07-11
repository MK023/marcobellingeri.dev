// Entry di produzione del Worker: l'handler vero (index.js) avvolto in Sentry.
// È un file separato APPOSTA: i test (test/worker.test.mjs) importano index.js
// puro, senza SDK di mezzo — questo wrapper lo vede solo wrangler (main in
// wrangler.jsonc). Richiede il flag nodejs_compat.
//
// Cattura gli errori non gestiti di /api/contact e del redirect lingua — quelli
// che oggi diventano un 500 muto. Solo errori: tracing a zero, come sul client.
import * as Sentry from '@sentry/cloudflare';
import handler from './index.js';

// Reporter per i fallimenti GESTITI del form (Resend giù, config mancante):
// index.js lo chiama via globalThis così resta puro e testabile senza SDK.
globalThis.__SEGNALA_SENTRY__ = (messaggio, extra) =>
  Sentry.captureMessage(messaggio, { level: 'error', extra });

export default Sentry.withSentry(
  () => ({
    dsn: 'https://ffcac5d108001982eb70aa431c32af75@o4511713634484224.ingest.de.sentry.io/4511714029273168',
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  handler,
);
