// Radar: normalizzatori puri + endpoint /api/radar + guardie di conformità.
// I feed sono INPUT NON FIDATO anche se vengono da agenzie: titoli con entity,
// HTML e link fuori dominio devono uscire puliti o non uscire affatto.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseRssItems, hostAmmesso, normalizzaKev, gestisciRadar } from '../worker/radar.js';
import { FONTI } from '../src/data/radar-fonti.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

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

test('parseRssItems: rispetta il tetto max', () => {
  assert.equal(parseRssItems(RSS_CERTFR, { max: 1 }).length, 1);
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

test('radar: metodo non-GET -> 405', async () => {
  const r = await gestisciRadar(new Request('https://marcobellingeri.dev/api/radar', { method: 'POST' }));
  assert.equal(r.status, 405);
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
