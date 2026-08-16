// Gli header di sicurezza delle risposte generate dal Worker.
//
// `public/_headers` resta la fonte di verita', ma Cloudflare lo applica ai soli
// asset statici: JSON dell'API e 302 sulla root non ci passano. Finora ogni
// risposta se li scriveva addosso da sola, e la lista era divergente — le rotte
// API uscivano col solo `nosniff` mentre l'HTML ne riceveva cinque.
//
// Sta qui e non in index.js perche' agentic-status.js e radar.js devono
// importarlo, e index.js importa gia' loro: al contrario sarebbe un ciclo.
//
// Quando si tocca `public/_headers`, si tocca anche questo. Sono due posti, e lo
// sono per forza — uno e' un file di configurazione di Cloudflare, l'altro e'
// codice — ma un test tiene i valori scritti per esteso, quindi una divergenza
// diventa un rosso invece di una scoperta fra sei mesi.
export const HEADER_SICUREZZA = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  // Dentro un <meta> `frame-ancestors` e' ignorato per specifica: e' l'unica
  // direttiva CSP che deve viaggiare come header, qui come in public/_headers.
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
};
