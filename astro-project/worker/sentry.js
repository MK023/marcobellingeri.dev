// Entry di produzione del Worker: l'handler vero (index.js) avvolto in Sentry.
// È un file separato APPOSTA: i test (test/worker.test.mjs) importano index.js
// puro, senza SDK di mezzo — questo wrapper lo vede solo wrangler (main in
// wrangler.jsonc). Richiede il flag nodejs_compat.
//
// Cattura gli errori non gestiti di /api/contact e del redirect lingua — quelli
// che oggi diventano un 500 muto.
import * as Sentry from '@sentry/cloudflare';
import handler from './index.js';

// Reporter per i fallimenti GESTITI del form (Resend giù, config mancante):
// index.js lo chiama via globalThis così resta puro e testabile senza SDK.
globalThis.__SEGNALA_SENTRY__ = (messaggio, extra) =>
  Sentry.captureMessage(messaggio, { level: 'error', extra });

export default Sentry.withSentry(
  () => ({
    dsn: 'https://ffcac5d108001982eb70aa431c32af75@o4511713634484224.ingest.de.sentry.io/4511714029273168',
    // Tracing SOLO su /api/contact. Con `run_worker_first` ogni asset statico passa
    // di qui: un tracesSampleRate globale tracerebbe a tappeto il servizio di file
    // dalla cache edge — rumore che consuma quota e non dice niente. L'unica rotta
    // dove la latenza può davvero degradare è il form, che parla con due terzi
    // (Turnstile e Resend): se un giorno il contatto diventa lento, la causa è lì
    // e questo la fa vedere.
    tracesSampler: ({ name }) => (String(name).includes('/api/contact') ? 1 : 0),
    sendDefaultPii: false,
  }),
  handler,
);
