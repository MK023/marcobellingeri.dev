// La sigla della testata: "VOL. 01 — NO. 08". Era una costante in i18n/ui.ts, e
// l'11 agosto 2026 il sito annunciava ancora il numero di luglio: una stringa
// non sa che è passato un mese. Il numero è il mese, il volume è l'anno di vita
// del sito — entrambi si calcolano, così nessuno deve ricordarsene il primo del
// mese.
//
// Il sito è live dal 10 luglio 2026: il volume scatta all'anniversario, non a
// Capodanno, perché è l'anno della testata e non quello del calendario.
const NASCITA = { anno: 2026, mese: 7 };

// Mese e anno a Roma: alle 23:30 UTC del 31 agosto in Italia è già settembre, e
// la testata deve dire quello che direbbe chi la scrive. Stesso fuso
// dell'orologio della barra, per non avere due "adesso" diversi nella stessa riga.
function romeYearMonth(d: Date): { anno: number; mese: number } {
  const [mese, anno] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    month: '2-digit',
    year: 'numeric',
  })
    .format(d)
    .split('/')
    .map(Number);
  return { anno, mese };
}

export function siglaTestata(now: Date = new Date()): string {
  const { anno, mese } = romeYearMonth(now);
  const mesiDallaNascita = (anno - NASCITA.anno) * 12 + (mese - NASCITA.mese);
  const volume = Math.floor(mesiDallaNascita / 12) + 1;
  return `VOL. ${String(volume).padStart(2, '0')} — NO. ${String(mese).padStart(2, '0')}`;
}
