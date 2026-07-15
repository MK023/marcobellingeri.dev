import type { CollectionEntry } from 'astro:content';

// L'id dal glob loader è "<lang>/<slug>" (base src/content/writing). Lo slug —
// il filename condiviso tra la coppia it/ + en/ — è la parte dopo la lingua, ed è
// la stessa URL in entrambe le lingue: la route [lang]/writing/[slug] lo deriva da
// qui, così il canonical del cross-post punta a una pagina che esiste in entrambe.
export function writingSlug(entry: CollectionEntry<'writing'>): string {
  return entry.id.replace(/^(it|en)\//, '');
}
