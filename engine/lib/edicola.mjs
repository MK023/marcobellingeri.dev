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

// Quali dei pubblicati non sono ancora in pila. Esportata perché è anche il
// registro del cross-post su CoderLegion: là non esiste nessuna domanda da fare
// all'API per sapere se un pezzo c'è già (source_url non torna in lettura, e
// "i miei post" è riservato alla Master Key — vedi lib/coderlegion.mjs), quindi
// il CLI deve sapere COSA postare PRIMA di postarlo, e la risposta è questa.
// Un secondo filtro scritto a parte divergerebbe da questo, e i doppioni —
// quelli veri, del 22-07-2026 su dev.to — nascono esattamente così.
//
// Doppio controllo slug+url: una card a mano può essere chiavata solo
// dall'href (finding Seer, PR #97).
// I candidati si deduplicano anche FRA LORO, non solo contro la pila: il 22-07
// "audit-di-se" era nato due volte su dev.to (canonical con e senza slash) e
// slugFromCanonical accetta di proposito entrambe le forme, quindi i due
// articoli danno lo stesso slug. Nessuno dei due in pila -> passavano entrambi.
export function nuove(cards, pubblicati) {
  const note = new Set(cards.map(chiave));
  return pubblicati.filter((p) => {
    if (note.has(p.slug) || note.has(p.url)) return false;
    note.add(p.slug);
    note.add(p.url);
    return true;
  });
}

// cards = contenuto di edicola.json; pubblicati = [{slug, url, anno, label:{it,en},
// coderlegion?}]. Ritorna le card con le nuove in testa (la pila è newest-first);
// se non c'è niente da aggiungere ritorna lo STESSO array — il chiamante usa ===
// per sapere se scrivere.
//
// `coderlegion` (l'id del post) è opzionale e arriva dal CLI dopo la create.
// Quando c'è, entra nel `sub` come seconda fonte e resta nel dato: è il registro
// di cosa è stato davvero creato. Quando manca, il `sub` dichiara la sola dev.to
// — una card che nomina una fonte che non esiste è una bugia che nessun test
// successivo vede. Dal CLI le due cose si muovono insieme (o la create riesce e
// l'id c'è, o l'errore sale e non si scrive niente): il ramo senza id resta la
// forma corretta per le card scritte a mano e per chi chiama questa funzione
// senza passare dal cross-post.
export function mergeCards(cards, pubblicati) {
  const aggiunte = nuove(cards, pubblicati).map((p) => {
    const sub = `${p.coderlegion ? "dev.to · coderlegion" : "dev.to"} · ${p.anno}`;
    return {
      slug: p.slug,
      label: p.label,
      sub: { it: sub, en: sub },
      href: p.url,
      ...(p.coderlegion ? { coderlegion: p.coderlegion } : {}),
    };
  });
  return aggiunte.length ? [...aggiunte, ...cards] : cards;
}
