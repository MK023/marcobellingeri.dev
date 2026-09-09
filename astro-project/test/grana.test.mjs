// La grana di `body::after` è un blend a schermo pieno, e finché è acceso ogni
// animazione che le passa sotto perde frame: è la scia che si vede aprendo la pila
// da edicola. Il rimedio è spegnere il blend per la durata del movimento
// (`html body.in-movimento::after`, in global.css), e lo accende uno script in
// BaseLayout.astro.
//
// Il guasto che questo test esiste per prendere è quello in cui sono cascato
// scrivendolo: la regola c'era, la classe si applicava, e il blend NON cambiava,
// perché di notte lo dichiara `html[data-mode="night"] body::after` — (0,1,3)
// contro (0,1,2). Nessun errore, nessun test rosso, e la scia esattamente come
// prima. Da qui la `html` davanti, che vale un elemento e pareggia il conto.
//
// Come css-compat.test.mjs: si legge il CSS *buildato* dagli <style> inline, non
// il sorgente, perché è quello che arriva al browser. Nel CSS buildato i
// pseudo-elementi hanno un due punti solo (`:after`): li riscrive il minificatore,
// ed è la forma che il browser riceve.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pagine = ['dist/it/index.html', 'dist/en/index.html'].map((f) => {
  const html = readFileSync(f, 'utf8');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  return { nome: f, html, css };
});

// Specificità come la conta la cascata: [id, classi+attributi+pseudo-classi,
// elementi+pseudo-elementi]. Basta per confrontare due selettori scritti a mano.
// I quattro pseudo-elementi a due punti singoli vanno normalizzati prima, o
// finiscono contati come pseudo-CLASSI e il confronto sbaglia colonna.
const PSEUDO_ELEMENTI = /:(?!:)(after|before|first-line|first-letter)\b/g;

function specificita(sel) {
  const s = sel.replace(PSEUDO_ELEMENTI, '::$1');
  const id = (s.match(/#[\w-]+/g) || []).length;
  const classi = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const elementi = (s.match(/(^|[\s>+~])[a-z][\w-]*|::[\w-]+/g) || []).length;
  return [id, classi, elementi];
}

const confronta = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

for (const { nome, css, html } of pagine) {
  test(`${nome}: la regola che sospende il blend è nel CSS buildato`, () => {
    assert.match(
      css,
      /html body\.in-movimento::?after\s*\{[^}]*mix-blend-mode:\s*normal/,
      'manca `html body.in-movimento::after{mix-blend-mode:normal}`: la scia torna',
    );
  });

  test(`${nome}: la sospensione vince su ogni altra regola di blend su body::after`, () => {
    // Il selettore si LEGGE dal CSS buildato, non si scrive qui: un test che
    // confronta una stringa sua non si accorge se la regola vera è cambiata.
    const trovata = css.match(/([^{}]*in-movimento[^{}]*)\{[^}]*mix-blend-mode/);
    assert.ok(trovata, 'nessuna regola in-movimento con mix-blend-mode nel CSS buildato');
    const sospensione = trovata[1].trim();
    const mia = specificita(sospensione);

    // Ogni altro selettore che dichiara un mix-blend-mode su body::after.
    const rivali = [...css.matchAll(/([^{}]*body[^{}]*::?after)\s*\{([^}]*)\}/g)]
      .filter((m) => /mix-blend-mode/.test(m[2]))
      .map((m) => m[1].trim())
      .filter((s) => !s.includes('in-movimento'));

    assert.ok(rivali.length > 0, 'nessuna regola di blend su body::after: la grana è sparita?');

    // A parità di specificità decide l'ORDINE, e qui il pareggio c'è davvero:
    // `html body.in-movimento::after` e `html[data-mode="night"] body::after`
    // sono entrambe (0,1,3). Fermarsi alla specificità lascerebbe passare una
    // regola scritta dentro un componente: gli stili scoped di Astro finiscono
    // nel CSS buildato MOLTO dopo global.css, quindi vincerebbero loro, la grana
    // continuerebbe a fondersi e questo test resterebbe verde.
    // `lastIndexOf` e non `indexOf`: fra regole a pari specificità vince
    // l'ULTIMA dichiarazione, e lo stesso selettore può comparire più volte nel
    // CSS buildato. Cercando la prima, una copia aggiunta in coda passerebbe
    // inosservata — che è esattamente il caso da prendere.
    const posizioneSospensione = css.lastIndexOf(sospensione);

    for (const r of rivali) {
      const cmp = confronta(mia, specificita(r));
      assert.ok(
        cmp >= 0,
        `\`${r}\` (${specificita(r)}) è più specifica di \`${sospensione}\` (${mia}): ` +
          'la sospensione perde in silenzio e la scia resta',
      );
      if (cmp === 0) {
        assert.ok(
          posizioneSospensione > css.lastIndexOf(r),
          `\`${r}\` pareggia la specificità di \`${sospensione}\` ma sta DOPO nel CSS: ` +
            'vince lei, la sospensione perde in silenzio e la scia resta',
        );
      }
    }
  });

  test(`${nome}: lo script che accende la classe è nella pagina`, () => {
    // Si guarda DENTRO gli <script>, non in tutta la pagina: `in-movimento`
    // compare anche nel CSS inline e `data-newsstand` anche nel markup della
    // pila, quindi cercarli nell'HTML intero passava pure cancellando lo script.
    const script = [...html.matchAll(/<script(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]);

    assert.ok(
      script.some((js) => js.includes('in-movimento') && js.includes('pointerenter')),
      'nessuno script accende `in-movimento` sull\'ingresso del puntatore: ' +
        'la regola CSS c\'è ma non la attiva nessuno, e la scia resta',
    );
    assert.ok(
      script.some((js) => js.includes('data-newsstand')),
      'nessuno script aggancia più le pile: nessuno sospende il blend',
    );
  });
}
