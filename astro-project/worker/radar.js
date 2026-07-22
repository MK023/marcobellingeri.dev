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

const TETTO_UPSTREAM = 400_000; // char: un feed più grosso è troncato, il parser regge
const MAX_ITEMS = 5;
const MAX_KEV = 6;

// Entity HTML nei titoli RSS (&#233;, &amp;, ...) -> testo, POI via i tag: un
// titolo con markup escapato (&lt;b&gt;) deve uscire come solo testo. L'output
// resta comunque plain text: la pagina lo rende via textContent, mai innerHTML.
const decodifica = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#?39;|&apos;/g, "'")
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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
      url: link,
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
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
      if (f.kev) voce.kev = await scarica(f.kev, 8_000_000).then((t) => normalizzaKev(JSON.parse(t))).catch(() => []);
      return voce;
    }),
  );

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
