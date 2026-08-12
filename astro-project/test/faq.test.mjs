// Le coppie domanda/risposta dello schema FAQPage si ESTRAGGONO dal corpo
// dell'articolo, non si scrivono nel frontmatter. Il motivo e' che uno schema
// che non corrisponde al testo visibile e' spam per un motore di ricerca e
// rumore per un modello: duplicare la risposta in due posti significa che prima
// o poi divergono, e a divergere e' sempre quello che nessuno rilegge.
//
// Nota onesta sul ritorno: dall'agosto 2023 i rich result FAQ di Google valgono
// solo per siti gov/health. Qui il bersaglio e' l'AEO — dare a un modello
// coppie Q/A gia' separate invece di prosa da spezzare da solo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faqPairs } from '../src/lib/faq.ts';

test('faq: un H2 che e\' una domanda diventa una coppia con il paragrafo dopo', () => {
  const md = [
    'Apertura.',
    '',
    '## Come si verificano gli header dal vivo?',
    '',
    'Con una richiesta HEAD in stessa origine, letta dalla pagina stessa.',
    '',
    'Un secondo paragrafo che non entra nella risposta.',
  ].join('\n');
  assert.deepEqual(faqPairs(md), [{
    question: 'Come si verificano gli header dal vivo?',
    answer: 'Con una richiesta HEAD in stessa origine, letta dalla pagina stessa.',
  }]);
});

test('faq: un H2 che non e\' una domanda resta fuori', () => {
  const md = '## Il setup\n\nQui non si chiede niente.\n';
  assert.deepEqual(faqPairs(md), []);
});

test('faq: solo gli H2 — H1 e H3 non fanno coppia', () => {
  const md = [
    '# Che titolo e\' questo?', '', 'Non e\' una FAQ.', '',
    '### Sotto-domanda?', '', 'Nemmeno questa.', '',
  ].join('\n');
  assert.deepEqual(faqPairs(md), []);
});

test('faq: risposta su piu\' righe -> una riga sola', () => {
  const md = '## Perche\' due posti?\n\nPerche\' l\'header\ne il meta servono a due cose diverse.\n';
  assert.deepEqual(faqPairs(md)[0].answer, "Perche' l'header e il meta servono a due cose diverse.");
});

test('faq: il markdown inline sparisce dalla risposta', () => {
  const md = '## Che cosa serve?\n\nServe **tool_choice** con `type: "tool"`, come [qui](https://x.dev).\n';
  assert.deepEqual(faqPairs(md)[0].answer, 'Serve tool_choice con type: "tool", come qui.');
});

test('faq: una domanda seguita da codice o da una lista non fa coppia', () => {
  const conCodice = '## Come si scrive?\n\n```js\nconst a = 1;\n```\n';
  const conLista = '## Quali sono?\n\n- il primo\n- il secondo\n';
  assert.deepEqual(faqPairs(conCodice), [], 'un blocco di codice non e\' una risposta secca');
  assert.deepEqual(faqPairs(conLista), [], 'un elenco non e\' una risposta secca');
});

test('faq: una domanda in fondo al file senza risposta non fa coppia', () => {
  assert.deepEqual(faqPairs('Testo.\n\n## E poi?\n'), []);
});

test('faq: un `## ` dentro un blocco di codice non e\' un titolo', () => {
  const md = [
    '## Vera domanda?', '', 'Vera risposta.', '',
    '```sh', '## Finta domanda?', 'echo non sono un titolo', '```', '',
  ].join('\n');
  const pairs = faqPairs(md);
  assert.equal(pairs.length, 1, 'il markdown dentro un fence non e\' markdown');
  assert.equal(pairs[0].question, 'Vera domanda?');
});

test('faq: input non stringa -> nessuna coppia, nessun throw', () => {
  assert.deepEqual(faqPairs(undefined), []);
  assert.deepEqual(faqPairs(null), []);
});
