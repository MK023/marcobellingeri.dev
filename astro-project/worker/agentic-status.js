// /api/agentic-status — i tre numeri pubblici dell'hub Agentic OS (sessioni,
// token, costo di oggi). Il browser chiama same-origin: la CSP resta intatta e
// le credenziali Access non lasciano mai l'edge.
//
// L'hub è un VPS che può non esserci (esperimento a mesi, `terraform destroy`
// previsto): il fallimento è NORMALE, non eccezionale. Fail-open a campi `null`
// — il widget mostra "—", la pagina non se ne accorge, mai un 500 al visitatore.
//
// Due credenziali, non una: Cloudflare Access lascia passare la richiesta
// (CF-Access-Client-*), la status API ha comunque il SUO token (Authorization).
// Toglierne una lascerebbe l'endpoint appeso a un solo strato.
const segnala = (messaggio, extra) => globalThis.__SEGNALA_SENTRY__?.(messaggio, extra);

const TIMEOUT_MS = 5000;

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
      return rispostaVuota();
    }

    const dati = await upstream.json();
    return new Response(
      JSON.stringify({
        sessionsToday: dati.sessions_today,
        tokensToday: dati.tokens_today,
        costUsdToday: dati.cost_usd_today,
      }),
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
    return rispostaVuota();
  }
}
