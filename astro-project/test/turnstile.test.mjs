// Turnstile: chi mostra il widget deve anche saper caricare lo script.
// Gira su dist/, quindi presuppone `npm run build`. Nessun framework: node --test.
//
// IL CASO CHE QUESTO TEST ESISTE PER PRENDERE. Il tag <script src=".../api.js">
// stava in Servizi.astro, cioè su home e privacy, mentre il terminale (e il suo
// widget `ask-turnstile`) sta in BaseLayout, cioè su tutte e 39 le pagine. Sulle
// altre 37 `window.turnstile` non esisteva e il comando `ask` moriva prima di
// partire — con build e test verdi, perché nessuno guardava il JS delle callback.
// L'invariante è quella violata allora: se in pagina c'è un widget Turnstile,
// in pagina deve arrivare anche il codice che carica l'API.
//
// Il secondo test presidia il verso opposto, ed è una promessa scritta nella
// privacy: lo script NON deve partire da solo. privacy.astro dichiara che
// Turnstile tratta l'IP «se usi il form» e «se fai una domanda»; un tag statico
// rimesso in pagina renderebbe quel testo falso senza rompere niente altro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const API = 'turnstile/v0/api.js';

const htmlSotto = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((voce) =>
    voce.isDirectory()
      ? htmlSotto(join(dir, voce.name))
      : voce.name.endsWith('.html')
        ? [join(dir, voce.name)]
        : [],
  );

const pagine = htmlSotto('dist');

// I moduli entry della pagina, più i chunk che quegli entry importano. Un solo
// livello di discesa basta e serve: il loader è un modulo condiviso, quindi il
// bundler lo stacca in un chunk suo e negli entry resta solo l'import.
function jsRaggiungibile(fileHtml) {
  const html = readFileSync(fileHtml, 'utf8');
  const entry = [...html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
  return entry.flatMap((src) => {
    const percorso = join('dist', src.slice(1));
    const codice = readFileSync(percorso, 'utf8');
    const importati = [...codice.matchAll(/from"(\.\/[^"]+\.js)"/g)].map((m) =>
      readFileSync(join(dirname(percorso), m[1]), 'utf8'),
    );
    return [codice, ...importati];
  });
}

test('ogni pagina con un widget Turnstile riceve anche il loader', () => {
  const conWidget = pagine.filter((f) => readFileSync(f, 'utf8').includes('class="cf-turnstile"'));

  // Se il selettore cambia e non trova più niente, il test passerebbe a vuoto.
  assert.ok(conWidget.length > 0, 'nessuna pagina con un widget: selettore da aggiornare');

  const orfane = conWidget.filter((f) => !jsRaggiungibile(f).some((js) => js.includes(API)));
  assert.deepEqual(orfane, [], 'widget Turnstile senza il codice che carica api.js');
});

test('nessuna pagina carica lo script Turnstile da sola', () => {
  const eager = pagine.filter((f) => readFileSync(f, 'utf8').includes(API));
  assert.deepEqual(eager, [], "api.js in un tag statico: si carica su richiesta, non all'apertura della pagina");
});

// I due test qui sotto presidiano il percorso d'ERRORE del widget, che i primi due
// non guardano: quelli verificano che il codice per caricare Turnstile arrivi in
// pagina, non cosa succede quando la challenge fallisce.
//
// IL CASO CHE ESISTONO PER PRENDERE. Per far arrivare a Sentry un fallimento
// gestito, le callback lanciavano `throw` dentro un setTimeout: l'unica presa
// disponibile, perché l'init pigro del SDK non esportava niente di chiamabile. Un
// fallimento previsto arrivava così come eccezione NON gestita — `handled: no`,
// con lo stack del setTimeout al posto della riga vera — e si mescolava ai crash
// dei visitatori. La presa esplicita ora c'è (`window.__SEGNALA_SENTRY__`, in
// sentry.client.config.js); questi test impediscono che il vecchio giro torni,
// perché tornerebbe verde: `throw` in un task a parte non rompe nessun test.

const CANALE = '__SEGNALA_SENTRY__';

test('il fallimento di Turnstile si segnala, non si lancia', () => {
  const conWidget = pagine.filter((f) => readFileSync(f, 'utf8').includes('class="cf-turnstile"'));
  assert.ok(conWidget.length > 0, 'nessuna pagina con un widget: selettore da aggiornare');

  // Il messaggio sopravvive alla minificazione (è una stringa letterale); il
  // `throw` che lo portava no, se non c'è più. Si cerca la coppia, non il verbo:
  // `throw` da solo è ovunque, il messaggio da solo è legittimo.
  const lanciate = conWidget.filter((f) =>
    jsRaggiungibile(f).some((js) => /throw[^;]{0,60}turnstile: error-callback/.test(js)),
  );
  assert.deepEqual(lanciate, [], 'il fallimento Turnstile torna a viaggiare come eccezione non gestita');

  const mute = conWidget.filter((f) => !jsRaggiungibile(f).some((js) => js.includes(CANALE)));
  assert.deepEqual(mute, [], `widget Turnstile senza ${CANALE}: un guasto sul gate non arriverebbe a nessuno`);
});

// L'invariante e' quella che una svista rimuoverebbe per prima, ed e' la piu' cara:
// il form tace il PRIMO fallimento per lasciar lavorare il ritentativo automatico
// di Turnstile (`retry: auto`, `retry-interval` 8000 ms). Ma solo sui codici che
// la doc marca `Retry: Yes`: su un `110200` (dominio non consentito) o un `400070`
// (sitekey disabilitata) il secondo colpo non arriva MAI, e tacere il primo
// lascerebbe il bottone su «INVIO…» per sempre.
//
// LA PRIMA VERSIONE DI QUESTO TEST BLOCCAVA LA RISPOSTA SBAGLIATA, ed e' il motivo
// per cui ora elenca i codici invece di cercare una regex a memoria: cercava
// `/^(300|600)/`, cioe' esattamente il filtro troppo stretto che il codice aveva.
// La tabella ufficiale marca `Retry: Yes` anche su 110600 (challenge scaduta),
// 110620 (interazione scaduta) e 200500 (iframe non caricato) — le condizioni di
// una rete ballerina, cioe' il visitatore che il ritentativo esiste per non
// perdere. Un test che ricopia l'assunzione del codice non la verifica: la
// cementa.
test('il ritentativo silenzioso copre tutti i codici che la doc dichiara ritentabili', () => {
  const conForm = pagine.filter((f) => readFileSync(f, 'utf8').includes('id="svc-turnstile"'));
  assert.ok(conForm.length > 0, 'nessuna pagina col form contatti: selettore da aggiornare');

  // developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/
  // (pagina aggiornata al 05-05-2026). Le due famiglie generiche stanno nel
  // bundle come prefissi, i tre codici pieni come letterali.
  const RITENTABILI = ['300', '600', '110600', '110620', '200500'];
  for (const codice of RITENTABILI) {
    const senza = conForm.filter((f) => !jsRaggiungibile(f).some((js) => js.includes(codice)));
    assert.deepEqual(senza, [], `il filtro dei ritentabili non nomina ${codice}: un guasto transiente fallisce al primo colpo`);
  }

  // E il verso opposto, che e' quello che il test vecchio non guardava: un codice
  // di CONFIGURAZIONE non deve entrare nell'elenco, o un guasto nostro resterebbe
  // ad aspettare un ritentativo che non arriva.
  const NON_RITENTABILI = ['110100', '110110', '110200', '200100', '400020', '400070'];
  for (const codice of NON_RITENTABILI) {
    const conCodice = conForm.filter((f) => jsRaggiungibile(f).some((js) => js.includes(`|${codice}`)));
    assert.deepEqual(conCodice, [], `${codice} e' entrato fra i ritentabili: un guasto di configurazione aspetterebbe invano`);
  }
});

// `data-timeout-callback` e' il percorso che Turnstile usa per dire «la challenge
// interattiva non e' stata risolta», ed e' SEPARATO da `data-error-callback`: un
// widget che dichiara solo la seconda non viene avvisato del primo caso, e il
// bottone resta su «INVIO…» senza che nessuno chiuda la pratica.
test('ogni widget Turnstile dichiara anche la timeout-callback', () => {
  const conWidget = pagine.filter((f) => readFileSync(f, 'utf8').includes('class="cf-turnstile"'));
  assert.ok(conWidget.length > 0, 'nessuna pagina con un widget: selettore da aggiornare');

  // Per WIDGET, non per pagina: NeonTerminal sta in BaseLayout e Servizi solo su
  // alcune, quindi contare le pagine nasconderebbe il widget scoperto dietro
  // quello sano.
  const scoperte = conWidget.filter((f) => {
    const html = readFileSync(f, 'utf8');
    return (html.match(/class="cf-turnstile"/g) || []).length
      !== (html.match(/data-timeout-callback=/g) || []).length;
  });
  assert.deepEqual(scoperte, [], 'widget Turnstile senza data-timeout-callback: la challenge non risolta non avvisa nessuno');
});

// I modi di morire sono problemi diversi con risposte diverse, quindi devono
// essere issue diverse. Con un messaggio unico una challenge abbandonata finiva
// sotto un'issue intitolata a una error-callback che non era scattata.
test('i modi di fallire arrivano a Sentry distinti', () => {
  const conForm = pagine.filter((f) => readFileSync(f, 'utf8').includes('id="svc-turnstile"'));
  assert.ok(conForm.length > 0, 'nessuna pagina col form contatti: selettore da aggiornare');

  const attesi = [
    'turnstile: error-callback (contact)',
    'turnstile: timeout-callback (contact)',
    'turnstile: ritentativo mai arrivato (contact)',
    'turnstile: timeout-callback (ask)',
  ];
  for (const messaggio of attesi) {
    const senza = conForm.filter((f) => !jsRaggiungibile(f).some((js) => js.includes(messaggio)));
    assert.deepEqual(senza, [], `manca la segnalazione «${messaggio}»`);
  }
});

