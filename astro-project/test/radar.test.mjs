// Radar: normalizzatori puri + endpoint /api/radar + guardie di conformità.
// I feed sono INPUT NON FIDATO anche se vengono da agenzie: titoli con entity,
// HTML e link fuori dominio devono uscire puliti o non uscire affatto.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseRssItems, hostAmmesso, normalizzaKev, gestisciRadar } from '../worker/radar.js';
import { FONTI } from '../src/data/radar-fonti.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete globalThis.__SEGNALA_SENTRY__; });

// Il reporter che in produzione registra worker/sentry.js. Qui raccoglie: un
// fallimento che non passa di qui è un fallimento che nessuno vede.
const catturaSegnalazioni = () => {
  const viste = [];
  globalThis.__SEGNALA_SENTRY__ = (messaggio, extra) => viste.push({ messaggio, extra });
  return viste;
};

// Fixture nella forma REALE dei feed (catturata il 22-07-2026, non inventata).
const RSS_CERTFR = `<?xml version='1.0' encoding='UTF-8'?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0"><channel><title>CERT-FR</title>
<item><title>Multiples vuln&#233;rabilit&#233;s dans Mattermost Server (29 juin 2026)</title><link>https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0539/</link><pubDate>Mon, 29 Jun 2026 09:00:00 +0000</pubDate></item>
<item><title>Vuln&#233;rabilit&#233; dans PostgreSQL</title><link>https://www.cert.ssi.gouv.fr/avis/CERTFR-2026-AVI-0540/</link><pubDate>Tue, 30 Jun 2026 09:00:00 +0000</pubDate></item>
</channel></rss>`;

const RSS_CISA = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>All CISA Advisories</title>
<item><title>Tycon Systems &lt;b&gt;TPDIN&lt;/b&gt;-Monitor-WEB2</title><link>https://www.cisa.gov/news-events/ics-advisories/icsa-26-202-01</link><dc:date>2026-07-21T12:00:00Z</dc:date></item>
<item><title>Link fuori dominio</title><link>https://evil.example.com/phish</link><pubDate>Mon, 21 Jul 2026 12:00:00 +0000</pubDate></item>
</channel></rss>`;

const KEV = {
  vulnerabilities: [
    { cveID: 'CVE-2026-60137', vulnerabilityName: 'WordPress Core SQL Injection Vulnerability', dateAdded: '2026-07-21' },
    { cveID: 'CVE-2026-1111', vulnerabilityName: 'Vecchia', dateAdded: '2026-07-01' },
    { cveID: 'NON-UN-CVE', vulnerabilityName: 'Malformata', dateAdded: '2026-07-22' },
  ],
};

// ---- parseRssItems ------------------------------------------------------

test('parseRssItems: titolo decodificato, tag html spogliati, data ISO', () => {
  const items = parseRssItems(RSS_CISA);
  assert.equal(items[0].titolo, 'Tycon Systems TPDIN-Monitor-WEB2');
  assert.equal(items[0].url, 'https://www.cisa.gov/news-events/ics-advisories/icsa-26-202-01');
  assert.equal(items[0].data, '2026-07-21');
});

test('parseRssItems: pubDate RFC822 diventa ISO, ordine del feed conservato', () => {
  const items = parseRssItems(RSS_CERTFR);
  assert.equal(items.length, 2);
  assert.equal(items[0].data, '2026-06-29');
  assert.match(items[0].titolo, /^Multiples vulnérabilités/);
});

test('parseRssItems: xml rotto o vuoto -> lista vuota, mai throw', () => {
  assert.deepEqual(parseRssItems('non è xml'), []);
  assert.deepEqual(parseRssItems(''), []);
  assert.deepEqual(parseRssItems('<rss><channel><item><title>senza link</title></item></channel></rss>'), []);
});

test('parseRssItems: i bypass della sanificazione non passano (CodeQL js/incomplete-multi-character-sanitization + js/double-escaping)', () => {
  const xml = (titolo) => `<rss><channel><item><title>${titolo}</title><link>https://x.example/y</link></item></channel></rss>`;
  // la PROPRIETÀ, non una stringa: qualunque cosa entri, nell'output non
  // sopravvive nessuna parentesi angolare — nemmeno un <script senza chiusura
  for (const cattivo of [
    'a&lt;scr&lt;x&gt;ipt&gt;alert(1)&lt;/script&gt;b', // tag annidato che ricompone
    'a&lt;script src=x b', // tag aperto senza `>`: sopravvivrebbe al solo punto fisso
  ]) {
    const t = parseRssItems(xml(cattivo))[0].titolo;
    assert.doesNotMatch(t, /[<>]/, `parentesi sopravvissute in: ${t}`);
    assert.match(t, /alert\(1\)|script src/, 'il testo innocuo deve restare');
  }
  // double-unescape: &amp;#60; deve restare testo (&#60;), MAI diventare <
  assert.equal(parseRssItems(xml('5 &amp;#60; 6'))[0].titolo, '5 &#60; 6');
});

test('parseRssItems: le entity si decodificano anche nei LINK (l\'XML escapa & come &amp;)', () => {
  const xml = `<rss><channel><item><title>t</title><link>https://x.example/p?a=1&amp;b=2</link></item></channel></rss>`;
  assert.equal(parseRssItems(xml)[0].url, 'https://x.example/p?a=1&b=2');
});

test('parseRssItems: rispetta il tetto max', () => {
  assert.equal(parseRssItems(RSS_CERTFR, { max: 1 }).length, 1);
});

// Il ciclo a punto fisso che spoglia i tag è QUADRATICO su una corsa di `<`
// senza `>`: `[^>]*` riparte da ogni posizione e non trova mai la chiusura.
// Misurato prima del taglio: 25k char = 0,4s · 100k = 6,7s · 200k = 30s. Il
// tetto per feed è 400k, il KEV 8MB: un titolo così brucia la CPU del Worker e
// /api/radar muore. È un test a tempo perché il tempo È la proprietà; la soglia
// sta 300× sotto il valore rotto e 100× sopra quello sano, non è una gara.
test('decodifica: una corsa di `<` non manda in ginocchio il sanificatore (ReDoS)', () => {
  const titolo = '<'.repeat(100_000);
  const xml = `<rss><channel><item><title>${titolo}</title><link>https://www.cisa.gov/x</link></item></channel></rss>`;
  const t0 = process.hrtime.bigint();
  const items = parseRssItems(xml);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(items.length, 1);
  assert.equal(items[0].titolo, ''); // resta comunque sanificato: niente `<` in uscita
  assert.ok(ms < 200, `sanificazione lenta: ${ms.toFixed(0)}ms su 100k char (era ~6700ms)`);
});

test('normalizzaKev: stessa guardia sul nome della vulnerabilità (il KEV ha tetto 8MB)', () => {
  const t0 = process.hrtime.bigint();
  const kev = normalizzaKev({
    vulnerabilities: [{ cveID: 'CVE-2026-9999', vulnerabilityName: '<'.repeat(100_000), dateAdded: '2026-07-23' }],
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(kev[0].nome, '');
  assert.ok(ms < 200, `sanificazione lenta: ${ms.toFixed(0)}ms su 100k char`);
});

// ---- hostAmmesso --------------------------------------------------------

test('hostAmmesso: solo https e host esatto della fonte', () => {
  const hosts = ['www.cisa.gov', 'cisa.gov'];
  assert.equal(hostAmmesso('https://www.cisa.gov/x', hosts), true);
  assert.equal(hostAmmesso('http://www.cisa.gov/x', hosts), false); // no https, no party
  assert.equal(hostAmmesso('https://evil-cisa.gov/x', hosts), false);
  assert.equal(hostAmmesso('https://cisa.gov.evil.com/x', hosts), false);
  assert.equal(hostAmmesso('non-un-url', hosts), false);
});

// ---- normalizzaKev ------------------------------------------------------

test('normalizzaKev: ordina per data desc, valida il formato CVE, tetto', () => {
  const kev = normalizzaKev(KEV, 2);
  assert.equal(kev.length, 2);
  assert.equal(kev[0].cve, 'CVE-2026-60137'); // la più recente prima
  assert.ok(!kev.some((k) => k.cve === 'NON-UN-CVE')); // la malformata è fuori
});

test('normalizzaKev: payload malformato -> lista vuota, mai throw', () => {
  assert.deepEqual(normalizzaKev({}, 5), []);
  assert.deepEqual(normalizzaKev(null, 5), []);
});

// ---- guardia di conformità sul registro ---------------------------------

test('ogni fonte del registro ha licenza scritta (nome + url) e hostsAmmessi', () => {
  for (const f of FONTI) {
    assert.ok(f.licenza?.nome, `${f.id}: manca licenza.nome`);
    assert.match(String(f.licenza?.url), /^https:\/\//, `${f.id}: manca licenza.url`);
    assert.ok(Array.isArray(f.hostsAmmessi) && f.hostsAmmessi.length > 0, `${f.id}: hostsAmmessi vuoto`);
    // ogni feed dichiarato sta sui domini che la fonte ammette
    for (const feed of f.feeds) {
      assert.ok(hostAmmesso(feed, f.hostsAmmessi), `${f.id}: feed fuori dominio ${feed}`);
    }
  }
});

// ---- gestisciRadar ------------------------------------------------------

const stubFeeds = (byUrl) => {
  globalThis.fetch = async (url) => {
    const body = byUrl[String(url)];
    if (body === undefined) return new Response('not found', { status: 404 });
    if (body === 'BOOM') throw new Error('rete giù');
    return new Response(body, { status: 200 });
  };
};

const TUTTI_OK = () => {
  const map = {};
  for (const f of FONTI) for (const u of f.feeds) map[u] = f.id === 'cert-fr' ? RSS_CERTFR : RSS_CISA;
  map[FONTI[0].kev] = JSON.stringify(KEV);
  return map;
};

test('radar: GET felice — json con fonti, items filtrati per dominio, kev presente', async () => {
  stubFeeds(TUTTI_OK());
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(r.headers.get('Cache-Control'), /s-maxage=/);
  const dati = await r.json();
  assert.ok(dati.aggiornatoIl);
  const cisa = dati.fonti.find((f) => f.id === 'cisa');
  // il feed CISA della fixture ha 2 item ma uno punta a evil.example.com: fuori
  assert.equal(cisa.items.length, 1);
  assert.ok(cisa.kev.length > 0);
  const ue = dati.fonti.find((f) => f.id === 'ue');
  assert.deepEqual(ue.items, []); // senza feed, il punto resta con la sola home
});

// Con `redirect: follow` (default) Workers inoltra TUTTI gli header alla
// destinazione, anche su host diverso — sta scritto nella doc del runtime. Qui
// non ci sono header sensibili, ma il punto è un altro: il Radar dichiara in
// pagina la fonte accanto alla sua licenza, e seguire un dirottamento in
// silenzio significa mostrare una licenza che non copre ciò che hai scaricato.
// Verificato il 23-07-2026: 6 feed su 6 del registro rispondono 200 senza un
// solo redirect, quindi la regola stretta non toglie niente a nessuno.
test('radar: i feed non seguono redirect (la fonte scaricata è quella dichiarata)', async () => {
  const inits = [];
  globalThis.fetch = async (url, init) => {
    inits.push(init ?? {});
    return new Response(RSS_CISA, { status: 200 });
  };
  await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  assert.ok(inits.length > 0, 'nessun feed scaricato: il test non prova niente');
  for (const i of inits) {
    assert.equal(i.redirect, 'manual', 'un feed segue ancora i redirect del runtime');
  }
});

test('radar: un 301 upstream toglie la fonte invece di seguirlo', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const ncsc = FONTI.find((f) => f.id === 'ncsc-uk').feeds;
    if (ncsc.includes(u)) return new Response('', { status: 301, headers: { Location: 'https://evil.example.com/feed' } });
    if (u === FONTI.find((f) => f.kev).kev) return new Response(JSON.stringify(KEV), { status: 200 });
    return new Response(RSS_CISA, { status: 200 });
  };
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  const dati = await r.json();
  assert.ok(dati.mancanti.includes('ncsc-uk'), 'il 301 non ha tolto la fonte');
});

test('radar: un feed che esplode non uccide la risposta (fail-open per fonte)', async () => {
  const map = TUTTI_OK();
  for (const u of FONTI.find((f) => f.id === 'ncsc-uk').feeds) map[u] = 'BOOM';
  stubFeeds(map);
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  assert.equal(r.status, 200);
  const dati = await r.json();
  assert.ok(dati.mancanti.includes('ncsc-uk'));
  assert.ok(dati.fonti.find((f) => f.id === 'cisa').items.length > 0);
});

// ---- osservabilità: i fallimenti che nessuno vedeva ---------------------
// Il fail-open è la scelta giusta (un feed giù non deve togliere la pagina), ma
// fail-open SENZA segnale è cecità: la pagina resta su e mostra meno, e nessuno
// sa che è successo. Questi tre test tengono la linea in entrambi i versi —
// i due silenzi devono parlare, la giornata normale deve tacere.

test('radar: il KEV giù non è più silenzioso (era un catch(() => []) muto)', async () => {
  const viste = catturaSegnalazioni();
  const map = TUTTI_OK();
  map[FONTI.find((f) => f.kev).kev] = 'BOOM';
  stubFeeds(map);
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  assert.equal(r.status, 200); // fail-open: la pagina resta in piedi
  const dati = await r.json();
  assert.deepEqual(dati.fonti.find((f) => f.id === 'cisa').kev, []);
  assert.equal(viste.length, 1, 'il KEV caduto non è arrivato a Sentry');
  assert.match(viste[0].messaggio, /^radar: /);
  assert.match(viste[0].messaggio, /kev/i);
});

test('radar: tutte le fonti giù -> Sentry (il blackout non è una giornata tranquilla)', async () => {
  const viste = catturaSegnalazioni();
  const map = TUTTI_OK();
  for (const f of FONTI) for (const u of f.feeds) map[u] = 'BOOM';
  stubFeeds(map);
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  assert.equal(r.status, 200);
  const dati = await r.json();
  assert.ok(dati.mancanti.length > 0);
  assert.ok(
    viste.some((v) => /tutte le fonti/i.test(v.messaggio)),
    'blackout totale senza segnale: il radar sarebbe cieco su sé stesso',
  );
});

test('radar: una fonte sola giù NON allarma (è dichiarata in pagina, non è un silenzio)', async () => {
  const viste = catturaSegnalazioni();
  const map = TUTTI_OK();
  for (const u of FONTI.find((f) => f.id === 'ncsc-uk').feeds) map[u] = 'BOOM';
  stubFeeds(map);
  const dati = await (await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'))).json();
  assert.ok(dati.mancanti.includes('ncsc-uk')); // il visitatore lo vede
  assert.equal(viste.length, 0, 'degradare di uno strato non è un incidente: così il segnale diventa rumore');
});

test('radar: giornata normale -> zero segnalazioni', async () => {
  const viste = catturaSegnalazioni();
  stubFeeds(TUTTI_OK());
  await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'));
  assert.deepEqual(viste, []);
});

test('radar: metodo non-GET -> 405', async () => {
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar', { method: 'POST' }));
  assert.equal(r.status, 405);
});

// ---- fonti a dati committati (MITRE ATLAS) ------------------------------
// ATLAS è una tassonomia, non un flusso: il dato sta in src/data/radar-atlas.js,
// generato da engine/atlas.mjs. Qui si verifica che esca in /api/radar SENZA
// rete — un fetch a atlas.mitre.org qui dentro vorrebbe dire che qualcuno ha
// rimesso a runtime i 626 KB di YAML che il Worker non sa nemmeno parsare.

test('radar: la fonte a dati committati esce con i suoi item senza toccare la rete', async () => {
  const chiamati = [];
  const map = TUTTI_OK();
  globalThis.fetch = async (url) => {
    chiamati.push(String(url));
    const body = map[String(url)];
    if (body === undefined) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200 });
  };

  const dati = await (await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'))).json();
  const atlas = dati.fonti.find((f) => f.id === 'atlas');

  assert.ok(atlas, 'la fonte atlas non è nel registro');
  assert.ok(atlas.items.length > 0, 'atlas è uscita viva e vuota: è il silenzio peggiore');
  assert.ok(!dati.mancanti.includes('atlas'), 'una fonte senza feed non è una fonte giù');
  // Confronto sull'hostname, non `includes`: `https://evil.example/?x=atlas.mitre.org`
  // contiene la stringa e non è ATLAS (CodeQL js/incomplete-url-substring-sanitization).
  const hostDi = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  assert.equal(
    chiamati.filter((u) => hostDi(u) === 'atlas.mitre.org').length,
    0,
    'ATLAS è stata scaricata a runtime: il dato committato non serve più a niente',
  );
});

// Guardia sul DATO generato, non sull'output già filtrato: se engine/atlas.mjs
// producesse un url fuori dominio, il Worker lo scarterebbe in silenzio e la
// fonte perderebbe voci senza che nessuno lo sappia. Qui invece la CI si ferma.
test('radar: ogni item committato sta nei domini dichiarati dalla sua fonte', () => {
  const conDati = FONTI.filter((f) => f.itemsStatici);
  assert.ok(conDati.length > 0, 'nessuna fonte a dati committati: il test non guarda niente');
  for (const f of conDati) {
    assert.ok(f.itemsStatici.length > 0, `${f.id}: itemsStatici vuoto`);
    for (const i of f.itemsStatici) {
      assert.ok(hostAmmesso(i.url, f.hostsAmmessi), `${f.id}: item fuori dominio ${i.url}`);
    }
  }
});

test('radar: un item committato fuori dominio viene scartato dalla barriera', async () => {
  const atlas = FONTI.find((f) => f.id === 'atlas');
  const veleno = { id: 'AML.CSX', titolo: 'link dirottato', url: 'https://evil.example/studies/x', data: '2099-01-01' };
  atlas.itemsStatici.unshift(veleno); // data futura: senza barriera uscirebbe primo
  try {
    stubFeeds(TUTTI_OK());
    const dati = await (await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar'))).json();
    const uscite = dati.fonti.find((f) => f.id === 'atlas').items.map((i) => i.url);
    assert.ok(!uscite.includes(veleno.url), 'la barriera di dominio non copre gli item committati');
  } finally {
    atlas.itemsStatici.shift();
  }
});

// ---- la pagina nella build ----------------------------------------------

test('radar: la pagina esiste in dist per entrambe le lingue, col fallback senza JS', () => {
  for (const lang of ['it', 'en']) {
    const p = new URL(`../dist/${lang}/radar/index.html`, import.meta.url).pathname;
    assert.ok(existsSync(p), `manca dist/${lang}/radar`);
    const html = readFileSync(p, 'utf8');
    // il fallback: la lista delle fonti è nell'HTML servito, non solo nel canvas
    for (const f of FONTI) assert.ok(html.includes(f.nome), `${lang}: manca ${f.nome} nel fallback`);
    // l'attribuzione è resa in pagina: è la condizione della licenza, non cortesia
    assert.ok(html.includes('Open Government Licence'), `${lang}: manca l'attribuzione OGL`);
    assert.ok(html.includes('Natural Earth'), `${lang}: manca l'attribuzione Natural Earth`);
  }
});
