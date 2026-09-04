// Caricamento ON-DEMAND dello script Turnstile, condiviso dai due widget che lo
// usano: il form contatti (Servizi.astro) e il comando `ask` del terminale
// (NeonTerminal.astro).
//
// IL DIFETTO CHE CHIUDE. Prima il tag <script src=".../api.js"> stava statico
// dentro Servizi.astro, e NeonTerminal dava per scontato di trovarselo già in
// pagina — a parole, in un commento. Vero finché il terminale viveva dove c'era
// il form; falso da quando sta in BaseLayout, cioè su OGNI pagina: su atlas,
// radar, ai, agentic-os, magazine, writing e 404 `window.turnstile` non esisteva
// e `ask` moriva prima di partire, 10 pagine su 12.
//
// Perché on-demand e non un tag statico in BaseLayout, che sarebbe stato una riga
// sola: privacy.astro dichiara che Turnstile tratta l'IP del visitatore «se usi
// il form» e «se fai una domanda al terminale», e ci appoggia la base giuridica.
// Un loader eager contatterebbe Cloudflare anche su una pagina dove il visitatore
// non tocca niente: renderebbe falsa la privacy. È anche la stessa scelta già
// fatta per Sentry (init pigro): nessun terzo nel percorso critico di una pagina
// che non lo usa.
//
// La CSP non cambia: `script-src` ammette già https://challenges.cloudflare.com
// su ogni pagina, e uno script iniettato con quel src passa come il tag di prima.
const URL_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// PERCHÉ NIENTE `?onload=` E NIENTE `turnstile.ready()`, cioè i due modi che la
// doc offre per sapere quando l'API è pronta. Sono stati provati entrambi, in
// quest'ordine, e nessuno dei due dice quello che a noi serve sapere:
//
//  - `turnstile.ready()` su uno script caricato in async — e uno iniettato a
//    runtime lo è per forza — Cloudflare lo rifiuta esplicitamente: «Remove
//    async/defer from the Turnstile api.js script tag before using
//    turnstile.ready()». La promise non si risolveva mai.
//  - `?onload=` risolve troppo presto. Misurato in PRODUZIONE il 04-09-2026:
//    la callback viene invocata, `window.turnstile.execute` esiste — ma i widget
//    `.cf-turnstile` NON sono ancora resi (nessun input `cf-turnstile-response`,
//    nessun iframe), perché Turnstile scarica un secondo stadio e li rende dopo.
//    Un `execute()` chiamato lì lancia «Please provide 2 parameters to execute».
//    Questo è costato una regressione in produzione sul form contatti (#272).
//
// Quello che serve non è «l'API è caricata», è «QUESTO widget è reso»: solo
// allora `execute()` lo trova. Il segnale è l'input nascosto che Turnstile crea
// dentro il container quando lo rende. Misurato in produzione con lo script
// semplice: entrambi i widget resi in 51ms, ed `execute()` non lancia più.
const reso = (el: HTMLElement) => !!el.querySelector('input[name="cf-turnstile-response"]');

// Sitekey di test di Cloudflare, valida su QUALSIASI hostname e sempre superata.
// Serve a una cosa sola, ed è la lezione di #272: la sitekey di produzione è
// legata al dominio vero, quindi in locale il widget non si rende MAI e ogni
// guasto — compreso quello che poi è finito in produzione — ha lo stesso identico
// sintomo di «siamo su localhost». Un ambiente locale che non può distinguere un
// difetto da una limitazione non è un ambiente di prova. Con questa chiave il
// percorso completo si prova sul proprio portatile.
// Non tocca la produzione: la sostituzione avviene solo se l'hostname è locale, e
// il gate vero resta comunque quello server-side nel Worker (siteverify), che una
// chiave di test non supera.
const SITEKEY_TEST = '1x00000000000000000000AA';
const inLocale = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

const TIMEOUT_MS = 10000;
const PASSO_MS = 50;

// Promise memoizzata: due widget sulla stessa pagina e più tentativi dello stesso
// widget devono iniettare lo script UNA volta sola.
let iniezione: Promise<void> | null = null;

function iniettaScript(): Promise<void> {
  if (iniezione) return iniezione;
  iniezione = new Promise<void>((resolve, reject) => {
    if (inLocale()) {
      document.querySelectorAll('.cf-turnstile').forEach((el) => el.setAttribute('data-sitekey', SITEKEY_TEST));
    }
    const s = document.createElement('script');
    s.src = URL_API;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      // Il fallimento non resta in cache: chi riprova dopo aver sbloccato
      // l'estensione, o quando la rete torna, deve poter ritentare.
      iniezione = null;
      reject(new Error('turnstile: script non caricato'));
    };
    document.head.appendChild(s);
  });
  return iniezione;
}

/**
 * Carica lo script Turnstile, se serve, e risolve quando `el` è un widget reso e
 * pronto per `execute()`. Idempotente: chiamarla N volte inietta un solo script.
 *
 * Rigetta se lo script non arriva (blocker, offline) o se il widget non viene
 * reso entro il timeout: un'attesa infinita sarebbe peggio di un errore, perché
 * chi chiama tiene un bottone disabilitato mentre aspetta.
 */
export async function caricaTurnstile(el: HTMLElement | null): Promise<void> {
  if (!el) throw new Error('turnstile: container assente');
  await iniettaScript();
  const scadenza = Date.now() + TIMEOUT_MS;
  while (!reso(el)) {
    if (Date.now() > scadenza) throw new Error('turnstile: widget non reso entro il timeout');
    await new Promise((r) => setTimeout(r, PASSO_MS));
  }
}
