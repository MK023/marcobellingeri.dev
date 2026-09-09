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

/** Sovrapposizione di disegno della colonna, quando la pila va in verticale. */
export const SFALSO_COLONNA_DISEGNO = 58;

/**
 * In verticale la striscia può stringersi più che in orizzontale: si legge il bordo
 * alto e la riga della fonte, non il titolo. Il pavimento però non è estetico, è
 * 24px perché in colonna quella striscia È il bersaglio da toccare del foglio
 * sotto, e 24px è il minimo di WCAG 2.5.8 (Target Size, Minimum). Scendere a 20
 * faceva risparmiare ~150px su una pila da 40 voci, che è il prezzo sbagliato.
 */
export const STRISCIA_COLONNA_MINIMA = 24;

/**
 * Altezza a cui la colonna chiusa comincia a stringersi. 520px non è scelto per
 * bellezza: con le 12 voci di oggi la colonna ne misura 490 su un iPhone, quindi
 * sotto questa soglia non si muove nulla e l'aspetto di adesso resta identico. È
 * la soglia oltre la quale la crescita comincia a costare, non un ideale.
 */
export const BUDGET_COLONNA = 520;


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
export interface Colonna {
  /** Quanti fogli. */
  n: number;
  /** Somma delle altezze dei fogli, in px. */
  somma: number;
  /** Altezza del foglio più BASSO: è quello che sparisce per primo. */
  minima: number;
  /** Spazio fra due fogli prima della sovrapposizione, in px. */
  gap: number;
}

/** Altezza della colonna chiusa con una data sovrapposizione. */
export function altezzaColonna({ n, somma, gap }: Colonna, sfalso: number): number {
  if (n < 2) return somma;
  return somma + (n - 1) * (gap - sfalso);
}

/**
 * Quanto devono sovrapporsi i fogli in colonna. Stessa regola della larghezza:
 * si stringe solo quando serve, mai si allarga oltre il disegno, e non oltre il
 * punto in cui il foglio più basso smette di vedersi.
 *
 * Qui il tetto è più morbido che in orizzontale, e va detto: in larghezza la
 * promessa è assoluta — la riga STA nel contenitore, o si impila. In altezza no.
 * I fogli non sono alti uguale (il titolo è tagliato a tre righe, quindi vanno da
 * 77 a 135px) e la sovrapposizione toglie lo stesso numero di pixel a tutti: per
 * far stare 40 voci in 520px il foglio più basso dovrebbe sparire del tutto.
 * Quindi la colonna cresce ancora, ma piano e con un limite dichiarato: sotto
 * STRISCIA_COLONNA_MINIMA non si scende, e la crescita per voce passa da ~40px a
 * ~20. Se un giorno servisse davvero il tetto duro, la leva non è questa: è il
 * numero di righe del titolo.
 */
export function geometriaColonna(c: Colonna): { sfalso: number } {
  const misure = [c.n, c.somma, c.minima, c.gap];
  if (c.n < 2 || !misure.every(Number.isFinite)) return { sfalso: SFALSO_COLONNA_DISEGNO };
  const servito = Math.ceil((c.somma + (c.n - 1) * c.gap - BUDGET_COLONNA) / (c.n - 1));
  const massimo = c.minima + c.gap - STRISCIA_COLONNA_MINIMA;
  const sfalso = Math.min(Math.max(SFALSO_COLONNA_DISEGNO, servito), Math.max(massimo, SFALSO_COLONNA_DISEGNO));
  return { sfalso };
}

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
