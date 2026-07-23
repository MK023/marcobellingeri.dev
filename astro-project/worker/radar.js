// /api/radar — i bollettini delle agenzie di sicurezza nazionali, aggregati
// all'edge per la pagina Radar. Solo fonti con licenza commerciale-compatibile
// verificata per iscritto (registro: src/data/radar-fonti.js, esteso in
// docs/FONTI.md). Il browser chiama same-origin: la CSP resta intatta e i feed
// upstream vedono UNA richiesta ogni mezz'ora, non una per visitatore.
//
// I feed sono INPUT NON FIDATO anche se governativi: titoli sanificati, link
// ammessi solo sui domini della fonte, risposta upstream cappata. Fail-open per
// fonte: un feed giù toglie uno strato, mai la pagina.
import { FONTI } from '../src/data/radar-fonti.js';

// Stesso patto di index.js:62 — il reporter lo registra worker/sentry.js, così
// questo file resta puro (niente SDK negli import) e i test lo sostituiscono con
// un raccoglitore. Senza, i catch qui sotto sarebbero muti: fail-open che non
// segnala non è resilienza, è cecità.
const segnala = (messaggio, extra) => globalThis.__SEGNALA_SENTRY__?.(messaggio, extra);

const TETTO_UPSTREAM = 400_000; // char: un feed più grosso è troncato, il parser regge
const MAX_ITEMS = 5;
const MAX_KEV = 6;

// Entity HTML nei titoli RSS (&#233;, &amp;, ...) -> testo, POI via i tag.
// Due regole imposte da CodeQL, e ha ragione lui:
//  - le entity si decodificano in UN SOLO passaggio (replace sequenziali
//    double-unescaperebbero: &amp;#60; non deve diventare <);
//  - i tag si spogliano A PUNTO FISSO (un passaggio solo e' aggirabile:
//    <scr<x>ipt> ricompone <script> dopo la prima passata).
// L'output resta plain text: la pagina lo rende via textContent, mai innerHTML.
const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
// Un solo passaggio anche da sola: serve pure ai LINK (l'XML escapa & come
// &amp; dentro <link> — senza decodifica l'URL uscirebbe con la query rotta).
const decodEntita = (s) =>
  s.replace(/&(#\d+|amp|lt|gt|quot|apos|#39);/g, (m, n) =>
    n.startsWith('#') ? String.fromCodePoint(Number(n.slice(1))) : ENTITA[n],
  );
// Il ciclo a punto fisso qui sotto è QUADRATICO su una corsa di `<` senza `>`:
// `[^>]*` riparte da ogni posizione e non trova mai la chiusura. Misurato il
// 23-07-2026: 25k char = 0,4s · 100k = 6,7s · 200k = 30s. Col tetto a 400k per
// feed (e 8MB sul KEV) un titolo ostile brucia la CPU del Worker e /api/radar
// muore: fail-open per fonte non salva, perché a cadere è la richiesta intera.
// Il taglio sta QUI e non ai due chiamanti — la funzione è la barriera, e chi
// la userà domani eredita la guardia invece di doverla ricordare.
// 2000 char sono 12× il titolo più lungo che teniamo (160): nessun bollettino
// vero ci arriva vicino.
const LIMITE_TESTO = 2000;
const decodifica = (s) => {
  let t = decodEntita(String(s).slice(0, LIMITE_TESTO));
  for (let prima = ''; prima !== t; ) { prima = t; t = t.replace(/<[^>]*>/g, ''); }
  // un `<script` senza `>` sopravvivrebbe al punto fisso: in un titolo di
  // bollettino le parentesi angolari non portano informazione — via anche loro
  return t.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
};

export function hostAmmesso(url, hosts) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

// Parser RSS minimale per i feed del registro: <item> con title/link e
// pubDate o dc:date. Non è un parser XML generale — copre la forma reale dei
// feed catturata il 22-07-2026 e degrada a lista vuota su tutto il resto.
export function parseRssItems(xml, { max = MAX_ITEMS } = {}) {
  const items = [];
  const blocchi = String(xml).match(/<item[\s>][\s\S]*?<\/item>/g) ?? [];
  for (const b of blocchi) {
    if (items.length >= max) break;
    const titolo = b.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const link = b.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim();
    if (!titolo || !link) continue;
    const grezza = b.match(/<(?:pubDate|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/)?.[1];
    const t = grezza ? Date.parse(grezza) : NaN;
    items.push({
      titolo: decodifica(titolo).slice(0, 160),
      // stesso trattamento del titolo: l'input non fidato non ha corsie
      // preferenziali (audit: il link grezzo teneva &amp; letterale in query)
      url: decodEntita(link),
      data: Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10),
    });
  }
  return items;
}

export function normalizzaKev(json, max = MAX_KEV) {
  const vuln = Array.isArray(json?.vulnerabilities) ? json.vulnerabilities : [];
  return vuln
    .filter((v) => /^CVE-\d{4}-\d{1,7}$/.test(String(v?.cveID)))
    .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)))
    .slice(0, max)
    .map((v) => ({
      cve: v.cveID,
      nome: decodifica(String(v.vulnerabilityName ?? '')).slice(0, 120),
      data: String(v.dateAdded ?? '').slice(0, 10) || null,
    }));
}

// Il tetto di default protegge dal feed abnorme; il KEV lo alza: il catalogo
// completo è ~5MB di JSON e un troncamento lo renderebbe imparsabile (kev=[]
// silenzioso — successo davvero, beccato provando l'endpoint coi feed reali).
const scarica = async (url, tetto = TETTO_UPSTREAM) => {
  // `redirect: manual` — il 3xx torna com'è, `r.ok` è falso e la fonte cade nel
  // fail-open con la sua segnalazione. Col default `follow` il runtime inoltra
  // TUTTI gli header alla destinazione anche su host diverso (doc Workers), e
  // soprattutto scaricheremmo da un'origine che non è quella dichiarata in
  // pagina accanto alla licenza. Verificato: 6 feed su 6 rispondono senza un
  // solo redirect, quindi la regola non toglie niente — e se un giorno una
  // fonte migra, è giusto saperlo da Sentry invece di seguirla in silenzio.
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return (await r.text()).slice(0, tetto);
};

export async function gestisciRadar(request, _env, ctx) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method' }), {
      status: 405, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  // Cache all'edge: N visitatori = 1 giro di feed ogni mezz'ora. In Node (test)
  // `caches` non esiste: si degrada al fetch diretto, stessa semantica.
  // Chiave di cache normalizzata al solo path: `?x=1` non deve bucare la cache
  // e trasformare ogni visitatore curioso in un giro di feed upstream.
  const chiave = new Request(new URL('/api/radar', request.url));
  const cache = globalThis.caches?.default;
  const inCache = await cache?.match(chiave);
  if (inCache) return inCache;

  const mancanti = [];
  const fonti = await Promise.all(
    FONTI.map(async (f) => {
      // Feed in parallelo anche dentro la fonte; uno rotto non azzera l'altro.
      // Arrow esplicita: `map(scarica)` passerebbe l'INDICE come tetto —
      // feed 0 troncato a 0 char. Successo davvero, beccato eseguendo.
      const esiti = await Promise.allSettled(f.feeds.map((u) => scarica(u)));
      const items = esiti
        .filter((e) => e.status === 'fulfilled')
        .flatMap((e) => parseRssItems(e.value))
        .filter((i) => hostAmmesso(i.url, f.hostsAmmessi))
        .sort((a, b) => String(b.data).localeCompare(String(a.data)))
        .slice(0, MAX_ITEMS);
      if (f.feeds.length > 0 && esiti.every((e) => e.status === 'rejected')) mancanti.push(f.id);

      const voce = {
        id: f.id, nome: f.nome, paese: f.paese, luogo: f.luogo,
        lat: f.lat, lng: f.lng, strato: f.strato, home: f.home,
        licenza: f.licenza, items,
      };
      // Il KEV è uno strato intero del globo: se cade, la pagina non lo dice
      // (niente `mancanti` per lui) e resta solo un elenco più corto. Era il
      // silenzio peggiore dei due — nessun messaggio upstream nell'extra (S5145).
      if (f.kev) {
        voce.kev = await scarica(f.kev, 8_000_000)
          .then((t) => normalizzaKev(JSON.parse(t)))
          .catch(() => { segnala('radar: KEV non disponibile', { fonte: f.id }); return []; });
      }
      return voce;
    }),
  );

  // Una fonte giù è DICHIARATA in pagina (`mancanti`): il visitatore vede uno
  // strato in meno e sa perché — allarmare a ogni feed ballerino renderebbe il
  // segnale rumore, e un allarme ignorato è un allarme morto. Il blackout totale
  // invece non lo vede nessuno: la pagina resta su, vuota e credibile.
  const conFeed = FONTI.filter((f) => f.feeds.length > 0).length;
  if (conFeed > 0 && mancanti.length === conFeed) segnala('radar: tutte le fonti giù', { fonti: conFeed });

  const risposta = new Response(JSON.stringify({ aggiornatoIl: new Date().toISOString(), fonti, mancanti }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      // 5 min nel browser, 30 min all'edge: "in tempo quasi reale" dichiarato,
      // non millantato — la pagina mostra "aggiornato N minuti fa".
      'Cache-Control': 'public, max-age=300, s-maxage=1800',
    },
  });
  if (cache) ctx?.waitUntil?.(cache.put(chiave, risposta.clone()));
  return risposta;
}
