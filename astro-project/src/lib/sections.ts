import { hasIssues } from './issues';

// Fonte unica delle sezioni: la usano il sommario, la palette comandi e il
// terminale. L'ordine è quello che serve a chi deve comprare: prima l'offerta,
// poi la prova, e solo dopo il curriculum.
//
// I numeri sono derivati dalla posizione, mai scritti a mano: quando l'Archivio
// non c'è, la numerazione si richiude da sola invece di saltare da 07 a 09.
const ALL = [
  ['dossier', 'nav.dossier'],
  ['servizi', 'nav.servizi'],
  ['field-notes', 'nav.fieldNotes'],
  ['projects', 'nav.projects'],
  ['percorso', 'nav.percorso'],
  ['stack', 'nav.stack'],
  ['security', 'nav.security'],
  ['archive', 'nav.archive'],
  ['booking', 'nav.booking'],
  ['contact', 'nav.contact'],
] as const;

export type Section = { id: string; num: string; label: string };

export function sections(t: (key: (typeof ALL)[number][1]) => string): Section[] {
  return ALL.filter(([id]) => id !== 'archive' || hasIssues).map(([id, key], i) => ({
    id,
    num: String(i + 1).padStart(2, '0'),
    label: t(key),
  }));
}
