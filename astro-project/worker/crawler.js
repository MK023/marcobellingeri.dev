// Chi passa di qui: umani o crawler, contati per famiglia.
//
// Il piano free di Cloudflare non separa umani da bot, e su questo sito i crawler
// IA sono aperti tutti per scelta dichiarata (training incluso). Finche' non si
// contano, un numero di pageview non si puo' mostrare a nessuno: dentro c'e' una
// quota di crawler che non si sa quantificare.
//
// Due domande diverse dallo stesso dato: quanto traffico umano c'e' davvero, e se
// i crawler IA leggono davvero il sito. La seconda conta piu' della prima per
// l'AEO: se GPTBot non arriva mai, nessun lavoro sul contenuto cambiera' la
// risposta di ChatGPT, e conviene saperlo prima di riscrivere gli articoli.

// Ordine significativo: la prima famiglia che combacia vince. `chatgpt-user` sta
// prima di ogni regola generica perche' e' l'unica che dice "una persona sta
// leggendo il sito adesso, tramite ChatGPT" — confonderlo con GPTBot, che
// addestra e basta, cancella proprio la differenza che interessa.
const FAMIGLIE = [
  ['chatgpt-user', 'chatgpt-user'],
  ['oai-searchbot', 'oai-searchbot'],
  ['gptbot', 'gptbot'],
  ['claude-user', 'claude-user'],
  ['claude-searchbot', 'claude-searchbot'],
  ['claudebot', 'claudebot'],
  ['anthropic-ai', 'claudebot'],
  ['perplexity-user', 'perplexity-user'],
  ['perplexitybot', 'perplexitybot'],
  ['google-extended', 'google-extended'],
  ['googlebot', 'googlebot'],
  ['bingbot', 'bingbot'],
  ['applebot', 'applebot'],
  ['amazonbot', 'amazonbot'],
  ['bytespider', 'bytespider'],
  ['ccbot', 'ccbot'],
  ['meta-externalagent', 'meta-externalagent'],
];

// Un browser vero manda sempre "Mozilla/5.0" seguito da un motore di rendering.
// Non e' una prova d'identita' (un UA si scrive come si vuole) ed e' inutile che
// lo sia: qui non si autorizza niente, si conta.
const MOTORI = /(gecko|webkit|trident|presto)/;
// Un client che si DICHIARA automatico. Fuori `http` e `java`: colpivano browser
// veri (un proxy aziendale che appende `(+http://intra.example)` all'UA bastava a
// far passare una persona per crawler), e i client che contano davvero sono gia'
// coperti per nome.
const SEGNI_BOT = /(bot|crawl|spider|scrape|curl|wget|python|axios|okhttp|go-http|headless)/;

// Cap sui campi scritti nel dataset: un UA lo scrive il chiamante, e senza un
// limite una richiesta sola si mangia il budget di un data point.
const MAX_CAMPO = 256;
const MAX_TOKEN = 64;
const taglia = (s, max = MAX_CAMPO) => String(s ?? '').slice(0, max);

// Il token di prodotto: `QualcosaBot/0.1` da `QualcosaBot/0.1 (Macintosh; ...)`.
// Basta per riconoscere una famiglia nuova, e lascia fuori tutto il resto — che
// e' esattamente la parte che descrive una macchina e chi ci sta davanti.
//
// La lista bianca di caratteri e' l'unica difesa che vale: oggi questo dato non
// ha nessun consumatore, e il giorno in cui il conteggio finisce in una pagina
// chi la scrive vedra' una colonna di analytics, non un input non fidato. Si
// sanifica dove si scrive, cosi' non c'e' niente da ricordarsi dove si legge.
const tokenProdotto = (ua) =>
  taglia(String(ua ?? '').trim().split(/[\s(;]/)[0].replace(/[^A-Za-z0-9._/+-]/g, ''), MAX_TOKEN);

/**
 * La famiglia di chi sta chiedendo, dal solo user-agent.
 * @param {string | null | undefined} ua - header User-Agent grezzo
 * @returns {string} famiglia nota, `umano`, `bot-ignoto` (si dichiara), o `non-classificato`
 */
export function classifica(ua) {
  // Un browser manda sempre un UA: l'assenza e' gia' una risposta, ma dice solo
  // "non e' un browser", non "e' un bot".
  if (!ua || typeof ua !== 'string') return 'non-classificato';
  const s = ua.toLowerCase();

  for (const [ago, famiglia] of FAMIGLIE) {
    if (s.includes(ago)) return famiglia;
  }
  // Prima il browser, poi il bot: un UA di browser che si porta dentro un URL o
  // il nome di una libreria resta un browser. Le famiglie note sono gia' passate
  // sopra, quindi nessun crawler conosciuto puo' cadere qui.
  if (s.startsWith('mozilla/') && MOTORI.test(s)) return 'umano';
  if (SEGNI_BOT.test(s)) return 'bot-ignoto';
  // Ne' un browser noto ne' un bot dichiarato. Non e' "bot": e' "non lo so", e
  // tenerlo distinto serve due volte. Qui dentro puo' esserci una persona con un
  // client insolito, e va trattata come tale. E il numero che finisce davanti a
  // un cliente non deve spacciare un dubbio per una certezza.
  return 'non-classificato';
}

/**
 * Il data point da scrivere, gia' tagliato e con i campi in ordine fisso
 * (il dataset richiede lo stesso ordine a ogni scrittura).
 *
 * Privacy, per gradi. Di una persona non si conserva niente dello user-agent: e'
 * fingerprintabile e non serve a nessuna delle due domande. Di una famiglia nota
 * nemmeno, perche' il nome la identifica gia'. Di chi non si e' dichiarato
 * (`non-classificato`) neanche, perche' li' dentro puo' esserci una persona con
 * un client insolito. Resta il solo `bot-ignoto`, che si e' dichiarato bot da
 * se': di lui si tiene il minimo utile a riconoscere una famiglia nuova, il
 * token di prodotto, non la stringa intera.
 *
 * Lo user-agent completo non viene mai scritto. La ritenzione la fissa la
 * piattaforma: tre mesi.
 *
 * @param {string | null | undefined} ua
 * @param {string} percorso - pathname della richiesta
 * @param {string | undefined} paese - request.cf.country
 * @returns {{ blobs: string[], indexes: string[] }}
 */
export function datoDaScrivere(ua, percorso, paese) {
  const famiglia = classifica(ua);
  // Ordine fisso: il dataset vuole gli stessi campi nella stessa posizione a
  // ogni scrittura, quindi il quarto blob c'e' sempre, vuoto quando non serve.
  const token = famiglia === 'bot-ignoto' ? tokenProdotto(ua) : '';
  return {
    blobs: [famiglia, taglia(percorso), taglia(paese || 'sconosciuto'), token],
    indexes: [famiglia],
  };
}

/**
 * Scrive il passaggio nel dataset. Fail-open: senza il binding (dev locale, o
 * un deploy in cui manca) il sito serve la pagina lo stesso — un contatore non
 * vale una pagina bianca. `writeDataPoint` non restituisce una promise: torna
 * subito e il runtime scrive in background.
 *
 * @param {{ CRAWLERS?: { writeDataPoint: (d: object) => void } }} env
 * @param {Request & { cf?: { country?: string } }} request
 */
export function conta(env, request) {
  if (!env?.CRAWLERS) return;
  try {
    const { pathname } = new URL(request.url);
    env.CRAWLERS.writeDataPoint(
      datoDaScrivere(request.headers.get('user-agent'), pathname, request.cf?.country),
    );
  } catch (e) {
    // Il contatore non e' il servizio: qualunque cosa vada storta qui, la pagina
    // esce comunque. Ma fail-open MUTO vuol dire zero passaggi per settimane
    // senza accorgersene: il resto del Worker segnala e prosegue, e questo fa
    // uguale. Fuori dal `catch` sta il ramo `!env.CRAWLERS`, che e' il caso
    // legittimo dei test e del dev locale, non un guasto.
    globalThis.__SEGNALA_SENTRY__?.('crawler: conteggio fallito', { errore: String(e?.message ?? e) });
  }
}
