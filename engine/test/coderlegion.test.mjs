// Unit del client CoderLegion (lib/coderlegion.mjs).
// Stub di fetch globale con cattura delle richieste, zero rete.
import { test, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { creaPost, urlPost, HANDLE, CATEGORIA_ARTICOLI } from "../lib/coderlegion.mjs";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url), method: (init.method ?? "GET").toUpperCase(),
      headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null,
      redirect: init.redirect, signal: init.signal,
    };
    calls.push(call);
    return handler(call);
  };
  return calls;
}
const okJson = (body, status = 200) => new Response(JSON.stringify(body), { status });
const creato = (id) => okJson({ status: "success", queued: false, data: { id } }, 201);
// Il feed recente della categoria Articles: `data` vuoto = pagine finite.
const feed = (posts) => okJson({ status: "success", data: posts, page: 1, page_size: 20 });
// GET e POST vanno separati: da quando c'è la guardia, ogni create è preceduta
// dalla scansione del feed, e un handler unico risponderebbe a entrambi.
const router = ({ get = () => feed([]), post = () => creato(101) }) =>
  (c) => (c.method === "POST" ? post(c) : get(c));

const PEZZO = {
  title: "A hash-based CSP has no room for a syntax highlighter",
  body: "Body del pezzo.",
  tags: ["security", "astro", "webdev", "css"],
  canonicalUrl: "https://marcobellingeri.dev/en/writing/csp-hash-no-highlighter/",
  // Nei test non si dorme davvero: la pausa fra le pagine del feed è reale.
  attendi: async () => {},
};
const soloPost = (calls) => calls.filter((c) => c.method === "POST");

// L'id da solo basta: coderlegion.com/<id> risponde 302 verso la forma con lo
// slug. Misurato il 25-08-2026 su 25338. Quindi la card non deve indovinare uno
// slug che il loro server calcola dal titolo — e che cambierebbe con un edit.
test("urlPost: l'id basta a fare un URL stabile, senza indovinare lo slug", () => {
  assert.equal(urlPost(25338), "https://coderlegion.com/25338");
});

test("creaPost: senza CODERLEGION_API_KEY -> throw prima di ogni fetch", async () => {
  const prev = process.env.CODERLEGION_API_KEY;
  delete process.env.CODERLEGION_API_KEY;
  globalThis.fetch = async () => { throw new Error("non deve uscire nessuna richiesta"); };
  try {
    await assert.rejects(() => creaPost(PEZZO), /missing env: CODERLEGION_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.CODERLEGION_API_KEY = prev;
  }
});

test("creaPost: POST /posts con X-API-Key e il corpo che l'API dichiara", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  const calls = stubFetch(router({}));
  const r = await creaPost(PEZZO);

  assert.equal(r.id, 101);
  assert.equal(r.url, "https://coderlegion.com/101");
  assert.equal(r.gia, false, "creato adesso, non ritrovato");
  const c = soloPost(calls)[0];
  assert.equal(c.url, "https://coderlegion.com/api/v1/posts");
  // L'header e' `X-API-Key`, non `api-key`: dev.to e CoderLegion NON hanno lo
  // stesso schema, e copiare il client sbagliato darebbe un 401 opaco.
  assert.equal(c.headers["X-API-Key"], "k");
  assert.equal(c.body.title, PEZZO.title);
  assert.equal(c.body.content, PEZZO.body, "il markdown va in `content`, non in `body_markdown`");
  assert.equal(c.body.format, "markdown");
  // Letterale, NON la costante importata: un test che confronta la costante con
  // se stessa non distingue 2 da 3, cioe' non verifica il solo fatto che il
  // commento di quella costante si e' preso la briga di andare a misurare.
  assert.equal(c.body.category_id, 2);
  assert.equal(CATEGORIA_ARTICOLI, 2);
  assert.deepEqual(c.body.tags, PEZZO.tags);
  // `source_url` e' il loro canonical. E' write-only (nessun GET lo restituisce,
  // misurato su /posts/25338), quindi e' l'unica occasione per dichiararlo.
  assert.equal(c.body.source_url, PEZZO.canonicalUrl);
});

// Un header d'autenticazione custom NON e' fra quelli che la spec fetch spoglia
// su un redirect cross-origin: `Authorization` e `Cookie` spariscono, `X-API-Key`
// no. Misurato il 25-08-2026 con due server su 127.0.0.1: la chiave e' arrivata
// intera al secondo host. Chi controlla cosa risponde coderlegion.com sceglie
// quindi a chi regalarla, e noi non ce ne accorgeremmo.
// Su un POST autenticato un 3xx non ha nessuna semantica utile: "error" invece
// di "manual" perche' cosi' diventa visibile invece che silenzioso.
test("creaPost: ogni richiesta rifiuta i redirect e ha un timeout", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  const calls = stubFetch(router({}));
  await creaPost(PEZZO);
  for (const c of calls) {
    assert.equal(c.redirect, "error", `redirect da seguire su ${c.method} ${c.url}`);
    assert.ok(c.signal, `nessun timeout su ${c.method} ${c.url}: il tempo lo deciderebbe l'altro`);
  }
});

// LA GUARDIA. Il registro vero e' la card in edicola.json, ma diventa durevole
// solo quando la PR del cron viene mergiata — e fra la create e quel merge il
// workflow ha cinque uscite d'errore. Il 21-08-2026 ne ha prese due: step della
// generazione verde, step della PR rosso, quattro PR card chiuse senza merge.
// Con la sola card come registro, quel giorno avrebbe fatto cinque post dello
// stesso pezzo.
//
// Il feed /categories/articles/posts?sort=recent e' ordinato per DATA (non per
// rilevanza come /posts/search, che il 25-08 non ha ritrovato il post 25337 che
// pure esiste). Scorre ~2 pagine al giorno: sei pagine coprono ~4 giorni.
test("creaPost: il pezzo c'e' gia' nel feed recente -> nessuna create, ritorna l'id trovato", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  const calls = stubFetch(router({
    get: () => feed([
      { id: 999, title: "Altro pezzo", author: { handle: HANDLE } },
      { id: 25400, title: PEZZO.title, author: { handle: HANDLE } },
    ]),
    post: () => { throw new Error("non deve partire nessuna create"); },
  }));
  const r = await creaPost(PEZZO);
  assert.equal(r.id, 25400);
  assert.equal(r.gia, true);
  assert.equal(soloPost(calls).length, 0, "trovato = non si ricrea");
});

// La discriminante: se bastasse il titolo, un omonimo di chiunque altro
// bloccherebbe per sempre l'uscita di un nostro pezzo — un guasto silenzioso
// nella direzione opposta, e piu' difficile da vedere del doppione.
test("creaPost: stesso titolo ma di un altro autore -> non conta, si crea", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  const calls = stubFetch(router({
    get: (c) => (c.url.includes("page=1")
      ? feed([{ id: 555, title: PEZZO.title, author: { handle: "qualcunaltro" } }])
      : feed([])),
  }));
  const r = await creaPost(PEZZO);
  assert.equal(r.gia, false);
  assert.equal(soloPost(calls).length, 1);
});

test("creaPost: la scansione si ferma alla prima pagina vuota, non pagina a vuoto", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  const calls = stubFetch(router({}));
  await creaPost(PEZZO);
  assert.equal(calls.filter((c) => c.method === "GET").length, 1,
    "data vuoto = pagine finite: continuare sarebbe traffico e rate limit sprecati");
});

test("creaPost: la scansione ha un tetto di pagine, non insegue il feed all'infinito", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  // Pagine sempre piene e mai nostre: senza tetto il ciclo non finirebbe.
  const calls = stubFetch(router({
    get: () => feed([{ id: 1, title: "roba di altri", author: { handle: "tizio" } }]),
  }));
  const r = await creaPost(PEZZO);
  assert.equal(r.gia, false);
  const gets = calls.filter((c) => c.method === "GET").length;
  assert.ok(gets > 1 && gets <= 10, `pagine scandite fuori scala: ${gets}`);
});

// Il campo che ci serve e' `data.id`. Una risposta 200/201 senza id non e' un
// post creato, e trattarla come tale scriverebbe in edicola.json un link a
// coderlegion.com/undefined — verde in CI, rotto in produzione.
test("creaPost: risposta ok ma senza data.id -> throw, non un id finto", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => okJson({ status: "success", data: {} }, 201) }));
  await assert.rejects(() => creaPost(PEZZO), /senza id/);
});

// CoderLegion e' un forum PHP, e l'id numerico in forma stringa e' la resa di
// default di mezzo mondo PHP. Rifiutarla non e' rigore: il post e' gia' nato, e
// buttare via la risposta significa ricrearlo domani.
test("creaPost: id numerico in forma stringa -> accettato, non ricreato domani", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => creato("25400") }));
  const r = await creaPost(PEZZO);
  assert.equal(r.id, 25400);
  assert.equal(r.url, "https://coderlegion.com/25400");
});

test("creaPost: id 0, negativo o non numerico -> throw", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  for (const id of [0, -3, "abc", null, { n: 1 }]) {
    stubFetch(router({ post: () => creato(id) }));
    await assert.rejects(() => creaPost(PEZZO), /senza id/, `id=${JSON.stringify(id)} non doveva passare`);
  }
});

// Un 201 con un corpo illeggibile (interstiziale davanti alla risposta vera) e'
// il caso peggiore: il post PUO' gia' esistere. L'errore deve dirlo, perche' chi
// triaggia l'issue non rilanci il workflow facendo il doppione di persona.
test("creaPost: 201 con corpo illeggibile -> errore che avvisa che il post potrebbe esistere", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => new Response("<html>ok</html>", { status: 201 }) }));
  await assert.rejects(() => creaPost(PEZZO), /potrebbe esistere/);
});

test("creaPost: 200 con status \"error\" nel corpo -> throw", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => okJson({ status: "error", message: "Validation failed" }) }));
  await assert.rejects(() => creaPost(PEZZO), /Validation failed/);
});

// 202 = in coda di moderazione. Il post esiste e ha un id: la card e' giusta,
// ma chi legge il log deve sapere che di la' non e' ancora visibile.
test("creaPost: 202 in coda di moderazione -> id valido, marcato in coda", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => okJson({ status: "success", queued: true, data: { id: 7 } }, 202) }));
  const r = await creaPost(PEZZO);
  assert.equal(r.id, 7);
  assert.equal(r.inCoda, true);
});

// Il limite per minuto non e' nella loro documentazione: l'ho preso durante il
// probe del 25-08-2026 con `429 {"status":"error","message":"Per-minute request
// limit reached"}`, dopo cinque letture di fila. Documentati ci sono solo i
// 1000/ora, e l'autore lo conferma a 15/minuto. Un limite che esiste ma non e'
// scritto e' esattamente quello che nessuno gestisce.
test("creaPost: 429 -> aspetta e riprova, poi passa", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  let scritture = 0;
  stubFetch(router({
    post: () => {
      scritture += 1;
      if (scritture === 1) return okJson({ status: "error", message: "Per-minute request limit reached" }, 429);
      return creato(9);
    },
  }));
  const attese = [];
  const r = await creaPost({ ...PEZZO, attendi: async (ms) => { attese.push(ms); } });
  assert.equal(r.id, 9, "dopo il 429 la scrittura deve andare a buon fine");
  assert.equal(scritture, 2, "il 429 va riprovato, non propagato");
  // Il limite e' a finestra di un minuto: aspettare meno e' riprovare a vuoto.
  assert.ok(attese.some((ms) => ms >= 60_000), `nessuna attesa da finestra al minuto: ${attese}`);
});

test("creaPost: 429 con Retry-After -> aspetta i secondi che dice il server", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  let scritture = 0;
  stubFetch(router({
    post: () => {
      scritture += 1;
      if (scritture === 1) return new Response("slow down", { status: 429, headers: { "Retry-After": "5" } });
      return creato(9);
    },
  }));
  const attese = [];
  await creaPost({ ...PEZZO, attendi: async (ms) => { attese.push(ms); } });
  assert.ok(attese.includes(5000), `Retry-After e' in secondi e va rispettato: ${attese}`);
});

// Il tetto non e' paranoia astratta: 2_000_000 secondi sta SOTTO la soglia dei
// 32 bit di setTimeout, quindi non viene clampato a 1ms — sono 23 giorni di
// sonno vero, decisi da chi risponde. In CI lo ucciderebbe il timeout del job
// (dopo aver bruciato la finestra di merge); in locale niente.
test("creaPost: Retry-After assurdo -> l'attesa ha un tetto nostro", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({
    post: () => new Response("slow", { status: 429, headers: { "Retry-After": "2000000" } }),
  }));
  const attese = [];
  await assert.rejects(() => creaPost({ ...PEZZO, attendi: async (ms) => { attese.push(ms); } }));
  for (const ms of attese) assert.ok(ms <= 120_000, `attesa senza tetto: ${ms}ms`);
});

test("creaPost: 429 che non passa mai -> throw, con un numero finito di tentativi", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  let scritture = 0;
  stubFetch(router({ post: () => { scritture += 1; return new Response("slow down", { status: 429 }); } }));
  await assert.rejects(
    () => creaPost({ ...PEZZO, attendi: async () => {} }),
    /coderlegion create 429/,
    "esaurite le riprove l'errore deve restare visibile, non sparire",
  );
  assert.ok(scritture > 1 && scritture <= 4, `tentativi finiti e limitati, non ${scritture}`);
});

test("creaPost: risposta non-ok -> throw con status e corpo", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => new Response("boom", { status: 500 }) }));
  await assert.rejects(() => creaPost(PEZZO), /coderlegion create 500: boom/);
});

test("creaPost: feed non-ok -> throw, e nessuna create alla cieca", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  const calls = stubFetch(router({ get: () => new Response("nope", { status: 500 }) }));
  await assert.rejects(() => creaPost(PEZZO), /coderlegion feed 500/);
  assert.equal(soloPost(calls).length, 0, "senza guardia non si crea: sarebbe creare senza rete");
});

// Il corpo dell'errore lo scrive CoderLegion, e finisce in un Error -> nei log
// della CI (repo PUBBLICO) e in Sentry. Con delle a-capo dentro, chi controlla
// la risposta fabbrica righe di log identiche alle nostre. S5145.
test("creaPost: il corpo dell'errore altrui non fabbrica righe di log", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({
    post: () => new Response("unauthorized\ncoderlegion: creato fake — https://coderlegion.com/999\nedicola: +1 card", { status: 500 }),
  }));
  await assert.rejects(() => creaPost(PEZZO), (e) => {
    assert.equal(e.message.split("\n").length, 1, `l'errore porta ${e.message.split("\n").length} righe: sono log falsi`);
    return true;
  });
});

test("creaPost: il corpo dell'errore altrui non e' illimitato", async () => {
  process.env.CODERLEGION_API_KEY = "k";
  stubFetch(router({ post: () => new Response("x".repeat(100_000), { status: 500 }) }));
  await assert.rejects(() => creaPost(PEZZO), (e) => {
    assert.ok(e.message.length < 1000, `messaggio d'errore da ${e.message.length} caratteri`);
    return true;
  });
});

// La chiave sta in un header, e il corpo dell'errore viene da fuori: se finisse
// in un messaggio verrebbe stampato nei log della CI. Qui si controlla che
// NESSUN cammino d'errore la porti con se', non solo quello non-ok.
test("creaPost: la chiave non compare in nessun messaggio d'errore", async () => {
  const CHIAVE = "cl_segretissima_123";
  process.env.CODERLEGION_API_KEY = CHIAVE;
  const rami = [
    ["non-ok", router({ post: () => new Response("boom", { status: 500 }) })],
    ["status error", router({ post: () => okJson({ status: "error", message: "no" }) })],
    ["senza id", router({ post: () => okJson({ status: "success", data: {} }, 201) })],
    ["corpo illeggibile", router({ post: () => new Response("<html>", { status: 201 }) })],
    ["feed rotto", router({ get: () => new Response("boom", { status: 500 }) })],
    ["rete giu'", () => { throw new TypeError("fetch failed"); }],
  ];
  for (const [nome, handler] of rami) {
    stubFetch(handler);
    await assert.rejects(() => creaPost(PEZZO), (e) => {
      assert.doesNotMatch(e.message, new RegExp(CHIAVE), `chiave nel ramo "${nome}"`);
      assert.doesNotMatch(String(e.stack ?? ""), new RegExp(CHIAVE), `chiave nello stack del ramo "${nome}"`);
      return true;
    });
  }
});
