// Coppie domanda/risposta per lo schema FAQPage, estratte dal corpo dell'articolo.
// La regola editoriale che le produce: un H2 che E' la domanda, e subito sotto una
// risposta secca in un paragrafo solo.
//
// Si estrae invece di dichiarare nel frontmatter perche' uno schema che non
// corrisponde al testo visibile e' spam per un motore e rumore per un modello:
// due copie della stessa risposta divergono, e a divergere e' quella che nessuno
// rilegge. Qui la fonte e' una sola, il testo che legge anche la persona.
//
// Il ritorno atteso e' AEO, non rich result: dall'agosto 2023 le FAQ ricche di
// Google valgono solo per siti gov/health. Questo serve a dare a un modello
// coppie gia' separate, invece di prosa da spezzare per conto suo.
export type FaqPair = { question: string; answer: string };

// Oltre questa soglia non e' piu' una risposta secca: e' un paragrafo, e nello
// schema diventa rumore. Il limite e' anche cio' che tiene lineare il lavoro di
// `testo`, che su una riga con un delimitatore mai chiuso costerebbe O(n^2).
const RISPOSTA_MAX = 600;

const FENCE = /^\s*(```|~~~)/;
// Un paragrafo che apre con un fence, un elenco, una citazione, un titolo o una
// tabella non e' una risposta secca: meglio nessuna coppia che una coppia storta.
const NON_PROSA = /^\s*(```|~~~|[-*+] |\d+[.)] |>|#|\|)/;

// Markdown inline via: il campo dello schema e' testo, non markup. Gli underscore
// restano dove sono, `tool_choice` e' un identificatore e non un corsivo.
//
// Le classi negate escludono anche il delimitatore di apertura, cosi' una
// parentesi mai chiusa non fa ripartire il match a ogni posizione. E' pulizia,
// non la difesa: a proteggere davvero e' RISPOSTA_MAX, e si vede provando a
// riportare le classi alla forma quadratica — i test restano verdi lo stesso.
// Chi togliesse il cap lascerebbe questo codice esposto, non protetto.
const testo = (s: string): string =>
  s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^[\]]*)\]\(([^()]*)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();

// La domanda dell'H2, o null se la riga non e' un H2-domanda. Niente regex: il
// prefisso e' fisso, e `startsWith` non puo' backtrackare.
function domanda(riga: string): string | null {
  if (!riga.startsWith('## ')) return null;
  const q = riga.slice(3).trim();
  return q.endsWith('?') ? q : null;
}

// Il paragrafo che risponde, a partire da `da`: salta le righe vuote, si ferma
// alla prima riga vuota successiva. null se non c'e' prosa o se e' troppo lunga.
function risposta(righe: string[], da: number): string | null {
  let j = da;
  while (j < righe.length && righe[j].trim() === '') j++;
  if (j >= righe.length || NON_PROSA.test(righe[j])) return null;

  const paragrafo: string[] = [];
  for (; j < righe.length && righe[j].trim() !== ''; j++) paragrafo.push(righe[j].trim());
  const testoGrezzo = paragrafo.join(' ');
  return testoGrezzo.length > RISPOSTA_MAX ? null : testo(testoGrezzo);
}

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

    const q = domanda(righe[i]);
    if (!q) continue;
    const a = risposta(righe, i + 1);
    if (a) coppie.push({ question: testo(q), answer: a });
  }
  return coppie;
}
