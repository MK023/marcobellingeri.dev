// Il piano free di Cloudflare non separa umani da bot, e i crawler IA qui sono
// aperti tutti per scelta dichiarata. Finche' non si contano, i 33.561 pageview
// del primo mese non si possono mostrare a un cliente: dentro c'e' una quota di
// crawler che nessuno sa quantificare.
//
// Due domande diverse, dallo stesso dato: quanto traffico umano c'e' davvero, e
// se i crawler IA passano davvero (se GPTBot non arriva mai, la risposta di
// ChatGPT e' gia' scritta, e nessun lavoro sul contenuto la cambia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifica, datoDaScrivere } from '../worker/crawler.js';
import worker from '../worker/index.js';

const UA_UMANO =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

test('crawler: i bot IA si riconoscono per famiglia, non alla rinfusa', () => {
  assert.equal(classifica('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)'), 'gptbot');
  assert.equal(classifica('Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'), 'oai-searchbot');
  assert.equal(classifica('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'), 'claudebot');
  assert.equal(classifica('Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/bot)'), 'perplexitybot');
});

test('crawler: ChatGPT-User non e\' GPTBot, e la differenza e\' il punto', () => {
  // GPTBot addestra, ChatGPT-User arriva perche' una persona ha chiesto qualcosa
  // in quel momento. Confonderli vuol dire non sapere se il sito viene LETTO.
  assert.equal(classifica('Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)'), 'chatgpt-user');
  assert.notEqual(classifica('Mozilla/5.0 (compatible; ChatGPT-User/1.0)'), 'gptbot');
});

test('crawler: i motori di ricerca restano distinti dai bot IA', () => {
  assert.equal(classifica('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'googlebot');
  assert.equal(classifica('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'), 'bingbot');
});

test('crawler: un browser vero e\' un umano', () => {
  assert.equal(classifica(UA_UMANO), 'umano');
});

test('crawler: un bot che si dichiara tale resta un bot, non diventa un umano', () => {
  assert.equal(classifica('Mozilla/5.0 (compatible; QualcosaNuovoBot/0.1; +https://boh.example)'), 'bot-ignoto');
  assert.equal(classifica('curl/8.7.1'), 'bot-ignoto');
  assert.equal(classifica('python-requests/2.32'), 'bot-ignoto');
});

// «Si dichiara bot» e «non somiglia a un browser che conosco» sono due cose
// diverse, e mescolarle costa due volte: nel secchio ci finiscono persone (che
// non vanno trattate come bot), e il numero che finisce davanti a un cliente
// spaccia per certezza un «non sono riuscito a capirlo».
test('crawler: chi non si dichiara e non somiglia a un browser resta non-classificato', () => {
  assert.equal(classifica('QualcosaDiStrano/1.0'), 'non-classificato');
  assert.equal(classifica('Lynx/2.9.2'), 'non-classificato');
});

test('crawler: user-agent assente o vuoto non e\' un umano, ma nemmeno un bot dichiarato', () => {
  // Un browser manda sempre un UA. L'assenza e' un client automatico, ma non
  // dice quale: non c'e' niente da dichiarare e niente da conservare.
  assert.equal(classifica(null), 'non-classificato');
  assert.equal(classifica(''), 'non-classificato');
  assert.equal(classifica(undefined), 'non-classificato');
});

// Un proxy aziendale che appende `(+http://intra.example)` all'UA, o una webview
// con `OkHttp` dentro, non trasformano una persona in un crawler. `http` e `java`
// erano nella lista dei segni di bot e colpivano user-agent di browser veri.
test('crawler: un browser vero resta umano anche se il suo UA contiene un URL', () => {
  assert.equal(classifica(UA_UMANO + ' (+http://intra.example)'), 'umano');
});

test('crawler: il riconoscimento non dipende dalle maiuscole', () => {
  assert.equal(classifica('mozilla/5.0 (compatible; gptbot/1.2)'), 'gptbot');
});

// Un UA e' scritto da chi chiama: input non fidato. Va nel dataset, quindi va
// limitato prima, o una richiesta sola puo' occupare il budget di un data point.
// Il cap va provato sul ramo che lo usa davvero: un UA che classifica `gptbot`
// non scrive nessun token, quindi un test su quello sarebbe verde per la ragione
// sbagliata e MAX_TOKEN potrebbe salire a 5000 senza che nessuno se ne accorga.
test('crawler: nessun blob supera il cap, sul ramo che scrive il token', () => {
  const d = datoDaScrivere('bot' + 'A'.repeat(5000), '/it/' + 'b'.repeat(5000), 'IT');
  assert.equal(d.blobs[0], 'bot-ignoto', 'senza questo ramo il test non proverebbe niente');
  assert.ok(d.blobs[3].length <= 64, `token oltre il cap: ${d.blobs[3].length}`);
  assert.ok(d.blobs.every((b) => b.length <= 256), 'nessun blob oltre i 256 caratteri');
});

// Il token e' scelto da chi chiama e oggi non ha nessun consumatore: il giorno in
// cui quel numero finisce in una pagina, la regola del repo («nel DOM solo via
// esc()») non e' scritta da nessuna parte vicino a questo dataset. Si sanifica in
// scrittura, cosi' non c'e' niente da ricordarsi in lettura.
test('crawler: il token di prodotto porta solo caratteri da nome di prodotto', () => {
  const d = datoDaScrivere('bot<svg/onload=alert`1`>', '/it/', 'IT');
  assert.equal(d.blobs[0], 'bot-ignoto');
  assert.ok(!/[<>`'"&;]/.test(d.blobs[3]), `token non sanificato: ${d.blobs[3]}`);
  assert.ok(d.blobs[3].startsWith('bot'), 'la parte legittima resta leggibile');
});

// Privacy, per gradi. Di una persona non si conserva niente dello user-agent: e'
// un dato fingerprintabile e qui non serve a nulla. Di una famiglia gia' nota
// nemmeno: il nome la identifica gia'. Resta solo `bot-ignoto`, ed e' proprio il
// caso in cui un browser insolito puo' essere finito nel secchio sbagliato —
// quindi li' si tiene il minimo che permetta di riconoscere una famiglia nuova:
// il token di prodotto, non la stringa intera.
test('crawler: dell\'umano non si conserva niente dello user-agent', () => {
  const d = datoDaScrivere(UA_UMANO, '/it/', 'IT');
  assert.equal(d.blobs[0], 'umano');
  assert.ok(!d.blobs.some((b) => b.includes('AppleWebKit')), 'nessun frammento di UA umano nel dato');
  assert.ok(!d.blobs.some((b) => b.includes('Macintosh')), 'nemmeno il sistema operativo');
});

test('crawler: di una famiglia gia\' nota non serve conservare lo user-agent', () => {
  const d = datoDaScrivere('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', '/it/', 'IT');
  assert.equal(d.blobs[0], 'gptbot');
  assert.equal(d.blobs[3], '', 'il nome della famiglia basta: niente user-agent da conservare');
});

test('crawler: del bot dichiarato si conserva il solo token di prodotto', () => {
  const d = datoDaScrivere('QualcosaNuovoBot/0.1 (Macintosh; Intel Mac OS X 10_15_7) rendering/1', '/it/', 'IT');
  assert.equal(d.blobs[0], 'bot-ignoto');
  assert.ok(d.blobs.includes('QualcosaNuovoBot/0.1'), 'una famiglia nuova deve restare riconoscibile');
  assert.ok(!d.blobs.some((b) => b.includes('Mac OS X')), 'il resto dello user-agent non serve a riconoscerla');
});

// Chi non si e' dichiarato puo' essere una persona con un client insolito: di
// lui non si conserva nemmeno il token. E' il caso su cui la privacy si gioca.
test('crawler: del non-classificato non si conserva niente dello user-agent', () => {
  const d = datoDaScrivere('QualcosaDiStrano/1.0', '/it/', 'IT');
  assert.equal(d.blobs[0], 'non-classificato');
  assert.equal(d.blobs[3], '', 'chi non si e\' dichiarato bot potrebbe essere una persona');
});

test('crawler: il percorso e il paese entrano nel dato', () => {
  const d = datoDaScrivere('GPTBot/1.0', '/en/writing/audit-di-se/', 'US');
  assert.ok(d.blobs.includes('/en/writing/audit-di-se/'));
  assert.ok(d.blobs.includes('US'));
  assert.deepEqual(d.indexes, ['gptbot'], 'l\'indice e\' la famiglia: e\' la dimensione su cui si aggrega');
});

test('crawler: un paese assente non fabbrica un paese', () => {
  const d = datoDaScrivere('GPTBot/1.0', '/it/', undefined);
  assert.ok(d.blobs.includes('sconosciuto'));
});

// Il redirect della root non e' una lettura: `/` risponde 302 e la pagina vera
// arriva dopo. Contarli entrambi raddoppia ogni visita che entra dall'apex —
// proprio sul numero che dovrebbe finire davanti a un cliente.
test('crawler: il 302 della root non e\' un pageview', async () => {
  const scritti = [];
  const env = {
    CRAWLERS: { writeDataPoint: (d) => scritti.push(d) },
    ASSETS: { fetch: async () => new Response('pagina') },
  };
  const req = (p) => Object.assign(new Request('https://marcobellingeri.dev' + p), { cf: { country: 'IT' } });

  const r = await worker.fetch(req('/'), env, {});
  assert.equal(r.status, 302, 'la root deve ancora reindirizzare');
  assert.equal(scritti.length, 0, 'il redirect non va contato');

  await worker.fetch(req('/it/writing/audit-di-se/'), env, {});
  assert.equal(scritti.length, 1, 'la pagina servita va contata');
  assert.equal(scritti[0].blobs[1], '/it/writing/audit-di-se/');
});

test('crawler: senza il binding la pagina esce lo stesso', async () => {
  const env = { ASSETS: { fetch: async () => new Response('pagina') } };
  const r = await worker.fetch(new Request('https://marcobellingeri.dev/it/'), env, {});
  assert.equal(r.status, 200);
});
