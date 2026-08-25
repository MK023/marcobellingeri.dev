// engine/lib/coderlegion.mjs
// Client CoderLegion (REST API v1) per il secondo canale di sindacazione della
// writing collection, accanto a dev.to. Zero-dep: fetch nativo. Crea, e basta.
//
// Perche' non c'e' nessun upsert, a differenza di lib/devto.mjs: li' l'idempotenza
// vive nell'API (si chiede l'elenco dei propri articoli e si confronta il
// canonical), qui non esiste niente di simile, e i tre fatti sono misurati il
// 25-08-2026, non dedotti:
//   - `source_url` (il loro canonical) e' WRITE-ONLY: nessun GET lo restituisce
//     (verificato su /posts/25338);
//   - con chiave Personal non c'e' nessun endpoint "i miei post": /users/{handle}
//     risponde 403 "restricted to Master Key only", e ?author= viene ignorato;
//   - /posts/search e' ordinata per RILEVANZA: cercando il titolo esatto del post
//     25337, che esiste, non l'ha ritrovato.
//
// Quindi chi non fa doppioni e' il chiamante: la card in edicola.json e' il
// registro (vedi `nuove` in lib/edicola.mjs), e un pezzo ci entra una volta sola.
//
// ponytail: il registro diventa durevole al merge della PR del cron, e fra la
// create e quel merge il workflow puo' morire — in quel caso il giorno dopo nasce
// un doppione. Costa una `POST /posts/{id}/hide`, e l'issue automatica dice di
// controllare prima di rilanciare. La rete automatica l'ho scritta e tolta: per
// coprire quel caso serviva scandire il feed pubblico, che e' cieco ai post in
// coda di moderazione e fallisce aperto su ogni risposta inattesa — piu' difetti
// del rischio che toglieva. Se un giorno i doppioni diventassero frequenti, il
// passo successivo e' un registro durevole PRIMA della create, non una lettura.
import { logsafe } from "./logsafe.mjs";

const API = "https://coderlegion.com/api/v1";

// `category_id` e' obbligatorio sulla create. "Articles" = 2, letto dal loro
// /posts/create-options e non indovinato.
export const CATEGORIA_ARTICOLI = 2;

// coderlegion.com/<id> risponde 302 verso /<id>/<slug-dal-titolo>. Verificato su
// 25338. L'id basta, e regge un edit del titolo: lo slug lo ricalcola il loro
// server, e una card che se lo fosse costruita da sola punterebbe a un URL
// vecchio senza che nessuno se ne accorga.
export const urlPost = (id) => `https://coderlegion.com/${id}`;

// Il limite per minuto NON e' documentato (la loro pagina dichiara 1000/ora): il
// 25-08 cinque letture di fila hanno preso `429 "Per-minute request limit
// reached"`, e l'autore lo conferma a 15/minuto. Attese fisse a un minuto, non
// esponenziali: la finestra e' il minuto. `attendi` e' iniettabile solo perche' i
// test non devono dormire davvero.
const ATTESE_429 = [60_000, 60_000, 60_000];
// Retry-After lo sceglie l'altro, e senza tetto sceglierebbe anche quanto dorme
// il nostro processo: `Retry-After: 2000000` sta SOTTO la soglia dei 32 bit di
// setTimeout, quindi non viene clampato a 1ms — sono 23 giorni veri. Il tetto e'
// il fallback e non il doppio: dichiarare un'attesa non deve poter ottenere piu'
// del tacere.
const CAP_ATTESA = 60_000;
const TIMEOUT_MS = 20_000;
const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

// Un id numerico in forma stringa e' la resa di default di mezzo mondo PHP, e
// CoderLegion e' un forum PHP: rifiutarla significherebbe buttare via un post
// gia' nato. Ma solo cifre: `true`, `[5]`, `"0x10"`, `"1e3"` sono tutti valori che
// `Number()` accetterebbe e che un id non e'.
const idValido = (v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const s = String(v).trim();
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function creaPost({ title, body, tags, canonicalUrl, attendi = dormi }) {
  const { CODERLEGION_API_KEY } = process.env;
  if (!CODERLEGION_API_KEY) throw new Error("missing env: CODERLEGION_API_KEY (usa `doppler run`)");
  // L'header e' `X-API-Key`. dev.to usa `api-key`: due schemi diversi, e
  // sbagliarlo da' un 401 che sembra una chiave scaduta.
  const headers = { "X-API-Key": CODERLEGION_API_KEY, "Content-Type": "application/json" };
  const post = {
    title,
    content: body,
    format: "markdown",
    category_id: CATEGORIA_ARTICOLI,
    // "Tags - use hyphens to combine words: (upto four)" — il loro form. Stesso
    // cap di dev.to (lib/devto.mjs:159). I nostri frontmatter ne hanno al massimo
    // quattro, ma il cap sta qui perche' il quinto non lo scopra la produzione.
    tags: tags.slice(0, 4),
    // L'unica occasione per dichiarare da dove viene il pezzo: si scrive qui o
    // non si scrive mai piu' (in lettura non torna).
    source_url: canonicalUrl,
  };

  for (let tentativo = 0; ; tentativo++) {
    const r = await fetch(`${API}/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify(post),
      // Un header d'autenticazione CUSTOM non e' fra quelli che la spec fetch
      // spoglia su un redirect cross-origin. Misurato il 25-08 con due server
      // locali: `Authorization` e `Cookie` spariscono, `X-API-Key` arriva intero
      // al secondo host. Aver scelto di fidare la chiave a coderlegion.com non e'
      // aver scelto di fidarla a chiunque lui nomini in `Location`. Su una POST
      // autenticata un 3xx non ha nessuna semantica utile: "error" e non
      // "manual", cosi' e' visibile invece che silenzioso.
      redirect: "error",
      // Senza, il tempo massimo lo decide l'altro: un server che accetta la
      // connessione e tace tiene appeso il job. Nuovo a ogni tentativo.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (r.ok) {
      // Da qui in poi il post PUO' gia' esistere, e ogni errore va scritto
      // sapendolo: la reazione giusta a "c'e' ma non so leggerlo" non e' ricrearlo.
      const j = await r.json().catch(() => null);
      if (j === null) {
        throw new Error(`coderlegion create ${r.status}: corpo illeggibile — il post potrebbe esistere, controlla prima di rilanciare`);
      }
      if (j.status !== "success") {
        throw new Error(`coderlegion create: ${logsafe(j.message ?? "risposta senza status success").slice(0, 500)}`);
      }
      const id = idValido(j.data?.id);
      if (!id) {
        throw new Error("coderlegion create: risposta senza id — il post potrebbe esistere, controlla prima di rilanciare");
      }
      // 202 = in coda di moderazione: il post ESISTE e ha un id, ma di la' non e'
      // ancora visibile. Il chiamante deve poterlo dire nel log.
      return { id, url: urlPost(id), inCoda: Boolean(j.queued) };
    }

    // Il corpo lo scrive un terzo: nei log solo via logsafe (S5145, un a-capo
    // dentro il dato fabbrica righe di log false), e con un tetto.
    const corpo = logsafe(await r.text().catch(() => "")).slice(0, 500);
    if (r.status !== 429 || tentativo >= ATTESE_429.length) {
      throw new Error(`coderlegion create ${r.status}: ${corpo}`);
    }
    const dichiarato = Number(r.headers.get("retry-after"));
    await attendi(Number.isFinite(dichiarato) && dichiarato > 0
      ? Math.min(dichiarato * 1000, CAP_ATTESA)
      : ATTESE_429[tentativo]);
  }
}
