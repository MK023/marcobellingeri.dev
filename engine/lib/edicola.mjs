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
