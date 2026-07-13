// Config del client Sentry (la carica @sentry/astro al posto della sua di default).
// SOLO error monitoring: tracing a zero, niente Replay, niente log — su un sito
// statico gli errori sono l'unica cosa che vale la quota. Il DSN è pubblico per
// costruzione (identifica il progetto, non autentica nulla).
//
// Init PIGRO. Il SDK è 144 KB (48 gzip) e con l'import statico la sua valutazione
// era il singolo task JS più lungo del load (~250 ms su CPU 4×): l'intero costo
// stava nel percorso critico, per sorvegliare una pagina che a quel punto non
// aveva ancora fatto nulla. Misurato: senza SDK nel critico il TBT mobile va a 0.
//
// L'import dinamico spezza il SDK in un chunk suo (sempre servito da 'self': la
// CSP non cambia), caricato alla prima interazione o al primo momento di quiete.
// Si importa `@sentry/browser` DESTRUTTURATO, non il namespace di @sentry/astro:
// un namespace dinamico trattiene ogni export (misurato: 448 KB, replay incluso),
// il destructuring lascia tree-shakare — 84 KB (28 gzip), meno dell'eager di prima.
// Gli errori che scattano PRIMA non si perdono: due listener da niente li
// accodano e il SDK li spedisce appena arriva. Si perde solo l'errore del
// visitatore che crasha E se ne va prima dell'idle — accettato: il Worker
// sorveglia comunque l'unica rotta che fa danni (il form).

const coda = [];
const inCoda = (e) => { coda.push(e); };
window.addEventListener('error', inCoda);
window.addEventListener('unhandledrejection', inCoda);

let avviato = false;
async function avvia() {
  if (avviato) return;
  avviato = true;
  const { init, captureException } = await import('@sentry/browser');
  init({
    dsn: 'https://ffcac5d108001982eb70aa431c32af75@o4511713634484224.ingest.de.sentry.io/4511714029273168',
    tracesSampleRate: 0,
    // Niente IP/PII di default: coerente con la privacy dichiarata dal sito.
    sendDefaultPii: false,
  });
  window.removeEventListener('error', inCoda);
  window.removeEventListener('unhandledrejection', inCoda);
  for (const e of coda) {
    // ErrorEvent porta `error` (o solo `message`), PromiseRejectionEvent `reason`.
    captureException('reason' in e ? e.reason : (e.error ?? e.message));
  }
  coda.length = 0;
}

// Prima interazione o primo idle, chi arriva prima. Niente timer fisso di
// riserva: un timeout scelto male ricadrebbe proprio nella finestra di load
// che vogliamo liberare, e Safari (senza requestIdleCallback) ha comunque
// l'aggancio sull'interazione.
const eventi = ['pointerdown', 'keydown', 'scroll'];
const suInterazione = () => {
  for (const ev of eventi) window.removeEventListener(ev, suInterazione);
  avvia();
};
for (const ev of eventi) window.addEventListener(ev, suInterazione, { passive: true });
if ('requestIdleCallback' in window) requestIdleCallback(() => { avvia(); });
