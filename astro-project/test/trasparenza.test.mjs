// Trasparenza: la pagina /ai (art. 50 AI Act) e security.txt (RFC 9116).
// Sono due promesse verificabili — "questi sono TUTTI i sistemi IA" e "qui si
// segnalano le vulnerabilità" — e una promessa senza guardia invecchia da sola:
// la pagina elencava 3 sistemi su 4 mentre il giudice era già in produzione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const pagina = (lang) =>
  readFileSync(new URL(`../dist/${lang}/ai/index.html`, import.meta.url).pathname, 'utf8');

// I sistemi che usano davvero un modello. Se ne nasce un altro nell'engine e non
// entra qui dentro, questo test non se ne accorge — ma la lista è corta e la
// pagina è il posto dove si guarda: tenerla allineata è il minimo sindacale.
const SISTEMI = {
  it: ['terminale', 'magazine mensile', 'giudice del magazine', 'monitor di visibilità'],
  en: ['terminal', 'monthly magazine', 'magazine judge', 'visibility monitor'],
};

for (const lang of ['it', 'en']) {
  test(`/ai ${lang}: elenca tutti i sistemi che usano un modello, giudice incluso`, () => {
    const html = pagina(lang).toLowerCase();
    for (const s of SISTEMI[lang]) {
      assert.ok(html.includes(s.toLowerCase()), `${lang}: la pagina AI Act non elenca "${s}"`);
    }
    // il giudice è verificabile dove vive davvero: nel workflow del repo
    assert.ok(html.includes('magazine-judge.yml'), `${lang}: il giudice non linka la sua prova`);
  });

  test(`/ai ${lang}: dichiara che il Radar NON usa l'IA`, () => {
    const html = pagina(lang);
    // il globo è il posto dove un lettore si aspetta un modello: il silenzio
    // qui si legge come reticenza, non come assenza
    assert.match(html, /Radar/);
    assert.match(html, lang === 'it' ? /non usa l’IA|non usa l'IA/ : /uses no AI/);
  });
}

test('security.txt: esiste, ha i campi obbligatori RFC 9116 ed è servito dalla build', () => {
  const p = new URL('../dist/.well-known/security.txt', import.meta.url).pathname;
  assert.ok(existsSync(p), 'manca dist/.well-known/security.txt');
  const txt = readFileSync(p, 'utf8');
  for (const campo of ['Contact:', 'Expires:', 'Canonical:', 'Policy:']) {
    assert.ok(txt.includes(campo), `security.txt senza ${campo}`);
  }
  // il contatto è lo stesso di SECURITY.md, letto DAVVERO da SECURITY.md:
  // due indirizzi diversi = uno morto (e un test che hardcoda non lo vedrebbe)
  const policy = readFileSync(new URL('../../SECURITY.md', import.meta.url).pathname, 'utf8');
  const contatto = policy.match(/\*\*([^*\s]+@[^*\s]+)\*\*/)?.[1];
  assert.ok(contatto, 'SECURITY.md non dichiara più un contatto in grassetto');
  assert.ok(txt.includes(contatto), `security.txt non contiene ${contatto} (il contatto di SECURITY.md)`);
});

test('security.txt: Expires non è passata (RFC 9116: scaduto = non valido)', () => {
  const txt = readFileSync(new URL('../dist/.well-known/security.txt', import.meta.url).pathname, 'utf8');
  const scadenza = Date.parse(txt.match(/^Expires:\s*(.+)$/m)[1].trim());
  assert.ok(!Number.isNaN(scadenza), 'Expires non è una data ISO valida');
  assert.ok(
    scadenza > Date.now(),
    'security.txt è scaduto: rinnova la data (è un promemoria voluto, non un gate rotto — il fix è una riga)',
  );
});

// La disclosure IA del terminale: l'art. 50 la vuole al PRIMO contatto, e il
// terminale e' l'unico posto del sito dove una persona parla con un modello.
// Senza guardia sparirebbe in silenzio: gli attributi si possono togliere dal
// markup e nessun altro test se ne accorgerebbe.
//
// La lingua conta quanto la presenza. Il terminale stampa in italiano per scelta,
// ma un avviso legale che il lettore non capisce non e' un avviso: qui si
// verifica che segua la lingua della pagina, insieme al link che porta a /ai.
for (const [lang, atteso] of [['it', 'IA'], ['en', 'AI']]) {
  test(`terminale ${lang}: avvisa che risponde un'IA, nella lingua della pagina`, () => {
    const html = readFileSync(
      new URL(`../dist/${lang}/index.html`, import.meta.url).pathname,
      'utf8',
    );
    const nota = /data-ai-note="([^"]+)"/.exec(html)?.[1] ?? '';
    const href = /data-ai-href="([^"]+)"/.exec(html)?.[1] ?? '';
    const link = /data-ai-link="([^"]+)"/.exec(html)?.[1] ?? '';

    assert.ok(nota.length > 30, `avviso assente o troppo corto: ${JSON.stringify(nota)}`);
    assert.match(nota, new RegExp(atteso), `l'avviso non nomina l'IA in ${lang}: ${nota}`);
    assert.match(nota, /Claude/, "l'avviso deve dire QUALE modello risponde");
    assert.equal(href, `/${lang}/ai/`, 'il link deve portare alla trasparenza nella stessa lingua');
    assert.ok(link.length > 3, `etichetta del link assente: ${JSON.stringify(link)}`);
  });
}
