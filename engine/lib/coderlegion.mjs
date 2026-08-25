// engine/lib/coderlegion.mjs
// Client CoderLegion (REST API v1) per il secondo canale di sindacazione della
// writing collection, accanto a dev.to. Zero-dep: fetch nativo.
//
// NON e' un gemello di lib/devto.mjs, e la differenza e' strutturale: li'
// l'idempotenza vive nell'API (si chiede a dev.to l'elenco dei propri articoli e
// si confronta il canonical), qui non esiste niente di simile.
//   - `source_url` (il loro canonical) e' WRITE-ONLY: si manda, e nessun GET lo
//     restituisce. Misurato il 25-08-2026 su /posts/25338 — i campi tornati sono
//     id,title,content,tags,...,category, e source_url non c'e'.
//   - con chiave Personal non c'e' nessun endpoint "i miei post": /users/{handle}
//     risponde 403 "This endpoint is restricted to Master Key only", e il
//     parametro ?author= viene ignorato (/posts torna gli ultimi 20 di tutti).
//   - /posts/search e' ordinata per RILEVANZA, non e' un indice: cercando il
//     titolo esatto del post 25337, che esiste, il 25-08 non e' tornato.
//     Cosi' com'e' non e' una lookup, e usarla come tale darebbe doppioni
//     esattamente quando il feed della community e' rumoroso.
//
// Quindi il registro e' nostro (la card in edicola.json, vedi lib/edicola.mjs),
// e qui sotto c'e' la rete per la finestra in cui quel registro non e' ancora
// durevole. Vedi `cercaNelFeed`.
import { logsafe } from "./logsafe.mjs";

const API = "https://coderlegion.com/api/v1";

// Il nostro account. Non e' deducibile da nessun endpoint accessibile con chiave
// Personal (/users/{handle} e' Master Key), quindi sta scritto: e' un dato di
// configurazione, non un valore da scoprire a runtime.
export const HANDLE = "EmmeKappa23";

// `category_id` e' obbligatorio sulla create. "Articles" = 2, letto dal loro
// /posts/create-options il 25-08-2026 e non indovinato; e' anche la categoria
// dei due pezzi gia' importati a mano.
export const CATEGORIA_ARTICOLI = 2;

// coderlegion.com/<id> risponde 302 verso /<id>/<slug-dal-titolo>. Verificato
// il 25-08-2026 su 25338. L'id basta, e regge un edit del titolo: lo slug lo
// ricalcola il loro server, e una card che se lo fosse costruita da sola
// punterebbe a un URL vecchio senza che nessuno se ne accorga.
export const urlPost = (id) => `https://coderlegion.com/${id}`;

// Il limite per minuto NON e' documentato: la loro pagina dichiara 1000/ora per
// le chiavi Personal. Il 25-08-2026 cinque letture di fila hanno preso
// `429 {"status":"error","message":"Per-minute request limit reached"}`, e
// l'autore lo conferma a 15/minuto. Un limite che esiste ma non e' scritto e'
// esattamente quello che nessuno gestisce.
//
// Attese fisse a un minuto, non esponenziali: la finestra e' il minuto, quindi
// aspettare meno e' riprovare a vuoto e aspettare di piu' non serve a niente.
// `attendi` e' iniettabile solo perche' i test non devono dormire davvero.
const ATTESE_429 = [60_000, 60_000, 60_000];
// Retry-After lo sceglie l'altro, e senza tetto sceglie anche per quanto tempo
// dorme il nostro processo: `Retry-After: 2000000` sta SOTTO la soglia dei 32
// bit di setTimeout, quindi non viene clampato a 1ms — sono 23 giorni veri.
const CAP_ATTESA = 120_000;
const TIMEOUT_MS = 20_000;
// Fra una pagina e l'altra del feed: 15 richieste al minuto e' larghissimo per
// un pezzo a settimana, ma sei GET di fila sono una raffica, e il 429 l'ho gia'
// preso cosi'.
const PAUSA_PAGINE = 4_500;
// Il feed della categoria Articles scorre ~2 pagine al giorno (misurato il
// 25-08-2026: pagina 1 = oggi, pagina 6 = quattro giorni fa). Sei pagine sono
// la finestra di recupero.
// ponytail: quattro giorni. Se un run resta rotto piu' a lungo, il doppione
// torna possibile; il passo successivo e' alzare questo numero, non cambiare
// disegno.
const PAGINE_GUARDIA = 6;

const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

// Ogni richiesta esce di qui, e le tre difese stanno in un posto solo:
//  - `redirect: "error"`: un header d'autenticazione CUSTOM non e' fra quelli
//    che la spec fetch spoglia su un redirect cross-origin. Misurato il
//    25-08-2026 con due server locali: `Authorization` e `Cookie` spariscono,
//    `X-API-Key` arriva intero al secondo host. Aver scelto di fidare la chiave
//    a coderlegion.com non e' aver scelto di fidarla a chiunque lui nomini in
//    `Location`. Su una chiamata autenticata un 3xx non ha nessuna semantica
//    utile: "error" invece di "manual" lo rende visibile invece che silenzioso.
//  - `signal`: senza, il tempo massimo lo decide l'altro (un server che accetta
//    la connessione e tace tiene appeso il job di produzione).
//  - il 429, che vale per la lettura del feed quanto per la create.
async function chiamata({ url, init = {}, verbo, attendi }) {
  const { CODERLEGION_API_KEY } = process.env;
  if (!CODERLEGION_API_KEY) throw new Error("missing env: CODERLEGION_API_KEY (usa `doppler run`)");
  // L'header e' `X-API-Key`. dev.to usa `api-key`: due schemi diversi, e
  // sbagliarlo da' un 401 che sembra una chiave scaduta.
  const headers = { "X-API-Key": CODERLEGION_API_KEY, ...(init.body ? { "Content-Type": "application/json" } : {}) };

  for (let tentativo = 0; ; tentativo++) {
    const r = await fetch(url, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.ok) return r;
    // Il corpo lo scrive un terzo: nei log solo via logsafe (S5145), e con un
    // tetto — senza, un errore da 100k caratteri finisce nella issue e in Sentry.
    const corpo = logsafe(await r.text().catch(() => "")).slice(0, 500);
    if (r.status !== 429 || tentativo >= ATTESE_429.length) {
      throw new Error(`coderlegion ${verbo} ${r.status}: ${corpo}`);
    }
    const dichiarato = Number(r.headers.get("retry-after"));
    await attendi(Number.isFinite(dichiarato) && dichiarato > 0
      ? Math.min(dichiarato * 1000, CAP_ATTESA)
      : ATTESE_429[tentativo]);
  }
}

// Un id numerico in forma stringa e' la resa di default di mezzo mondo PHP, e
// CoderLegion e' un forum PHP: rifiutarla non sarebbe rigore, sarebbe buttare
// via un post gia' nato e ricrearlo domani. Zero e i negativi no: `Number.
// isInteger(0)` e' true, e produrrebbe una card verso coderlegion.com/0.
const idValido = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// LA RETE DI SICUREZZA. Il registro e' la card, ma diventa durevole solo quando
// la PR del cron viene mergiata, e fra la create e quel merge il workflow ha
// cinque uscite d'errore. Il 21-08-2026 ne ha prese due (step della generazione
// verde, step della PR rosso: quattro PR card chiuse senza merge, tre sullo
// stesso pezzo). Senza questa lettura, quel giorno avrebbe prodotto cinque post
// dello stesso articolo.
//
// Il feed ?sort=recent e' ordinato per DATA — e' questo che lo rende usabile,
// mentre /posts/search, ordinata per rilevanza, non lo e'.
// Esportata perche' e' l'unico modo di provarla dal vero senza scrivere niente:
// una guardia che si puo' solo interrogare tramite l'azione che dovrebbe
// impedire non e' verificabile. Serve anche a mano, quando si triaggia l'issue
// automatica e si vuole sapere se il post e' gia' di la'.
export async function cercaNelFeed({ title, attendi = dormi }) {
  const cercato = String(title).trim();
  for (let page = 1; page <= PAGINE_GUARDIA; page++) {
    if (page > 1) await attendi(PAUSA_PAGINE);
    const r = await chiamata({
      url: `${API}/categories/articles/posts?page=${page}&sort=recent`,
      verbo: "feed",
      attendi,
    });
    const posts = (await r.json().catch(() => null))?.data;
    // Pagine finite: continuare sarebbe traffico e rate limit sprecati.
    if (!Array.isArray(posts) || posts.length === 0) return null;
    // Il titolo da solo non basta: un omonimo di chiunque altro bloccherebbe per
    // sempre l'uscita di un nostro pezzo, che e' il guasto opposto e piu' difficile
    // da vedere del doppione.
    const mio = posts.find((p) => p?.author?.handle === HANDLE && String(p?.title ?? "").trim() === cercato);
    if (mio) return idValido(mio.id);
  }
  return null;
}

export async function creaPost({ title, body, tags, canonicalUrl, attendi = dormi }) {
  const gia = await cercaNelFeed({ title, attendi });
  if (gia) return { id: gia, url: urlPost(gia), inCoda: false, gia: true };

  const post = {
    title,
    content: body,
    format: "markdown",
    category_id: CATEGORIA_ARTICOLI,
    tags,
    // L'unica occasione per dichiarare da dove viene il pezzo: si scrive qui o
    // non si scrive mai piu' (in lettura non torna).
    source_url: canonicalUrl,
  };

  const r = await chiamata({
    url: `${API}/posts`,
    init: { method: "POST", body: JSON.stringify(post) },
    verbo: "create",
    attendi,
  });

  // Da qui in poi il post PUO' gia' esistere, e ogni errore va scritto sapendolo:
  // la reazione giusta a "c'e' ma non so leggerlo" non e' ricrearlo.
  const j = await r.json().catch(() => null);
  if (j === null) {
    throw new Error(`coderlegion create ${r.status}: corpo illeggibile — il post potrebbe esistere, controlla prima di rilanciare`);
  }
  if (j?.status !== "success") {
    throw new Error(`coderlegion create: ${logsafe(j?.message ?? "risposta senza status success").slice(0, 500)}`);
  }
  const id = idValido(j?.data?.id);
  if (!id) {
    throw new Error("coderlegion create: risposta senza id — il post potrebbe esistere, controlla prima di rilanciare");
  }
  // 202 = in coda di moderazione: il post ESISTE e ha un id, ma di la' non e'
  // ancora visibile. Il chiamante deve poterlo dire nel log.
  return { id, url: urlPost(id), inCoda: Boolean(j.queued), gia: false };
}
