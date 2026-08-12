// Il trattino lungo in mezzo a una frase e' il tell piu' affidabile di un testo
// scritto da un modello, e questo sito vende il contrario. Ripulirlo a mano una
// volta non serve a niente: la copy si tocca di continuo, e al prossimo giro
// rientra senza che nessuno se ne accorga.
//
// Il test guarda il RESO, non i sorgenti: e' quello che legge un visitatore, e
// cattura anche il testo che arriva da un componente che nessuno ha in mente.
//
// Non tutti i trattini lunghi sono uguali, e questo e' il punto del test. Il sito
// e' impaginato come un giornale (DESIGN.md): `VOL. 01 — NO. 08` in testata, il
// titolo `Bellingeri — AI, Cloud & Security Edition`, le righe `etichetta —
// descrizione` negli elenchi. Sono scelte di tipografia. Quello che non deve
// tornare e' il trattino usato come pausa dentro una frase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

function paginePubblicate(dir = DIST, trovate = []) {
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, voce.name);
    if (voce.isDirectory()) paginePubblicate(p, trovate);
    else if (voce.name.endsWith('.html')) trovate.push(p);
  }
  return trovate;
}

// Filtri secondo la specifica HTML, non secondo il caso che capita. Un tag di
// chiusura puo' essere maiuscolo, avere spazi (`</script >`) e perfino attributi
// che il parser ignora (`</script foo>`): sono tutti validi. CodeQL me ne ha
// nominato uno per giro, tre giri, ed e' il segno che stavo rincorrendo i casi
// invece della classe. `(?:\s[^>]*)?` li copre tutti, e lo spazio richiesto
// evita di scambiare `</postal>` per la chiusura di un `<p>`.
//
// Se un tag sfugge allo spoglio, il
// contenuto di uno script entrerebbe nel «testo visibile», producendo falsi
// allarmi su codice che nessuno legge.
//
// Il testo che vede una persona, UN BLOCCO ALLA VOLTA. Appiattire l'intera
// pagina in una stringa sola cuce insieme elementi che non si toccano e fabbrica
// frasi mai scritte: la riga scorrevole del footer finiva attaccata al copyright
// (`…PROMPT-E-VAI • ✳ © Marco Bellingeri — AI, Cloud…`), e tre statistiche vuote
// in celle separate diventavano `Sessions — Tokens — Cost`. Nessuna delle due
// esiste sulla pagina, ma il rilevatore le vedeva come prosa.
const BLOCCHI = /<\/(?:p|li|h[1-6]|dd|dt|div|section|td|th|figcaption|blockquote|a|title)(?:\s[^>]*)?>|<br(?:\s[^>]*)?\/?>/gi;

const blocciVisibili = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script(?:\s[^>]*)?>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style(?:\s[^>]*)?>/gi, ' ')
    .replace(CAMPI_AFFIANCATI, '</span>\n<span ')
    .replace(BLOCCHI, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

// Comoda per i test del rilevatore: un blocco solo, gia' ripulito.
const testoVisibile = (html) => blocciVisibili(html).join(' ');

// Cosa distingue una pausa da un separatore: quanta frase c'e' PRIMA. In
// `Radar — security world events` il trattino segue un'etichetta di una parola;
// in `l'autonomia si guadagna con tetti e guardrail — non si concede` segue otto
// parole, cioe' una frase, ed e' li' che il trattino sta facendo il lavoro della
// punteggiatura. La soglia e' cinque parole dall'inizio della frase o della cella.
//
// I confini di cella contano quanto il punto: nella riga delle licenze del Radar
// (`© 2026 Crown copyright — bollettini → …`) i separatori `·` e `→` spezzano il
// testo in campi, e quel trattino appartiene a un'attribuzione scritta
// dall'agenzia. Testo di terzi: non si riscrive, e infatti non deve nemmeno
// essere segnalato.
// Due <span> fratelli senza testo in mezzo non sono una frase: sono due campi
// affiancati, come l'etichetta e il sottotitolo di un pulsante portale
// (`Radar` + `security world events — chi attacca…`). Spezzare su OGNI </span>
// romperebbe le righe del terminale, che usano span inline dentro la prosa;
// spezzare solo sull'adiacenza separa i campi e lascia stare le frasi.
//
// Serve per poter scendere a quattro parole: con cinque passava
// `L'attribuzione non è cortesia — è la condizione della licenza`, che e'
// esattamente la pausa che questo test esiste per vietare.
const CAMPI_AFFIANCATI = /<\/span>\s*<span\b/gi;
const PAROLE_MINIME = 4;
const CONFINE = /[.!?·→|«»:;]/;

function pauseInFrase(testo) {
  const colpi = [];
  for (const m of testo.matchAll(/ — /g)) {
    const prima = testo.slice(0, m.index);
    const taglio = Math.max(...[...prima].map((c, i) => (CONFINE.test(c) ? i : -1)));
    // Parola = qualcosa con dentro una lettera. `© 2026 Crown copyright` sono
    // quattro token ma due parole: contarli tutti faceva scattare il gate sulla
    // riga delle licenze del Radar, che e' un'attribuzione e non una frase.
    const frase = prima.slice(taglio + 1).trim();
    const parolePrima = frase.split(/\s+/).filter((w) => /\p{L}/u.test(w));
    if (parolePrima.length < PAROLE_MINIME) continue;

    // Suffisso di sezione, non pausa: `<titolo lungo> — Magazine` chiude il
    // blocco con un'etichetta corta e maiuscola. Una pausa vera introduce il
    // resto della frase, quindi dopo il trattino c'e' altro testo minuscolo.
    const dopo = testo.slice(m.index + 3).trim();
    const parole = dopo.split(/\s+/).filter(Boolean);
    if (parole.length <= 3 && /^[A-Z0-9]/.test(dopo)) continue;

    colpi.push(m.index);
  }
  return colpi;
}

test('nessun trattino lungo usato come pausa dentro una frase, in tutto il sito', () => {
  const colpevoli = [];
  for (const file of paginePubblicate()) {
    for (const blocco of blocciVisibili(readFileSync(file, 'utf8'))) {
      for (const i of pauseInFrase(blocco)) {
        colpevoli.push(`${file.slice(DIST.length)}: ...${blocco.slice(Math.max(0, i - 60), i + 50)}...`);
      }
    }
  }
  assert.deepEqual(
    colpevoli,
    [],
    `trattino lungo in prosa (usa un punto, una virgola o i due punti):\n  ${colpevoli.join('\n  ')}`,
  );
});

// Il test sopra non deve poter passare per la ragione sbagliata: se la regex non
// combaciasse piu' con niente, o se `testoVisibile` restituisse una stringa
// vuota, resterebbe verde per sempre senza sorvegliare niente.
test('il rilevatore riconosce davvero un trattino in prosa', () => {
  const finto = '<p>questa e\' una frase abbastanza lunga da contare — e il trattino la spezza</p>';
  assert.equal(pauseInFrase(testoVisibile(finto)).length, 1);
});

test('il rilevatore lascia stare la tipografia da testata', () => {
  const testata =
    '<p>VOL. 01 — NO. 08</p>' +
    '<p>Bellingeri — AI, Cloud &amp; Security Edition</p>' +
    '<p>Radar — security world events</p>' +
    // riga delle licenze del Radar: attribuzione scritta dall'agenzia, non nostra
    '<p>NCSC UK · Open Government Licence v3.0 · © 2026 Crown copyright — bollettini → MITRE</p>';
  assert.deepEqual(pauseInFrase(testoVisibile(testata)), []);
});

test('il sito reso non e\' vuoto (o il test sopra non guarderebbe niente)', () => {
  const pagine = paginePubblicate();
  assert.ok(pagine.length > 20, `solo ${pagine.length} pagine: build incompleta?`);
  const primo = testoVisibile(readFileSync(pagine[0], 'utf8'));
  assert.ok(primo.length > 500, 'la pagina si e\' svuotata: il filtro sta mangiando tutto');
});
