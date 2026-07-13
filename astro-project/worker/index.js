// Worker davanti agli asset statici, per la sola root `/` (vedi run_worker_first
// in wrangler.jsonc). Tutto il resto lo serve l'Asset Worker senza passare di qui.
//
// ADR-0001 §4: la scelta della lingua su `/` è demandata all'edge.
// Italia → italiano, resto del mondo → inglese. Il paese lo dà Cloudflare in
// `request.cf.country`, già risolto dall'IP: nessuna libreria, nessun database.

/**
 * La scelta manuale vince sempre sul paese: chi vive in Italia e clicca «EN» non
 * deve ritrovarsi in italiano ogni volta che passa dalla root. Il cookie lo scrive
 * il selettore lingua in UtilityBar.astro.
 * @param {string | undefined} paese - codice ISO 3166-1 alpha-2, da request.cf.country
 * @param {string | null} cookie - header Cookie grezzo
 * @returns {'it' | 'en'}
 */
export function scegliLingua(paese, cookie = null) {
  const scelta = cookie?.match(/(?:^|;\s*)pref-lang=(it|en)(?:;|$)/)?.[1];
  if (scelta) return /** @type {'it' | 'en'} */ (scelta);
  return paese === 'IT' ? 'it' : 'en';
}

// public/_headers copre solo gli asset statici: le risposte generate dal Worker
// (JSON dell'API, 302 sulla root) non ci passano e vanno messe a mano. Valore
// allineato a public/_headers, che resta la fonte di verità per gli asset.
const HSTS = 'max-age=63072000; includeSubDomains; preload';

const rispostaJson = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': HSTS,
    },
  });

// Per testo destinato a header email (subject): via i caratteri di controllo —
// un nome con \r\n diventerebbe header injection nella mail.
const rigaPulita = (s, max) =>
  String(s ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max);

// Il wrapper di produzione (worker/sentry.js) registra qui il reporter: così
// index.js resta puro (niente SDK negli import) e i test girano senza Sentry.
// I fallimenti GESTITI (Resend giù, config mancante) altrimenti non arriverebbero
// mai a Sentry: withSentry vede solo le eccezioni non catturate.
const segnala = (messaggio, extra) => globalThis.__SEGNALA_SENTRY__?.(messaggio, extra);

// Legge il body con un tetto REALE di byte, senza fidarsi di Content-Length: è un
// header client, assente o mentito (Transfer-Encoding: chunked) aggirerebbe il cap.
// Si legge lo stream e si interrompe appena supera il limite, così un payload
// arbitrario non viene mai bufferizzato per intero. Ritorna il testo, o null se
// troppo grande.
async function leggiBodyLimitato(request, maxBytes) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parti = [];
  let totale = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totale += value.byteLength;
    if (totale > maxBytes) {
      await reader.cancel();
      return null;
    }
    parti.push(value);
  }
  return new TextDecoder().decode(await new Blob(parti).arrayBuffer());
}

/**
 * Endpoint del form di contatto (POST /api/contact): valida, filtra i bot con
 * honeypot e inoltra via Resend alla casella di Marco. Il `from` è il sottodominio
 * verificato in Resend (l'apex resta -all, non fa posta); `reply_to` è l'email del
 * visitatore, così si risponde diretto dalla Proton.
 * @param {Request} request
 * @param {{ RESEND_API_KEY?: string }} env
 * @returns {Promise<Response>}
 */
export async function gestisciContatto(request, env) {
  if (request.method !== 'POST') return rispostaJson({ error: 'method' }, 405);

  // Rate limit per IP (binding CONTACT_LIMITER): ~5/min, ma APPROSSIMATIVO e
  // per-location per design di Cloudflare — il contatore è locale a ogni isolate
  // ed è "eventually consistent, intentionally not accurate". Non è una ghigliottina
  // al 6° colpo: ferma il flood vero (volume sostenuto), non il singolo burst.
  // Il binding manca nei test e in `wrangler dev` senza supporto: si salta.
  if (env.CONTACT_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'sconosciuto';
    const { success } = await env.CONTACT_LIMITER.limit({ key: ip });
    if (!success) return rispostaJson({ error: 'rate' }, 429);
  }

  // Difesa in profondità: il form vive solo sul nostro dominio. Un Origin diverso
  // è una richiesta forgiata da un altro sito. (curl senza Origin passa di qui,
  // ma lo ferma comunque Turnstile: il token è legato al nostro hostname.)
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'https://marcobellingeri.dev') return rispostaJson({ error: 'origin' }, 403);

  // Cap REALE sul body PRIMA di parsarlo: un JSON enorme è CPU/memoria bruciata
  // (OWASP API4 — Unrestricted Resource Consumption). Si misura sui byte letti,
  // non su Content-Length, che un client può omettere o gonfiare. I campi
  // legittimi stanno larghi in 32 KB.
  const grezzo = await leggiBodyLimitato(request, 32768);
  if (grezzo === null) return rispostaJson({ error: 'too-large' }, 413);

  let dati;
  try { dati = JSON.parse(grezzo); } catch { return rispostaJson({ error: 'body' }, 400); }

  // Honeypot: campo nascosto che un umano non vede né compila. Se è pieno è un bot:
  // si finge successo e non si manda nulla, così non impara a evitarlo.
  if (typeof dati.azienda === 'string' && dati.azienda.trim()) return rispostaJson({ ok: true });

  // Validazione al confine di fiducia: mai passare input grezzo oltre. Lunghezze
  // limitate per non trasformare il form in un amplificatore di abuso.
  // rigaPulita: il nome finisce nel SUBJECT della mail — un \r\n dentro sarebbe
  // header injection. Via ogni carattere di controllo.
  const nome = rigaPulita(dati.nome, 120);
  const email = String(dati.email ?? '').trim().slice(0, 200);
  const brief = String(dati.brief ?? '').trim().slice(0, 4000);
  // Le etichette del dominio escludono il punto: così il `.` lo può piazzare solo
  // il separatore, e il matching non torna indietro a provare ogni spezzatura.
  if (!/^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/.test(email) || brief.length < 10) {
    return rispostaJson({ error: 'invalid' }, 422);
  }

  // Turnstile: se il secret è configurato, il token del widget dev'essere valido.
  // Verifica server-side contro Cloudflare (mai dal browser). Difesa oltre l'honeypot.
  // Fail-open CON allarme: senza secret la verifica bot si spegne, ma in produzione
  // è una regressione di config (secret sparito da Doppler, binding rinominato) che
  // deve arrivare a Sentry — altrimenti il form resterebbe scoperto in silenzio. In
  // locale/test `segnala` è un no-op (nessun reporter registrato), quindi non rumoreggia.
  if (env.TURNSTILE_SECRET_KEY) {
    const verifica = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: String(dati.turnstile ?? '') }),
    });
    const esito = await verifica.json().catch(() => ({ success: false }));
    if (!esito.success) return rispostaJson({ error: 'turnstile' }, 403);
  } else {
    segnala('contact: TURNSTILE_SECRET_KEY mancante — verifica bot disattivata (fail-open)');
  }

  if (!env.RESEND_API_KEY) {
    // Regressione di configurazione, non azione utente: Sentry deve saperlo.
    segnala('contact: RESEND_API_KEY mancante in produzione');
    return rispostaJson({ error: 'unconfigured' }, 503);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Contatti marcobellingeri.dev <form@send.marcobellingeri.dev>',
      to: ['mkdevpy@proton.me'],
      reply_to: email,
      subject: `Nuovo contatto dal sito${nome ? ' — ' + nome : ''}`,
      text: `Da: ${nome || '(senza nome)'} <${email}>\n\n${brief}`,
    }),
  });
  if (!res.ok) {
    // Fallimento GESTITO: senza questa segnalazione Sentry non lo vedrebbe mai
    // (withSentry cattura solo le eccezioni non gestite). Niente PII nell'extra.
    segnala('contact: Resend ha risposto ' + res.status, { status: res.status });
    return rispostaJson({ error: 'send' }, 502);
  }
  return rispostaJson({ ok: true });
}

export default {
  /**
   * @param {Request & { cf?: { country?: string } }} request
   * @param {{ ASSETS: { fetch: (r: Request) => Promise<Response> } }} env
   */
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact') return gestisciContatto(request, env);
    if (url.pathname !== '/') return env.ASSETS.fetch(request);

    const lingua = scegliLingua(request.cf?.country, request.headers.get('cookie'));
    const destinazione = new URL(`/${lingua}/`, url.origin);
    destinazione.search = url.search;

    // 302 e non 301: la destinazione dipende da chi chiede, non dall'URL. Un 301
    // resterebbe nella cache del browser e inchioderebbe quel visitatore a una
    // lingua per sempre, anche viaggiando. `no-store` tiene fuori le cache intermedie,
    // che altrimenti servirebbero a un americano il redirect di un italiano.
    return new Response(null, {
      status: 302,
      headers: {
        Location: destinazione.toString(),
        'Cache-Control': 'no-store',
        'Strict-Transport-Security': HSTS,
      },
    });
  },
};
