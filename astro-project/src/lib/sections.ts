// Fonte unica delle sezioni: la usano il sommario, la palette comandi e il
// terminale. L'ordine è quello che serve a chi deve comprare: prima l'offerta,
// poi la prova, e solo dopo il curriculum.
//
// I numeri sono derivati dalla posizione, mai scritti a mano: se una sezione
// viene aggiunta o tolta, la numerazione si richiude da sola.
const ALL = [
  ['dossier', 'nav.dossier'],
  ['servizi', 'nav.servizi'],
  ['field-notes', 'nav.fieldNotes'],
  ['magazine', 'nav.magazine'],
  ['projects', 'nav.projects'],
  ['percorso', 'nav.percorso'],
  ['stack', 'nav.stack'],
  ['security', 'nav.security'],
  ['booking', 'nav.booking'],
  ['contact', 'nav.contact'],
] as const;

export type Section = { id: string; num: string; label: string };

const attive = ALL;

export function sections(t: (key: (typeof ALL)[number][1]) => string): Section[] {
  return attive.map(([id, key], i) => ({
    id,
    num: String(i + 1).padStart(2, '0'),
    label: t(key),
  }));
}

/**
 * Il numero da stampare nel titolo di una sezione. Deve venire da qui e non essere
 * scritto a mano nel componente: se l'elenco delle sezioni cambia, i titoli scorrono
 * insieme al sommario invece di sfasarsi.
 */
export function numeroSezione(id: (typeof ALL)[number][0]): string {
  const i = attive.findIndex(([voce]) => voce === id);
  if (i === -1) throw new Error(`sezione sconosciuta o non attiva: ${id}`);
  return String(i + 1).padStart(2, '0');
}
