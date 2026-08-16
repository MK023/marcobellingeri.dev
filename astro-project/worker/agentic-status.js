// /api/agentic-status — i tre numeri pubblici dell'hub Agentic OS (sessioni,
// token, costo di oggi). Il browser chiama same-origin: la CSP resta intatta e
// le credenziali Access non lasciano mai l'edge.
//
// L'hub gira su Railway dietro un Cloudflare Tunnel (il VPS è morto il
// 2026-07-29) ed è un esperimento che può venire spento: il fallimento è
// NORMALE, non eccezionale. Fail-open a campi `null` — il widget mostra "—",
// la pagina non se ne accorge, mai un 500 al visitatore.
//
// Due credenziali, non una: Cloudflare Access lascia passare la richiesta
// (CF-Access-Client-*), la status API ha comunque il SUO token (Authorization).
// Toglierne una lascerebbe l'endpoint appeso a un solo strato.
import { HEADER_SICUREZZA } from './headers.js';

const segnala = (messaggio, extra) => globalThis.__SEGNALA_SENTRY__?.(messaggio, extra);

const TIMEOUT_MS = 5000;

// Ultimo valore buono. Il 13/08 due riavvii di Prometheus di pochi minuti hanno
// fatto mostrare "—" al widget: un riavvio di un servizio interno non dovrebbe
// essere visibile su una pagina pubblica. "Numeri di qualche minuto fa" è molto
// meglio di un trattino, purché sia DICHIARATO che sono vecchi.
//
// Cache API e non KV di proposito: `caches.default` esiste già nel runtime, non
// serve creare un namespace né aggiungere un binding — nessuna infrastruttura
// nuova. In cambio è per-colo e volatile, il che qui va benissimo: serve a
// coprire minuti, non giorni.
//
// Chiave sintetica: non è una URL che esista, è solo l'indirizzo sotto cui la
// Cache API accetta di tenere un oggetto nostro.
const CHIAVE_ULTIMO_BUONO = 'https://agentic-os.interno/ultimo-valore-buono';

// La richiesta che la sonda passa all'handler. Non viene mai spedita: serve solo
// perche' la firma la vuole, e perche' l'handler ne legge il metodo. `new Request`
// senza opzioni e' una GET, quindi la sonda passa la guardia sul metodo — se un
// giorno diventasse altro, la sonda si vedrebbe rispondere 405 da se stessa.
const CHIAVE_SONDA = 'https://agentic-os.interno/sonda';

// Oltre l'ora non si serve più. "Qualche minuto fa" è un'informazione utile,
// "stamattina" presentata come stato attuale è una bugia — e il trattino, che è
// onesto, torna a essere la risposta giusta.
const ETA_MASSIMA_MS = 60 * 60 * 1000;

const cacheDisponibile = () => globalThis.caches?.default;

const rispostaVuota = () =>
  new Response(JSON.stringify({ sessionsToday: null, tokensToday: null, costUsdToday: null }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...HEADER_SICUREZZA,
      // niente cache sul degradato: l'hub può tornare su tra un minuto
      'Cache-Control': 'no-store',
    },
  });

// Il degradato prova prima a rispondere con l'ultimo valore buono, e solo se non
// ce n'è uno abbastanza recente ricade sui null. Non lancia mai: qualunque cosa
// vada storta qui dentro deve ridurlo al comportamento di prima, perché questo è
// già il ramo del fallimento e non può avere un fallimento suo.
async function rispostaDegradata() {
  const cache = cacheDisponibile();
  if (!cache) return rispostaVuota();

  try {
    const salvata = await cache.match(new Request(CHIAVE_ULTIMO_BUONO));
    if (!salvata) return rispostaVuota();

    const { salvatoIl, ...numeri } = await salvata.json();
    const etaMs = Date.now() - salvatoIl;
    if (!Number.isFinite(etaMs) || etaMs < 0 || etaMs > ETA_MASSIMA_MS) return rispostaVuota();

    return new Response(
      JSON.stringify({ ...numeri, stale: true, ageSeconds: Math.round(etaMs / 1000) }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...HEADER_SICUREZZA,
          // Come il vuoto: l'hub può tornare su tra un minuto, e un numero vecchio
          // messo in cache al bordo diventerebbe vecchio due volte.
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch {
    return rispostaVuota();
  }
}

// Salvare non deve poter rompere la risposta buona: se la cache non accetta
// l'oggetto, il visitatore ha comunque i suoi numeri freschi.
async function salvaUltimoBuono(numeri) {
  const cache = cacheDisponibile();
  if (!cache) return;
  try {
    await cache.put(
      new Request(CHIAVE_ULTIMO_BUONO),
      new Response(JSON.stringify({ ...numeri, salvatoIl: Date.now() }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // La Cache API rifiuta di conservare una risposta `no-store`, e questa
          // copia esiste apposta per essere conservata. Il max-age fa da secondo
          // limite oltre a ETA_MASSIMA_MS, dal lato della cache invece che dal
          // nostro: la voce scade da sola anche se nessuno la rilegge.
          'Cache-Control': 'max-age=3600',
        },
      }),
    );
  } catch {
    // Deliberatamente muto: è un'ottimizzazione del degrado, non un requisito.
  }
}

// Sonda schedulata (Cloudflare Cron Trigger, vedi `triggers` in wrangler.jsonc).
//
// Esiste perche' l'altra sonda, `smoke.yml` nel repo agentic-os, gira su GitHub
// Actions: CHIEDE `*/10` e misurato ne fa ~55, perche' GitHub strozza i cron
// frequenti sui repo pubblici. Un disservizio di due minuti — come i due del
// 13/08 — le passa sotto. Questa sta sul bordo e non viene strozzata.
//
// **Non aggiunge logica, aggiunge un innesco.** `gestisciAgenticStatus` segnala
// gia' a Sentry quando l'hub non risponde; finora quel codice girava solo se
// passava un visitatore. Alle 4 del mattino non passa nessuno, ed e' esattamente
// quando l'hub si rompe senza testimoni. Riusare lo stesso percorso invece di
// scriverne uno parallelo significa anche che la sonda misura CIO' CHE VEDE IL
// VISITATORE, non una strada gemella che puo' divergere in silenzio.
//
// Nessuna richiesta HTTP verso noi stessi: si chiama la funzione, non la rotta.
export async function sondaHub(env) {
  const risposta = await gestisciAgenticStatus(new Request(CHIAVE_SONDA), env);
  const dati = await risposta.json();

  // Due modi di essere degradati, e il secondo e' quello che inganna: `null`
  // significa "non ho potuto leggere l'hub", ma `stale` significa "l'hub e' giu'
  // e sto servendo numeri vecchi" — tre campi PIENI, di valori veri. Guardare
  // solo i null direbbe "tutto bene" per un'ora intera.
  const degradato = dati.sessionsToday === null || dati.stale === true;

  // Log strutturato, ed e' l'UNICA traccia che un run sano lascia. Vale la pena
  // sapere perche': @sentry/cloudflare crea uno span `faas.cron` per ogni
  // invocazione, ma il `tracesSampler` in worker/sentry.js campiona solo
  // `/api/contact` e restituisce 0 per tutto il resto — quindi quello span viene
  // scartato, di proposito, e in Sentry di un run riuscito non resta niente.
  // Alzare il campionamento qui costerebbe ~21.000 span al mese di quota tracing
  // per informazione che nessuno leggerebbe.
  //
  // Quindi: il fallimento va a Sentry come evento (lo manda gia'
  // `gestisciAgenticStatus`), il successo resta in Workers Logs, dove
  // `observability: enabled` in wrangler.jsonc lo raccoglie. Si logga anche
  // quando va bene perche' un run che non lascia traccia non distingue "sano" da
  // "non sono mai partito".
  console.log(JSON.stringify({
    sonda: 'agentic-os',
    degradato,
    stale: dati.stale === true,
    eta_s: dati.ageSeconds ?? null,
  }));

  return degradato;
}

export async function gestisciAgenticStatus(request, env) {
  // Rotta di sola lettura: un DELETE che risponde 200 racconta a un client che la
  // cancellazione e' riuscita. Non muta niente — non c'e' codice di scrittura da
  // raggiungere — ma e' semantica HTTP sbagliata su un endpoint pubblico, cioe' il
  // tipo di dettaglio che genera bug a valle invece che qui. Stessa forma di
  // `gestisciRadar`. `Allow` non e' decorativo: senza, il 405 non dice cosa usare.
  if (request.method !== 'GET') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET', ...HEADER_SICUREZZA },
    });
  }

  if (!env.AGENTIC_OS_STATUS_URL) return rispostaVuota();

  try {
    const upstream = await fetch(env.AGENTIC_OS_STATUS_URL, {
      headers: {
        'CF-Access-Client-Id': env.AGENTIC_OS_ACCESS_CLIENT_ID ?? '',
        'CF-Access-Client-Secret': env.AGENTIC_OS_ACCESS_CLIENT_SECRET ?? '',
        Authorization: `Bearer ${env.AGENTIC_OS_STATUS_TOKEN ?? ''}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!upstream.ok) {
      // Lo stato sì (è nostro), il corpo upstream no: mai messaggi altrui nei log (S5145).
      segnala('agentic-os: hub non disponibile', { stato: upstream.status });
      return await rispostaDegradata();
    }

    const dati = await upstream.json();
    const numeri = {
      sessionsToday: dati.sessions_today,
      tokensToday: dati.tokens_today,
      costUsdToday: dati.cost_usd_today,
    };
    await salvaUltimoBuono(numeri);

    return new Response(
      JSON.stringify(numeri),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...HEADER_SICUREZZA,
          // 30s: "quasi in tempo reale" davvero, senza bussare all'hub a ogni visita.
          'Cache-Control': 'public, max-age=30, s-maxage=30',
        },
      },
    );
  } catch {
    segnala('agentic-os: hub irraggiungibile');
    return await rispostaDegradata();
  }
}
