// Caricamento ON-DEMAND dello script Turnstile, condiviso dai due widget che lo
// usano: il form contatti (Servizi.astro) e il comando `ask` del terminale
// (NeonTerminal.astro).
//
// IL DIFETTO CHE CHIUDE. Prima il tag <script src=".../api.js"> stava statico
// dentro Servizi.astro, e NeonTerminal dava per scontato di trovarselo già in
// pagina — a parole, in un commento. Vero finché il terminale viveva solo dove
// c'era il form; falso da quando sta in BaseLayout, cioè su OGNI pagina: su
// atlas, radar, ai, agentic-os, magazine, writing e 404 `window.turnstile` non
// esisteva e `ask` moriva prima di partire, 10 pagine su 12.
//
// Perché on-demand e non un tag statico in BaseLayout, che sarebbe stato una riga
// sola: privacy.astro dichiara che Turnstile tratta l'IP del visitatore «se usi
// il form» e «se fai una domanda al terminale», e ci appoggia la base giuridica
// del legittimo interesse (strettamente necessario alla sicurezza). Un loader
// eager contatterebbe Cloudflare anche su una pagina dove il visitatore non
// tocca niente: renderebbe falsa la privacy, e la si sarebbe dovuta riscrivere
// per far combaciare il testo al codice invece del contrario. È anche la stessa
// scelta già fatta per Sentry (init pigro, sentry.client.config.js): nessun
// terzo nel percorso critico di una pagina che non lo usa.
//
// La CSP non cambia: `script-src` ammette già https://challenges.cloudflare.com
// su ogni pagina, e uno script iniettato con quel src passa esattamente come il
// tag statico di prima.
const URL_API = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Il nome della callback che Turnstile invoca quando la sua API è pronta. Passa
// dalla query `?onload=`, quindi il collegamento è per NOME su window: è lo
// stesso contratto dei data-callback dei widget, e per lo stesso motivo sta
// dichiarato in env.d.ts invece di vivere dentro una stringa.
//
// PERCHÉ NON `turnstile.ready()`, che sarebbe stato più diretto: su uno script
// caricato in async — e uno iniettato a runtime lo è per forza — Cloudflare lo
// rifiuta con «Remove async/defer from the Turnstile api.js script tag before
// using turnstile.ready()». Verificato nel browser: la promise non si risolveva
// mai, `ask` restava appeso e il bottone del form inchiodato su "INVIO…".
const NOME_CALLBACK = 'turnstilePronto';

// Se l'API non risponde entro questo tempo la promise fallisce invece di restare
// appesa: chi chiama disabilita un bottone in attesa, e un'attesa infinita è
// peggio di un errore — la pagina resta bloccata senza dire niente. È il guasto
// misurato sopra, reso impossibile invece che solo corretto.
const TIMEOUT_MS = 10000;

// Promise memoizzata: due widget sulla stessa pagina (form + terminale) e più
// tentativi dello stesso widget devono iniettare lo script UNA volta sola. Il
// secondo chiamante aspetta la stessa promise, non ne apre una seconda.
let caricamento: Promise<void> | null = null;

/**
 * Carica lo script Turnstile e risolve quando l'API è pronta all'uso, cioè
 * quando i widget `.cf-turnstile` già in pagina sono stati resi e `execute()`
 * può essere chiamato. Idempotente: chiamarla N volte inietta un solo script.
 *
 * Rigetta se lo script non arriva (blocker, offline, rete che cade). È un esito
 * ATTESO, non un guasto: chi chiama mostra un errore riprovabile e non lo manda
 * a Sentry, che altrimenti collezionerebbe gli ad-blocker del mondo.
 */
export function caricaTurnstile(): Promise<void> {
  // L'API è già in pagina: non c'è niente da caricare, chiunque l'abbia portata.
  // Non è un'ottimizzazione, è la via d'uscita dal timeout. Quando questo scade,
  // la promise viene rifiutata ma lo script può arrivare un istante dopo: da lì
  // in poi Turnstile è vivo e funzionante, e la sua `?onload=` è già stata
  // spesa — non la richiamerà mai più. Senza questa riga il tentativo dopo
  // inietterebbe un secondo tag e aspetterebbe un annuncio che non può arrivare,
  // altri 10 secondi, per sempre: il visitatore leggerebbe "riprova" davanti a
  // un Turnstile perfettamente pronto, fino a un ricaricamento della pagina.
  if (window.turnstile?.execute) return Promise.resolve();
  if (caricamento) return caricamento;
  caricamento = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    // La promise fallita non resta in cache: chi riprova (l'utente che riclicca
    // dopo aver sbloccato l'estensione, o dopo che la rete è tornata) deve poter
    // ritentare l'iniezione, non ereditare per sempre il primo rifiuto.
    //
    // Fallire NON cancella la callback da window, e non toglie il tag: sul
    // percorso del timeout lo script può essere ancora in volo, e Turnstile
    // chiamerebbe un nome ormai non definito — un TypeError non gestito, cioè
    // proprio il rumore in Sentry che questo giro serviva a togliere. Lasciata
    // lì è innocua: risolvere una promise già conclusa non fa niente, e se nel
    // frattempo un secondo tentativo l'ha riassegnata, quella chiamata è
    // comunque la verità (la API Turnstile in pagina è una sola: se annuncia di
    // essere pronta, lo è per chiunque stia aspettando).
    const fallito = (motivo: string) => {
      caricamento = null;
      reject(new Error(motivo));
    };
    const orologio = setTimeout(() => fallito('turnstile: api non pronta entro il timeout'), TIMEOUT_MS);

    // `load` dello script direbbe solo che il file è stato valutato, non che
    // l'API sia utilizzabile e i widget `.cf-turnstile` in pagina siano resi:
    // con `data-execution="execute"` un execute() anticipato non troverebbe il
    // widget. `?onload=` è la garanzia che Cloudflare documenta per questo.
    window[NOME_CALLBACK] = () => {
      clearTimeout(orologio);
      delete window[NOME_CALLBACK];
      resolve();
    };
    s.src = `${URL_API}?onload=${NOME_CALLBACK}`;
    s.async = true;
    s.onerror = () => { clearTimeout(orologio); fallito('turnstile: script non caricato'); };
    document.head.appendChild(s);
  });
  return caricamento;
}
