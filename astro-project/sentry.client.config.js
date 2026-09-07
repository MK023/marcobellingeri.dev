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

// Via ESPLICITA per segnalare un guasto che il codice di pagina ha già gestito.
// Prima non c'era, e chi doveva segnalare aveva una strada sola: lanciare dentro
// un setTimeout perché la coda qui sopra ne raccogliesse l'eccezione. Costava tre
// difetti — l'evento arrivava `handled: no`, con lo stack del setTimeout al posto
// del punto vero, e finiva mescolato ai crash dei visitatori nella stessa lista.
// Un fallimento previsto e gestito è un `warning`, non un crash.
//
// Il nome è lo stesso del Worker (`worker/sentry.js`), il CONTRATTO no, e vale
// la pena dirlo qui perché la somiglianza invita a spostare una chiamata da una
// parte all'altra: di là la firma è `(messaggio, extra)` e il livello è fissato a
// `error`, di qua è `(messaggio, livello)` e il default è `warning`. Il secondo
// parametro significa due cose diverse. Un `__SEGNALA_SENTRY__('x', { id })`
// copiato qui dal Worker non passerebbe un extra: passerebbe un oggetto dove
// Sentry si aspetta un livello, e lo leggerebbe come CaptureContext rimodellando
// l'evento in silenzio. Due canali con lo stesso nome, non uno solo.
const messaggi = [];
let inoltra = null;
window.__SEGNALA_SENTRY__ = (messaggio, livello = 'warning') => {
  if (inoltra) { inoltra(messaggio, livello); return; }
  messaggi.push([messaggio, livello]);
  // Il primo segnale è anche una ragione per svegliare il SDK. Senza, un guasto
  // sul gate dell'unica rotta che porta clienti resterebbe in coda fino alla
  // prima interazione o al primo idle — e dopo un errore quel momento può non
  // arrivare mai, perché il visitatore se ne va.
  //
  // `.catch()` obbligatorio: `avvia()` è async, e se l'import dinamico del SDK
  // fallisce (chunk 404 dopo un deploy, blocker, offline) una rejection non
  // gestita partita dal percorso di SEGNALAZIONE di un errore diventerebbe un
  // secondo errore. Si ingoia: chi segnala non deve poter rompere la pagina.
  //
  // Non c'è niente da recuperare dopo quel fallimento e non ci si riprova: la
  // module map del browser registra il modulo come fallito, quindi una seconda
  // import rifiuta senza toccare la rete (le fonti stanno in
  // docs/turnstile-e-sentry-fonti.md). Ma la coda non resta lì a crescere:
  // `rinuncia()` stacca i listener e la svuota.
  avvia().catch(() => {});
};

// Le due mani che raccolgono in attesa del SDK. Staccarle è l'unica cosa sensata
// da fare quando il SDK non arriverà mai: vedi `rinuncia()`.
function staccaCoda() {
  window.removeEventListener('error', inCoda);
  window.removeEventListener('unhandledrejection', inCoda);
}

// Il SDK non è arrivato e non arriverà. Si smette di raccogliere.
//
// NON si ritenta, e la ragione è che non funzionerebbe: un modulo il cui fetch
// fallisce resta registrato come fallito nel module map del browser, e ogni
// `import()` successivo dello stesso specificatore ricade su quella voce e
// rifiuta senza toccare la rete. Vite lo dice a modo suo — per il caso «chunk
// cancellato da un deploy mentre la pagina è aperta» documenta l'evento
// `vite:preloadError` e come rimedio un `window.location.reload()`, non una
// seconda import. Un contatore di tentativi qui sarebbe stato scenografia.
//
// Il reload NON si fa da qui, ed è una scelta da lasciare a chi conosce il
// prodotto: su questo sito la pagina che più probabilmente è aperta da un po' è
// quella col form di contatto, e ricaricarla butterebbe via il brief che il
// visitatore ha appena composto. Un errore di telemetria non può costare un
// cliente. Se un giorno si vorrà quel comportamento, il posto è un listener su
// `vite:preloadError`, non questo catch.
//
// Cosa cambia allora, se non si recupera niente: si smette di FINGERE. Prima la
// pagina restava agganciata ai due listener e continuava ad accodare per tutta la
// sua vita, tenendo in memoria ogni ErrorEvent con il suo oggetto Error e il suo
// stack — su una pagina con un guasto ripetuto (un intervallo che lancia, un
// ciclo di rejection) la coda cresceva senza che nulla potesse mai drenarla.
// Raccogliere prove che nessuno leggerà non è prudenza, è una perdita.
function rinuncia() {
  staccaCoda();
  coda.length = 0;
  messaggi.length = 0;
  // Il canale resta chiamabile e diventa un no-op esplicito: chi segnala non
  // deve sapere che il SDK non c'è, e soprattutto non deve tornare ad accodare.
  inoltra = () => {};
}

let avviato = false;
async function avvia() {
  if (avviato) return;
  avviato = true;
  let sdk;
  try {
    sdk = await import('@sentry/browser');
  } catch {
    // Solo l'import sta nel `try`: qui il guasto è «la rete non ha consegnato»,
    // previsto, e si rinuncia. Un errore di `init()` o del drenaggio è un difetto
    // NOSTRO e resta fuori, quindi diventa una rejection non gestita e si vede —
    // che è l'unico modo di vederlo quando il canale per segnalarlo è proprio
    // quello che non è partito.
    rinuncia();
    return;
  }
  const { init, captureException, captureMessage } = sdk;
  init({
    dsn: 'https://ffcac5d108001982eb70aa431c32af75@o4511713634484224.ingest.de.sentry.io/4511714029273168',
    tracesSampleRate: 0,
    // Qui il segnale e' l'hostname, non una variabile: il bundle servito in
    // locale e quello in produzione sono lo STESSO artefatto (`wrangler dev`
    // serve la build, non i sorgenti), quindi `import.meta.env.PROD` e' vero in
    // entrambi e non distingue niente. L'hostname invece cambia sempre.
    //
    // Si elencano gli host LOCALI, non quello di produzione, e il verso conta:
    // con l'elenco al contrario basterebbe rispondere un giorno da
    // `www.marcobellingeri.dev` o da un dominio in piu' perche' gli errori dei
    // visitatori veri finissero etichettati `development` e sparissero dietro il
    // filtro — in silenzio. Cosi' invece un host di sviluppo che qui non c'e'
    // costa del rumore, che si vede. `sito` e' il nome del servizio in
    // docker-compose, da cui le verifiche raggiungono il sito.
    environment: ['localhost', '127.0.0.1', '[::1]', 'sito'].includes(location.hostname)
      ? 'development'
      : 'production',
    // Niente IP/PII di default: coerente con la privacy dichiarata dal sito.
    sendDefaultPii: false,
  });
  staccaCoda();
  for (const e of coda) {
    // ErrorEvent porta `error` (o solo `message`), PromiseRejectionEvent `reason`.
    captureException('reason' in e ? e.reason : (e.error ?? e.message));
  }
  coda.length = 0;
  inoltra = captureMessage;
  for (const [messaggio, livello] of messaggi) captureMessage(messaggio, livello);
  messaggi.length = 0;
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
