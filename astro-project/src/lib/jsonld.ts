// JSON per <script type="application/ld+json"> iniettato con set:html.
// JSON.stringify non tocca "<": un titolo contenente "</script>" chiuderebbe
// il tag a build time e il resto del JSON diventerebbe markup della pagina.
// I titoli del magazine escono dalla pipeline: input non fidato (regola esc()).
// L'escape unicode è JSON valido per i crawler e inerte dentro l'HTML.
export const ldJson = (dati: unknown): string =>
  JSON.stringify(dati).replace(/</g, '\\u003c');
