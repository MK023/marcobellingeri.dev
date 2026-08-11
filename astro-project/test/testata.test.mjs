// La sigla della testata (VOL/NO) nella UtilityBar. Era una stringa scritta a
// mano in i18n/ui.ts: l'11 agosto 2026 il sito diceva ancora "NO. 07", perché
// nessuno la aggiorna a mezzanotte del primo del mese. Qui la sigla si calcola,
// e questi test sono la ragione per cui non tornerà a essere una costante.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { siglaTestata } from '../src/lib/testata.ts';

test('siglaTestata: il numero è il mese corrente, con lo zero davanti', () => {
  assert.equal(siglaTestata(new Date('2026-08-11T12:00:00Z')), 'VOL. 01 — NO. 08');
  assert.equal(siglaTestata(new Date('2026-12-31T12:00:00Z')), 'VOL. 01 — NO. 12');
  // Le 23:00 UTC del 31 dicembre sono già il 1° gennaio a Roma: il capodanno
  // della testata è quello italiano, e il volume non scatta comunque (luglio).
  assert.equal(siglaTestata(new Date('2026-12-31T23:00:00Z')), 'VOL. 01 — NO. 01');
});

test('siglaTestata: il volume scatta a un anno dalla nascita del sito, non a Capodanno', () => {
  // Il sito è live dal 10 luglio 2026: gennaio 2027 è ancora il primo volume.
  assert.equal(siglaTestata(new Date('2027-01-15T12:00:00Z')), 'VOL. 01 — NO. 01');
  assert.equal(siglaTestata(new Date('2027-06-30T12:00:00Z')), 'VOL. 01 — NO. 06');
  assert.equal(siglaTestata(new Date('2027-07-01T12:00:00Z')), 'VOL. 02 — NO. 07');
});

test('siglaTestata: il mese si legge a Roma, non a UTC', () => {
  // 31 agosto 23:30 UTC è già il 1° settembre in Italia: la testata del sito
  // segue il fuso di chi lo scrive, come l'orologio della barra.
  assert.equal(siglaTestata(new Date('2026-08-31T23:30:00Z')), 'VOL. 01 — NO. 09');
});

test('siglaTestata: senza argomento usa adesso e resta ben formata', () => {
  assert.match(siglaTestata(), /^VOL\. \d{2} — NO\. (0[1-9]|1[0-2])$/);
});
