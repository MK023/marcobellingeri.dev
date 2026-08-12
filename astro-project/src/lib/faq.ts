// Coppie domanda/risposta per lo schema FAQPage, estratte dal corpo dell'articolo.
// La regola editoriale che le produce: un H2 che E' la domanda, e subito sotto una
// risposta secca in un paragrafo solo.
//
// Si estrae invece di dichiarare nel frontmatter perche' uno schema che non
// corrisponde al testo visibile e' spam per un motore e rumore per un modello:
// due copie della stessa risposta divergono, e a divergere e' quella che nessuno
// rilegge. Qui la fonte e' una sola — il testo che legge anche la persona.
//
// Il ritorno atteso e' AEO, non rich result: dall'agosto 2023 le FAQ ricche di
// Google valgono solo per siti gov/health. Questo serve a dare a un modello
// coppie gia' separate, invece di prosa da spezzare per conto suo.
export type FaqPair = { question: string; answer: string };

const TITOLO_H2 = /^## +(.+?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
// Un paragrafo che apre con un fence, un elenco, una citazione, un titolo o una
// tabella non e' una risposta secca: meglio nessuna coppia che una coppia storta.
const NON_PROSA = /^\s*(```|~~~|[-*+] |\d+[.)] |>|#|\|)/;

// Markdown inline via: il campo dello schema e' testo, non markup. Gli underscore
// restano dove sono — `tool_choice` e' un identificatore, non un corsivo.
const testo = (s: string): string =>
  s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .trim();

export function faqPairs(markdown: unknown): FaqPair[] {
  if (typeof markdown !== 'string') return [];
  const righe = markdown.split('\n');
  const coppie: FaqPair[] = [];
  let dentroFence = false;

  for (let i = 0; i < righe.length; i++) {
    if (FENCE.test(righe[i])) {
      dentroFence = !dentroFence;
      continue;
    }
    if (dentroFence) continue;

    const titolo = righe[i].match(TITOLO_H2);
    if (!titolo?.[1].endsWith('?')) continue;

    let j = i + 1;
    while (j < righe.length && righe[j].trim() === '') j++;
    if (j >= righe.length || NON_PROSA.test(righe[j])) continue;

    const paragrafo: string[] = [];
    for (; j < righe.length && righe[j].trim() !== ''; j++) paragrafo.push(righe[j].trim());
    coppie.push({ question: testo(titolo[1]), answer: testo(paragrafo.join(' ')) });
  }
  return coppie;
}
