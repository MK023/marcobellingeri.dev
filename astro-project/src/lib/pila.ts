// Geometria della pila da edicola (Newsstand.astro). Sta qui e non dentro il
// componente per una ragione sola: è l'unica parte della pila che si può provare
// senza un browser, e la promessa che fa — la riga chiusa sta sempre dentro il
// contenitore — è esattamente quella che si era rotta in produzione.
//
// I fogli si sovrappongono di SFALSO_DISEGNO, e ognuno mostra una striscia di
// (foglio + gap - sfalso). Quando le voci sono troppe per la larghezza, lo sfalso
// cresce quanto basta; quando nemmeno stringendo la striscia resta leggibile, la
// pila va impilata in verticale e la larghezza smette di essere un problema.

/** Sfalso di disegno: con un foglio da 240px e gap 14 ogni foglio mostra 78px. */
export const SFALSO_DISEGNO = 176;

/** Sotto questa striscia il taglio da edicola non si legge più. */
export const STRISCIA_MINIMA = 40;

export interface Pila {
  /** Quanti fogli. */
  n: number;
  /** Larghezza di un foglio, in px. */
  foglio: number;
  /** Spazio fra due fogli prima della sovrapposizione, in px. */
  gap: number;
  /** Padding orizzontale della pila, i due lati sommati. */
  padding: number;
  /** Larghezza utile del contenitore, in px. */
  disponibile: number;
}

/** Larghezza della riga chiusa con un dato sfalso. */
export function larghezzaRiga({ n, foglio, gap, padding }: Pila, sfalso: number): number {
  if (n < 2) return n * foglio + padding;
  return n * foglio + (n - 1) * (gap - sfalso) + padding;
}

/**
 * Quanto devono sovrapporsi i fogli perché la riga stia nel contenitore, e se a
 * quel punto convenga impilare in verticale. Si stringe solo quando serve: dove
 * c'è spazio resta lo sfalso di disegno.
 */
export function geometriaPila(p: Pila): { sfalso: number; verticale: boolean } {
  // Le misure arrivano dal layout, e il layout non sempre risponde: su un elemento
  // non ancora reso `getComputedStyle` restituisce stringhe vuote e `parseFloat`
  // dà NaN. Un NaN qui non resta un numero sbagliato: diventa `--sfalso:-NaNpx`,
  // che il browser scarta, e senza sovrapposizione la pila torna larga quanto la
  // somma dei fogli — cioè esattamente il difetto che questo modulo esiste per
  // togliere. Meglio lo sfalso di disegno che una misura che non c'è.
  const misure = [p.n, p.foglio, p.gap, p.padding, p.disponibile];
  if (p.n < 2 || !misure.every(Number.isFinite)) {
    return { sfalso: SFALSO_DISEGNO, verticale: false };
  }
  const servito = Math.ceil(
    (p.n * p.foglio + (p.n - 1) * p.gap + p.padding - p.disponibile) / (p.n - 1),
  );
  const sfalso = Math.max(SFALSO_DISEGNO, servito);
  return { sfalso, verticale: p.foglio + p.gap - sfalso < STRISCIA_MINIMA };
}
