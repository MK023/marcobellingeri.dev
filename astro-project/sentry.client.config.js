// Config del client Sentry (la carica @sentry/astro al posto della sua di default).
// SOLO error monitoring: tracing a zero, niente Replay, niente log — su un sito
// statico gli errori sono l'unica cosa che vale la quota. Il DSN è pubblico per
// costruzione (identifica il progetto, non autentica nulla).
import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: 'https://ffcac5d108001982eb70aa431c32af75@o4511713634484224.ingest.de.sentry.io/4511714029273168',
  tracesSampleRate: 0,
  // Niente IP/PII di default: coerente con la privacy dichiarata dal sito.
  sendDefaultPii: false,
});
