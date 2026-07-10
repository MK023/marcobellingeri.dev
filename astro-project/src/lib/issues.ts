import index from '../../public/data/issues/index.json';

// Letto a build time con un import statico, non con fs: `import.meta.url` in build
// non punta più al sorgente, e un readFileSync fallito verrebbe scambiato per
// "nessun numero pubblicato". Così invece un indice mancante rompe la build, che è
// esattamente ciò che deve fare.
//
// Se non esiste un numero vero, la sezione Archivio non viene renderizzata affatto:
// un archivio che contiene un segnaposto vale meno di un archivio assente, perché
// promette un impegno mensile che nessuno sta ancora mantenendo. La pipeline in
// engine/ riempirà index.json; finché è vuoto, silenzio.

export type IssueIndexEntry = { id: string; number: number; title: string; date: string };

export const issues: IssueIndexEntry[] = index.issues;
export const hasIssues = issues.length > 0;
