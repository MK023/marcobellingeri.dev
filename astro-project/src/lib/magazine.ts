import type { CollectionEntry } from 'astro:content';

// L'id dal glob loader è "<lang>/<slug>" (base src/content/magazine). Lo slug —
// il filename condiviso tra la coppia it/ + en/ — è la parte dopo la lingua, ed
// è la stessa URL in entrambe le lingue: la route [lang]/magazine/[slug] e il
// feed RSS devono derivarlo allo stesso modo, o il canonical del cross-post
// punterebbe a una pagina che non esiste.
export function magazineSlug(entry: CollectionEntry<'magazine'>): string {
  return entry.id.replace(/^(it|en)\//, '');
}

// Troncamento pulito per gli estratti del magazine (meta description, indice,
// feed): taglia al massimo dichiarato, ellissi compresa. Era copiato a mano in
// tre punti con l'offset -3 ricavato ogni volta; una modifica all'ellissi
// divergeva pagina, indice e feed.
export function tronca(testo: string, max: number): string {
  return testo.length > max ? testo.slice(0, max - 3).trimEnd() + '…' : testo;
}
