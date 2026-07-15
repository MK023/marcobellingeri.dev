---
lang: it
title: "Il mio portfolio fa l'audit dei propri header di sicurezza dal vivo, davanti a te"
date: 2026-07-15
description: "Una card del portfolio che fa una richiesta HEAD in stessa origine per controllare dal vivo i propri header di sicurezza, e perché la vera CSP deve vivere in due posti."
tags: [security, webdev, astro]
---

Il mio portfolio ha una sezione che esegue `curl -I` su se stesso mentre lo guardi. Non uno screenshot degli header che ho incollato l'anno scorso e poi dimenticato di aggiornare. La pagina fa il fetch del proprio URL, ne legge gli header della risposta e stampa ognuno come attivo o mancante, lì nella sezione. Se un giorno mando in produzione una build che perde un header, la pagina fa la spia su di me alla prima persona che la carica.

Voglio spiegare come funziona, e poi la parte che mi ha costretto a riscriverla: la vera Content-Security-Policy non sta in un posto solo. È divisa in due. Mostrare solo l'header avrebbe raccontato metà della verità, su una pagina il cui senso è proprio non farlo.

## Il setup

Il sito è costruito con Astro, output completamente statico, servito da Cloudflare. Nella pagina c'è una sezione col titolo che sembra un comando da shell. Sotto, l'elenco degli header di sicurezza che mi aspetto l'edge mandi. L'elenco atteso non è hardcoded nello script, arriva dal componente:

```astro
const expected = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
];
```

Stessa origine, quindi il browser può rileggere gli header della risposta. Tutto qui il trucco. Un `fetch` verso qualsiasi altro sito si vedrebbe nascondere gli header dalla CORS, ma una pagina può guardare se stessa.

## Cosa ho costruito davvero

Lo script lato client fa una richiesta HEAD all'URL corrente e legge gli header dalla risposta:

```js
fetch(window.location.href, { method: 'HEAD' })
  .then((res) => {
    box.replaceChildren();
    expected.forEach((name) => box.appendChild(row(name, res.headers.get(name))));
    box.appendChild(row('Content-Security-Policy (meta)', metaCsp && foldHashes(metaCsp)));
  })
```

HEAD, non GET, perché mi interessano solo gli header e non c'è motivo di riscaricare il body. Per ogni header atteso chiama `res.headers.get(name)`. Se il valore c'è, la riga risulta attiva e lo stampa. Se è null, la riga passa a mancante e prende uno stile diverso. Nessuna allowlist di valori "buoni", nessun voto. Mostra quello che è tornato indietro.

Un dettaglio a cui tengo più di quanto probabilmente meriti: ogni cella è costruita con `document.createElement` e `textContent`, mai `innerHTML`. Questa è una sezione sugli header di sicurezza. Se mi faccio XSS da solo sulla mia sezione dedicata alla sicurezza, infilando il valore di un header dritto nel DOM come HTML, l'imbarazzo me lo sono meritato tutto. Quindi i valori degli header sono testo, e solo testo.

Il sito ha anche preso A+ sull'HTTP Observatory di Mozilla, e l'hero linka direttamente a quella scansione, così puoi rifarla tu invece di credermi sulla parola per il badge. La card dal vivo e lo scanner esterno controllano la stessa cosa da due lati.

## L'inghippo: la CSP sta in due posti

Qui la cosa si fa interessante, ed è dove ho dovuto tornare indietro e cambiare la card.

Quando l'ho scritta la prima volta, la card leggeva i cinque header dalla risposta e si fermava lì. Pulita, fatta. Solo che la Content-Security-Policy che protegge davvero la pagina non sta tutta in quell'header. Astro calcola gli hash dei propri script e stili in fase di build e li scrive dentro una CSP `<meta http-equiv>`. Può farlo solo in build, perché è lì che conosce gli hash. Quindi la parte che conta della mia policy, lo `script-src` pieno di hash `sha256-`, vive nell'HTML, non nell'header che la card stava leggendo.

Perché non mettere tutta la CSP nel file `_headers` di Cloudflare e chiuderla lì? Perché a quel punto il browser applica entrambe le policy come intersezione, e si fanno la guerra. Il mio file `_headers` dice esattamente questo, in un commento che ho lasciato al me del futuro:

```
# La CSP non sta qui: la genera Astro (`security.csp` in astro.config.mjs) come
# <meta http-equiv>, perché solo in build può calcolare gli hash dei propri script.
# Se una CSP vivesse anche qui, le due policy verrebbero applicate entrambe come
# intersezione: un `script-src 'self'` in questo file annullerebbe gli hash del meta
# e rimetterebbe il sito offline.
```

Uno `script-src 'self'` nell'header andrebbe in intersezione con lo `script-src` basato sugli hash nel meta, e il risultato blocca proprio gli script che gli hash dovevano permettere. Sito offline.

Quindi c'è esattamente una direttiva CSP che deve stare nell'header, ed è quella che un tag `<meta>` non ha il permesso di esprimere: `frame-ancestors`. Da specifica, `frame-ancestors` dentro un `<meta>` viene ignorato, quindi deve essere un vero header di risposta. È tutto qui il contenuto dell'header CSP sull'edge:

```
Content-Security-Policy: frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Il che vuol dire che la mia card originale, leggendo solo gli header, avrebbe stampato tutta fiera una Content-Security-Policy di `frame-ancestors 'none'` e si sarebbe messa il cuore in pace. Tecnicamente vero. E anche una bugia per omissione, perché nascondeva la parte della policy che fa la maggior parte del lavoro.

Quindi la card legge anche il meta. Tira fuori dal DOM il contenuto di `<meta http-equiv="content-security-policy">` e lo stampa come seconda riga CSP. L'elenco di hash è lungo decine di voci e inutile da guardare, quindi ripiega ogni sequenza di hash in un conteggio:

```js
const foldHashes = (csp) =>
  csp.replace(/(?:'sha\d{3}-[A-Za-z0-9+/=]+'\s*)+/g, (run) => {
    const n = run.match(/'sha\d{3}-/g)?.length ?? 0;
    return `${n} hash `;
  });
```

Il conteggio è letto dalla policy vera sulla pagina, non è un numero che ho scritto io. Se domani Astro emette uno stile inline in più, il numero sale da solo.

## Quanto mi è costato, detto onestamente

Sono un dev mid-level. Non sapevo, partendo, che `frame-ancestors` fosse cieco al meta, né che due CSP si intersecano invece di averne una che vince. Le ho imparate entrambe rompendo il sito. Nella mia config di Astro c'è un hash manuale per uno script inline, lo script del tema anti-flash che gira prima del primo paint, perché Astro lascia stare gli script `is:inline` e non me li calcola l'hash:

```js
scriptDirective: {
  resources: ["'self'", 'https://challenges.cloudflare.com'],
  hashes: ['sha256-WV81hIAeXjEdgj/cFIXtOf53g8pIquCjmXQuCHOehlw='],
},
```

Se tocco quello script e mi dimentico l'hash, `npm run test:csp` fallisce e mi dice il nuovo hash da incollare. Quel test esiste perché la discrepanza l'ho spedita una volta, e lo script del tema è finito bloccato in produzione.

La card non è furba. È una richiesta HEAD, cinque chiamate `.get()` e un `querySelector`. Quello che mi piace è che non può andare fuori sincrono. Un README che dichiara "impostiamo header di sicurezza stretti" invecchia nel momento in cui qualcuno modifica una config. Questa sezione ri-deriva l'affermazione dalla risposta viva ogni volta che la pagina si carica, e legge tutte e due le metà di una policy che vive in due file, perché leggerne una sola renderebbe la pagina una piccola bugiarda proprio sull'unico argomento su cui dovrebbe essere onesta.

Se vuoi provare il pattern: HEAD in stessa origine, leggi gli header, leggi anche la CSP del meta se ce l'hai, costruisci il DOM con `textContent`. È tutto qui.
