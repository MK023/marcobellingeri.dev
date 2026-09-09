// La pila da edicola cresce da sola: l'Edicola la riempie il cron
// (engine/edicola.mjs) ed è passata da 8 a 12 voci senza che nessuno toccasse la
// geometria. Il difetto che ne è uscito, e che questo test esiste per prendere:
// con 12 fogli la riga chiusa misurava 1106px, più larga di ogni iPad. Su un
// viewport da 1024 la pagina arrivava a 1130 (106px di overflow), da 834 a 1130
// (296px), da 768 a 1130 (362px), con gli ultimi fogli fuori schermo — e aprendo
// la pila la pagina si RESTRINGEVA a 974, che è lo scatto che si vedeva.
//
// Niente lo prendeva, perché niente legava il numero di voci alla larghezza
// disponibile. Qui il legame è una funzione pura, e la promessa si verifica su
// tutta la griglia dei casi invece che sui due che capitava di guardare.
//
// Quello che questo test NON copre, e va misurato nel browser: che i pezzi passati
// alla funzione (foglio, gap, padding, larghezza del contenitore) siano davvero
// quelli che il layout usa.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  altezzaColonna,
  geometriaColonna,
  geometriaPila,
  larghezzaRiga,
  BUDGET_COLONNA,
  SFALSO_COLONNA_DISEGNO,
  SFALSO_DISEGNO,
  STRISCIA_COLONNA_MINIMA,
  STRISCIA_MINIMA,
} from '../src/lib/pila.ts';

// I valori veri del componente, dal suo CSS.
const sorgente = readFileSync('src/components/Newsstand.astro', 'utf8');
const FOGLIO = Number(sorgente.match(/\.paper\{[^}]*width:min\((\d+)px/)[1]);
const GAP = Number(sorgente.match(/\.newsstand-stack\{[^}]*gap:(\d+)px/)[1]);
const PADDING = 2 * Number(sorgente.match(/\.newsstand-stack\{[^}]*padding:\d+px (\d+)px/)[1]);

const base = (n, disponibile) => ({ n, foglio: FOGLIO, gap: GAP, padding: PADDING, disponibile });

test('dove c\'è spazio lo sfalso resta quello di disegno', () => {
  // La larghezza di prova non è un numero scelto a mano: è esattamente quella che
  // la riga occupa con lo sfalso di disegno. Da lì in su non deve stringere nulla.
  for (const n of [2, 8, 12, 20]) {
    const p = base(n, 0);
    const giusta = larghezzaRiga(p, SFALSO_DISEGNO);
    for (const disponibile of [giusta, giusta + 1, giusta + 400]) {
      const g = geometriaPila({ ...p, disponibile });
      assert.equal(g.sfalso, SFALSO_DISEGNO, `n=${n} contenitore=${disponibile}`);
      assert.equal(g.verticale, false, `n=${n} contenitore=${disponibile}`);
    }
  }
});

test('la riga chiusa sta nel contenitore, o si impila in verticale', () => {
  // La promessa, su tutta la griglia: da 2 a 40 voci, da un iPhone stretto a un
  // desktop largo. 40 non è un numero a caso: è dove arriverebbe l'Edicola in poco
  // più di due anni al ritmo attuale.
  const falliti = [];
  for (let n = 2; n <= 40; n++) {
    for (let disponibile = 300; disponibile <= 1600; disponibile += 4) {
      const p = base(n, disponibile);
      const g = geometriaPila(p);
      if (g.verticale) continue; // impilata in verticale: la larghezza non è più un problema
      const larghezza = larghezzaRiga(p, g.sfalso);
      if (larghezza > disponibile) falliti.push(`n=${n} contenitore=${disponibile} riga=${larghezza}`);
    }
  }
  assert.deepEqual(falliti.slice(0, 5), [], `${falliti.length} combinazioni sbordano dal contenitore`);
});

test('quando resta orizzontale, il taglio da edicola resta leggibile', () => {
  const falliti = [];
  for (let n = 2; n <= 40; n++) {
    for (let disponibile = 300; disponibile <= 1600; disponibile += 4) {
      const g = geometriaPila(base(n, disponibile));
      if (g.verticale) continue;
      const striscia = FOGLIO + GAP - g.sfalso;
      if (striscia < STRISCIA_MINIMA) falliti.push(`n=${n} contenitore=${disponibile} striscia=${striscia}`);
    }
  }
  assert.deepEqual(falliti.slice(0, 5), [], `${falliti.length} combinazioni schiacciano i fogli sotto la striscia minima`);
});

test('una misura che non c\'è non manda in vacca la pila', () => {
  // getComputedStyle su un elemento non reso dà stringhe vuote, e parseFloat NaN.
  for (const rotta of [{ foglio: NaN }, { gap: NaN }, { padding: NaN }, { disponibile: NaN }]) {
    const g = geometriaPila({ ...base(12, 800), ...rotta });
    assert.equal(g.sfalso, SFALSO_DISEGNO, `con ${Object.keys(rotta)[0]} NaN`);
    assert.ok(Number.isFinite(g.sfalso), 'uno sfalso NaN diventa --sfalso:-NaNpx e il browser lo scarta');
  }
});

test('la pila non perde voci per stare dentro', () => {
  // Il tetto al numero di fogli era la soluzione facile ed è stata bocciata: la
  // pila deve mostrarle tutte, e a cedere è la geometria.
  assert.ok(
    !/\.slice\(/.test(sorgente),
    'il componente taglia le voci: la pila deve mostrarle tutte e stringersi invece',
  );
});

test('lo sfalso arriva al CSS dalla misura, non da una costante', () => {
  assert.match(
    sorgente,
    /margin-left:var\(--sfalso/,
    'il margine è tornato a un numero fisso: la pila torna a sbordare appena crescono le voci',
  );
  assert.match(sorgente, /setProperty\('--sfalso'/, 'nessuno calcola più lo sfalso');
});

test('chi ha ridotto le animazioni non si ritrova la pila', () => {
  // La deroga reduced-motion prima pareggiava la specificità con la variante
  // verticale, che stava in una media query, e vinceva perché scritta dopo. Ora la
  // variante porta una classe in più: se la deroga non la nomina, perde, e chi ha
  // chiesto meno movimento riceve la colonna coi fogli sovrapposti — esattamente
  // ciò che la riga di commento sopra promette di non dargli.
  const blocco = sorgente.match(/@media \(prefers-reduced-motion: reduce\)\{([\s\S]*?)\n {2}\}/);
  assert.ok(blocco, 'sparito il blocco reduced-motion');
  assert.match(
    blocco[1],
    /\.is-vertical/,
    'la deroga reduced-motion non nomina .is-vertical: perde di specificità e la pila resta sovrapposta',
  );
});

test('la pila verticale non dipende da una soglia in pixel', () => {
  assert.match(sorgente, /\.newsstand-stack\.is-enhanced\.is-vertical\{/, 'manca la variante verticale');
  assert.ok(
    !/@media \(max-width:\d+px\)\{?[\s\S]{0,400}is-enhanced/.test(sorgente),
    'la variante verticale è tornata dentro una media query: quel numero è tarato su un conto di voci che cambia',
  );
});

// --- la colonna, cioè la pila quando va in verticale --------------------------
//
// Qui la promessa è più debole che in larghezza, e il test lo dice: i fogli non
// sono alti uguale (titolo tagliato a tre righe: da 77 a 135px misurati su
// iPhone) e la sovrapposizione toglie gli stessi pixel a tutti, quindi un tetto
// assoluto farebbe sparire il foglio più basso. Quello che si garantisce è che la
// crescita RALLENTI e si fermi a una striscia minima, invece di andare avanti
// lineare per sempre.

// Numeri veri, misurati sull'anteprima a 390px: il foglio più basso è 77px, il più
// alto 135. La MEDIA però non è (77+135)/2 — i titoli lunghi sono l'eccezione — e
// prenderla per tale falsava il test in modo interessante: con 106px a foglio la
// colonna sfondava il budget già a 12 voci, cioè affermava che l'aspetto di oggi
// cambia, mentre nel browser misura 490px e non cambia niente. La media si ricava
// quindi all'indietro dalla misura vera: 490px chiusi con lo sfalso di disegno
// significano 490 + 11*(58-14) = 974px di fogli, cioè ~81 l'uno.
const FOGLIO_MIN = 77;
const FOGLIO_MEDIO = 81;
const GAP_COLONNA = 14;

const colonna = (n) => ({
  n,
  somma: n * FOGLIO_MEDIO,
  minima: FOGLIO_MIN,
  gap: GAP_COLONNA,
});

test('la colonna non si allarga mai oltre il disegno', () => {
  // Poche voci: deve restare esattamente com'è oggi, non "sistemarsi".
  for (const n of [2, 5, 12]) {
    const { sfalso } = geometriaColonna(colonna(n));
    assert.ok(
      sfalso >= SFALSO_COLONNA_DISEGNO,
      `n=${n}: sfalso ${sfalso} sotto il disegno ${SFALSO_COLONNA_DISEGNO}, la colonna si allargherebbe`,
    );
  }
  // Con le 12 di oggi la colonna sta nel budget, quindi non si stringe affatto.
  assert.equal(geometriaColonna(colonna(12)).sfalso, SFALSO_COLONNA_DISEGNO);
});

test('la striscia in colonna resta un bersaglio toccabile', () => {
  // In colonna la striscia visibile è il bersaglio da toccare del foglio: 24px è
  // il minimo di WCAG 2.5.8. Non è un numero estetico e non si abbassa per
  // guadagnare altezza.
  assert.ok(
    STRISCIA_COLONNA_MINIMA >= 24,
    `striscia minima ${STRISCIA_COLONNA_MINIMA}px, sotto i 24 di WCAG 2.5.8`,
  );
});

test('il foglio più basso non sparisce mai', () => {
  const falliti = [];
  for (let n = 2; n <= 200; n++) {
    const { sfalso } = geometriaColonna(colonna(n));
    const striscia = FOGLIO_MIN + GAP_COLONNA - sfalso;
    if (striscia < STRISCIA_COLONNA_MINIMA) falliti.push(`n=${n} striscia=${striscia}`);
  }
  assert.deepEqual(falliti.slice(0, 5), [], `${falliti.length} casi schiacciano il foglio più basso`);
});

test('la crescita della colonna rallenta invece di restare lineare', () => {
  const altezza = (n) => altezzaColonna(colonna(n), geometriaColonna(colonna(n)).sfalso);
  const fissa = (n) => altezzaColonna(colonna(n), SFALSO_COLONNA_DISEGNO);

  // Fino al budget le due curve coincidono: oggi non cambia niente.
  assert.equal(altezza(12), fissa(12));

  // Oltre, quella adattiva cresce meno, e il divario si allarga.
  for (const n of [20, 40, 80]) {
    assert.ok(altezza(n) < fissa(n), `n=${n}: la colonna adattiva (${altezza(n)}) non è più bassa della fissa (${fissa(n)})`);
  }

  // Il passo per voce si dimezza. Il tetto NON è la striscia minima secca: quella
  // vale per il foglio più BASSO, ed è lui a fermare la sovrapposizione. Un foglio
  // di altezza media resta più alto di così, esattamente della differenza fra la
  // media e il minimo — 24px invece di 20 coi numeri veri. Asserire 20 sarebbe
  // stato asserire un modello che il codice non ha.
  const passoMassimo = STRISCIA_COLONNA_MINIMA + (FOGLIO_MEDIO - FOGLIO_MIN);
  const passoFisso = (fissa(80) - fissa(40)) / 40;
  const passoAdattivo = (altezza(80) - altezza(40)) / 40;
  assert.ok(
    passoAdattivo <= passoMassimo,
    `passo ${passoAdattivo}px per voce, sopra il tetto di ${passoMassimo}px`,
  );
  // Niente rapporto fra i due passi: un `< passoFisso * 0.75` sarebbe un numero
  // inventato qui, non una proprietà del disegno. Quello che il disegno garantisce
  // è il tetto assoluto sopra, più il fatto che rallenti — e tanto basta.
  assert.ok(
    passoAdattivo < passoFisso,
    `passo ${passoAdattivo}px contro ${passoFisso}px a sovrapposizione fissa: non rallenta`,
  );
});

test('una misura che non c\'è non manda in vacca la colonna', () => {
  for (const rotta of [{ somma: NaN }, { minima: NaN }, { gap: NaN }]) {
    const { sfalso } = geometriaColonna({ ...colonna(12), ...rotta });
    assert.equal(sfalso, SFALSO_COLONNA_DISEGNO, `con ${Object.keys(rotta)[0]} NaN`);
  }
});

test('il budget della colonna è dichiarato e non finto', () => {
  // 520px: con le 12 voci di oggi la colonna ne misura 490 su un iPhone. Se
  // qualcuno lo abbassa sotto quel numero, l'aspetto di oggi cambia in silenzio.
  assert.ok(BUDGET_COLONNA >= 490, `budget ${BUDGET_COLONNA}px: sotto i 490 di oggi, la colonna si stringe subito`);
});

// --- l'area che tiene aperta la pila -----------------------------------------

test('la riserva d\'altezza sta sul contenitore, non sulla pila', () => {
  // Sulla pila, la sua scatola restava alta quanto il ventaglio aperto mentre i
  // fogli ne occupavano un terzo: 264px contro 82 sulle Certificazioni. I 182px
  // di differenza erano area invisibile che valeva comunque come :hover, quindi
  // la pila si apriva col puntatore 120px sotto i fogli, dove non c'è niente.
  // Misurato prima: "SI APRE DA LONTANO" su Edicola e Certificazioni; dopo, banda
  // vuota di 5px su tutte e tre.
  assert.match(
    sorgente,
    /contenitore\.style\.minHeight = `\$\{aperto\}px`/,
    'la riserva è tornata sulla pila: torna la banda invisibile che la apre da lontano',
  );
  assert.ok(
    !/stack\.style\.minHeight = `/.test(sorgente),
    'la pila si riserva ancora addosso un\'altezza che non le serve',
  );
  // L'altezza riservata è quella dello stato APERTO, misurata togliendo
  // .is-enhanced: riservare quella chiusa non riserverebbe niente.
  assert.match(sorgente, /const aperto = contenitore\.offsetHeight;/, 'non si misura più lo stato aperto');
});

test('reduced-motion torna alla riga a capo, non solo senza margini', () => {
  // Azzerare i margini non basta: `.is-enhanced` porta anche `flex-wrap:nowrap`,
  // quindi senza sovrapposizione la riga torna larga quanto la somma dei fogli —
  // 3042px misurati con 12 voci, cioè lo sbordo orizzontale che questo lavoro
  // toglie, servito intatto a chi ha chiesto meno movimento.
  const blocco = sorgente.match(/@media \(prefers-reduced-motion: reduce\)\{([\s\S]*?)\n {2}\}/);
  assert.ok(blocco, 'sparito il blocco reduced-motion');
  assert.match(
    blocco[1],
    /flex-wrap:wrap/,
    'reduced-motion azzera i margini ma lascia nowrap: la riga resta larga quanto la somma dei fogli',
  );
});


// --- il rimando al profilo dev.to --------------------------------------------

const magazine = readFileSync('src/components/MagazineSection.astro', 'utf8');

test('il rimando a dev.to sta nella testatina della pila', () => {
  // Non su una riga sua sotto la pila: lì non apparteneva né alla testatina né ai
  // fogli, e si leggeva come una cosa appiccicata dopo. Va nello slot `fonte`, che
  // la testatina dispone a destra come fa `.live-stack-head` nella sezione
  // Security — etichetta a sinistra, fonte a destra, la piega di una testata.
  assert.match(magazine, /slot="fonte"/, 'il rimando non passa più dallo slot della testatina');
  assert.match(magazine, /dev\.to\/mk023/, 'sparito il rimando al profilo dev.to');
  assert.ok(
    !/edicola-profilo|profilo-chip/.test(magazine),
    'è tornata la riga orfana sotto la pila',
  );
  assert.match(sorgente, /<slot name="fonte" \/>/, 'la pila non ha più lo slot per la fonte');
  assert.match(
    sorgente,
    /\.certs-head\{[^}]*justify-content:space-between/,
    'la testatina non dispone più etichetta e fonte sulla stessa riga',
  );
});

test('il nome accessibile del rimando comincia col testo visibile', () => {
  // WCAG 2.5.3: chi comanda a voce dice quello che legge.
  assert.match(
    magazine,
    /aria-label=\{`dev\.to\/mk023 —/,
    'il nome accessibile non comincia col testo visibile del link',
  );
});

test('la testatina non spegne il rimando che ci mette dentro', () => {
  // `.certs-head` non è un contenitore neutro: global.css le mette addosso
  // `opacity:0.7` e `text-transform:uppercase`, e scendono su tutto ciò che ci sta
  // dentro. Due conseguenze prese qui:
  //
  // - una `opacity` sul link si MOLTIPLICA con quella della testatina. A 0.49 un
  //   testo da 11px su carta chiara scende sotto il 4.5:1 di WCAG AA, e nessun
  //   `opacity:1` su hover o focus può rimediare, perché il tetto resta quello del
  //   genitore. Misurato senza: 6.66:1 di giorno, 8.59:1 di notte.
  // - senza `text-transform:none` il link si legge DEV.TO/MK023 mentre il suo nome
  //   accessibile dice `dev.to/mk023`.
  const regola = magazine.match(/\.fonte-edicola\{([^}]*)\}/);
  assert.ok(regola, 'sparita la regola del rimando');
  assert.ok(
    !/opacity:/.test(regola[1]),
    'opacity sul rimando: si moltiplica con quella della testatina e il contrasto scende sotto AA',
  );
  assert.match(
    regola[1],
    /text-transform:none/,
    'senza text-transform:none il rimando si legge in maiuscolo, diverso dal suo nome accessibile',
  );
});

test('il bersaglio del rimando non dipende dal puntatore primario', () => {
  // `pointer:coarse` descrive il puntatore PRIMARIO: un portatile touch con
  // trackpad non lo soddisfa, e lì il bersaglio tornerebbe alto quanto il testo.
  // Il chip che stava qui prima dichiarava min-height:44px senza condizioni.
  assert.match(
    magazine,
    /@media \(any-pointer:coarse\)/,
    'il bersaglio tattile è condizionato al puntatore primario: sparisce sui portatili touch',
  );
});

test('la pila non rende un href che può eseguire codice', () => {
  // Presidio al CONSUMATORE, l'altra metà di quello al confine in
  // engine/lib/edicola.mjs. Il cron non è l'unico che scrive edicola.json: una
  // card si può aggiungere a mano, e niente rivalida quel file a build time.
  // L'escaping di Astro mette in salvo l'attributo, non lo schema.
  assert.match(
    sorgente,
    /href=\{hrefSicuro\(b\.href\)\}/,
    'la pila rende di nuovo b.href grezzo: uno schema javascript: passerebbe intatto',
  );
  const guardia = sorgente.match(/const hrefSicuro = \(href: string\) =>\n([^;]*);/);
  assert.ok(guardia, 'sparita la guardia sul consumatore');
  assert.match(guardia[1], /\^https:\\\/\\\//, 'la guardia non richiede più https per i link in uscita');
  assert.match(guardia[1], /\^\\\/\[\^\/\\\\\]/, 'la guardia non ammette più i percorsi interni');
});

test('un percorso interno ha UNA barra sola', () => {
  // `//evil.com` è protocol-relative: il browser ci mette davanti lo schema della
  // pagina e se ne va fuori sito. `/\evil.com` fa lo stesso, perché dentro uno
  // schema speciale la barra rovescia vale come una dritta. `startsWith('/')` li
  // faceva passare entrambi, mentre il commento accanto prometteva "interno".
  const guardia = sorgente.match(/const hrefSicuro = \(href: string\) =>\n([^;]*);/)[1];
  assert.ok(
    !/startsWith\('\/'\)/.test(guardia),
    'la guardia accetta di nuovo qualunque cosa cominci con una barra: //evil.com esce dal sito',
  );
  assert.match(guardia, /\^\\\/\[\^\/\\\\\]/, 'manca il controllo sulla seconda barra');
});
