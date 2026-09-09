// engine/lib/edicola.mjs
// La pila dell'Edicola come dato: merge tra le card esistenti (edicola.json)
// e gli articoli pubblicati su dev.to con canonical sul sito. Logica pura:
// niente rete, niente filesystem — il CLI (edicola.mjs) fa l'I/O.
// Lo slash finale e' opzionale, e non e' tolleranza gratuita: canonicalDi lo
// emette (la pagina si dichiara canonical cosi'), ma su dev.to i pezzi usciti
// prima della #218 conservano la forma senza. Questo parser legge un dato che
// arriva da fuori e che esiste in due forme, quindi le accetta entrambe.
// Il giro completo canonicalDi -> slugFromCanonical e' sotto test: e' li' che
// si accorge se le due meta' ricominciano a divergere.
const CANONICAL = /^https:\/\/marcobellingeri\.dev\/en\/writing\/([a-z0-9-]+)\/?$/;

// slug della writing collection dal canonical_url, o null se l'articolo
// non è un cross-post nostro.
export function slugFromCanonical(url) {
  return url?.match(CANONICAL)?.[1] ?? null;
}

// L'url dell'articolo arriva dalla API di dev.to, cioè da fuori, e finisce dritto
// in un href renderizzato dal sito. Che sia un URL ben formato non basta:
// `javascript:alert(1)` lo è, e l'escaping di Astro non lo tocca — quello mette in
// salvo l'ATTRIBUTO, non lo schema. Pesa che quel dato non lo rilegge nessuno: il
// workflow edicola-card apre la PR, approva i suoi stessi check e mergia da solo.
//
// Lista esatta e non `/^(.+\.)?dev\.to$/`: quella accettava QUALUNQUE sottodominio,
// cioè molto più di quanto la riga sopra prometta, e un sottodominio abbandonato di
// dev.to che finisse in quella risposta diventerebbe una card verso fuori. È anche
// la forma di hostAmmesso() in worker/radar.js, che fa lo stesso lavoro sulle fonti
// dei bollettini: `hosts.includes(u.hostname)`, niente jolly.
const HOST_DEVTO = ["dev.to", "www.dev.to"];

// Ritorna l'url NORMALIZZATO se è accettabile, altrimenti null. Non un booleano, e
// non è pedanteria: validare una stringa e salvarne un'altra lascia una fessura.
// `https://dev.to\@evil.com` supera il controllo perché il parser lo legge come
// `https://dev.to/@evil.com` — ma se in edicola.json ci finisse il testo grezzo,
// chiunque lo rilegga con regole diverse dal parser del browser (un feed, una
// unfurl, una mail) vedrebbe un'altra cosa. Si salva quello che si è guardato.
export function hrefSicuro(url) {
  try {
    const u = new URL(url);
    // Il punto finale è lo stesso host: `dev.to.` e `dev.to` sono la stessa cosa
    // per il DNS, e scartarlo sarebbe scartare un url legittimo in silenzio.
    const host = u.hostname.replace(/\.$/, "");
    return u.protocol === "https:" && HOST_DEVTO.includes(host) ? u.href : null;
  } catch {
    // URL relativi o spazzatura: `new URL` senza base li rifiuta, ed è quello che
    // vogliamo — una card dell'Edicola punta sempre fuori, mai in casa.
    return null;
  }
}

// Identità di una card: lo slug quando c'è (regge "stessa firma, casa diversa":
// interna oggi, dev.to domani), altrimenti l'href.
const chiave = (c) => c.slug ?? c.href;

// cards = contenuto di edicola.json; pubblicati = [{slug, url, anno, label:{it,en}}].
// Ritorna le card con le nuove in testa (la pila è newest-first); se non c'è
// niente da aggiungere ritorna lo STESSO array — il chiamante usa === per
// sapere se scrivere.
export function mergeCards(cards, pubblicati) {
  const note = new Set(cards.map(chiave));
  // Doppio controllo slug+url: una card a mano può essere chiavata solo
  // dall'href (finding Seer, PR #97).
  const nuove = pubblicati
    .filter((p) => !note.has(p.slug) && !note.has(p.url))
    .map((p) => ({
      slug: p.slug,
      label: p.label,
      sub: { it: `dev.to · ${p.anno}`, en: `dev.to · ${p.anno}` },
      href: p.url,
    }));
  return nuove.length ? [...nuove, ...cards] : cards;
}

// `published_at` arriva dalla stessa risposta di `url`, e il commento sopra dice
// che quella risposta è non fidata: dirlo per un campo e non per l'altro è una
// mezza verità. Oggi finisce in `sub` ("dev.to · 2026"), che il sito rende come
// testo escapato — quindi non è una falla, è un dato sporco che diventerebbe una
// card con l'anno sbagliato o vuoto. Qui la stringa diventa un anno o niente.
// dev.to è del 2016, e 2015 è un anno di margine: la data la scrive dev.to, non
// noi, e stringere fino all'anno esatto di fondazione non protegge da niente in più.
const ANNO_MINIMO = 2015;
export function annoPubblicazione(published_at, adesso = new Date()) {
  const anno = Number(String(published_at ?? "").slice(0, 4));
  const massimo = adesso.getUTCFullYear() + 1; // un fuso avanti non è un errore
  return Number.isInteger(anno) && anno >= ANNO_MINIMO && anno <= massimo ? String(anno) : null;
}
