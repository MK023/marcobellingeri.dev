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
  (env) => ({
    dsn: 'https://ffcac5d108001982eb70aa431c32af75@o4511713634484224.ingest.de.sentry.io/4511714029273168',
    // Senza questo, il SDK etichetta OGNI evento `production`, comprese le
    // sessioni locali: il 14% del volume di 30 giorni veniva da `wrangler dev`
    // su localhost:8788, e un evento del 04-09-2026 nato da un test pre-merge
    // (`RESEND_API_KEY mancante in produzione`) ha fatto sembrare rotto un
    // canale sano per mezz'ora, perche' diceva «produzione» e non lo era.
    //
    // Il default e' `production` e non il contrario di proposito: se un giorno
    // la variabile manca dove dovrebbe esserci, il costo e' del rumore in piu'.
    // Al contrario — un errore di produzione etichettato `development` — il
    // costo e' un guasto vero che sparisce dietro un filtro, che e' esattamente
    // il difetto che questa settimana e' servita a togliere.
    //
    // Chi sviluppa dichiara di esserlo: il container passa
    // `--var AMBIENTE:development` (vedi Dockerfile), e chi lancia `wrangler dev`
    // a mano può fare lo stesso o metterlo in `.dev.vars`.
    environment: env.AMBIENTE ?? 'production',
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
