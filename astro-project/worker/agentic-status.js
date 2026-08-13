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
      'X-Content-Type-Options': 'nosniff',
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
          'X-Content-Type-Options': 'nosniff',
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

export async function gestisciAgenticStatus(_request, env) {
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
          'X-Content-Type-Options': 'nosniff',
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
