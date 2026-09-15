---
lang: it
title: "Node 22.22 esegue TypeScript. Il Node 22.22 di Ubuntu no."
date: 2026-09-16
description: "Il type stripping è attivo di default da Node 22.18. Sul mio server Ubuntu i test che importano file .ts fallivano mentre la CI passava, a parità di versione major. La versione era giusta. La build no."
tags: [node, typescript, ubuntu, devops]
edicola: "Il Node senza TypeScript"
---

Nel repository del mio sito ci sono quattro file di test che importano TypeScript direttamente. `faq.test.mjs` carica `src/lib/faq.ts`, e altri tre fanno lo stesso con i loro moduli. In mezzo non c'è né una build né un loader: lo script è `node --test "test/*.test.mjs"`, e da Node 22.18.0 il type stripping è attivo di default, quindi Node toglie i tipi ed esegue quello che resta.

In CI quei test passano. Il workflow chiede ad `actions/setup-node` la `node-version: "22"`, e le ultime esecuzioni su `main` sono verdi.

Sul mio server Ubuntu, con Node 22.22.1, falliscono tutti e quattro prima ancora di arrivare a un'asserzione:

```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for .../src/lib/faq.ts
```

La 22.22.1 è più recente della 22.18.0, quindi sulla carta la funzionalità c'è. **Il numero di versione era giusto. Dietro c'era una build diversa.**

## Stessa versione, binario diverso

Node sa dirti se toglie i tipi. La documentazione della v22 dice che `process.features.typescript` vale `"strip"` di default, `"transform"` con `--experimental-transform-types`, e `false` se Node parte con `--no-experimental-strip-types`.

Quel flag non l'avevo passato:

```
$ /usr/bin/node --version
v22.22.1
$ /usr/bin/node -p 'process.features.typescript'
false
```

Quel `node` viene dal pacchetto `nodejs` di Ubuntu, versione `22.22.1+dfsg+~cs22.19.15-1ubuntu1`. Chiedere la funzionalità in modo esplicito non la riattiva:

```
$ /usr/bin/node --experimental-strip-types t.ts
node:internal/util:226
    throw new ERR_NO_TYPESCRIPT();
```

Per escludere che dipendesse dalla versione, ho scaricato la build ufficiale 22.22.1 da nodejs.org, l'ho verificata con `SHASUMS256.txt` e le ho fatto la stessa domanda. Ha risposto `strip` ed eseguito lo stesso file `.ts` senza problemi.

## Dov'è finito TypeScript

Il changelog del pacchetto spiega gran parte della storia. La voce di dicembre 2024, `22.12.0+dfsg-1`, dice:

> dfsg-exclude amaro, build without it - it requires swc. This disables the ability to execute TypeScript files using the --experimental-strip-types flag.

La voce di novembre 2025, `22.21.1+dfsg+~cs22.19.0-1`, dice: "we build without-amaro for now, disable strip-types".

La voce Debian di marzo 2026, confluita nella versione che ho io, dice: "Drop 'no amaro' patch, solved upstream". La build risponde comunque `false`, e dice anche come è stata compilata:

```
$ /usr/bin/node -p 'process.config.variables.node_use_amaro'
false
```

La build ufficiale 22.22.1 stampa `true`.

Il changelog non dice cosa abbia cambiato quel "solved upstream". I miei test vedono solo quello che fa la build.

## Perché la CI non se n'è mai accorta

Il README di `setup-node` dice che l'action controlla prima la tool cache del runner, poi prende le versioni LTS dalle release di `actions/node-versions` e, se non le trova, ripiega sul download da nodejs.org. Nessuna di queste fonti è il pacchetto di Ubuntu. I quattro file di test in CI passano, quindi il Node che gira lì toglie i tipi. Quello sul mio server no, ed entrambi riportano la versione major 22.

È così che lo stesso repository può essere verde in CI e rosso sul mio server senza che cambi una riga di codice.

## La correzione

Ho estratto il tarball ufficiale di Node 22.23.2 in `/usr/local`. `/usr/local/bin` viene prima di `/usr/bin` nel `PATH`, quindi `node` adesso punta alla build ufficiale, con npm 10.9.8 incluso.

Il pacchetto di Ubuntu l'ho lasciato installato. Su questa macchina 15 pacchetti installati dipendono da `nodejs`: `handlebars` e 14 librerie `node-*`. Toglierlo per avere il `node` giusto avrebbe voluto dire litigare con apt per cose che con il mio sito non c'entrano niente.

Stessi quattro file, binario ufficiale:

```
# tests 42
# pass 42
# fail 0
```

## Chiedi a Node cosa sa fare

Se un progetto conta sul type stripping, il controllo non è `node --version`. È questo:

```
node -p 'process.features.typescript'
```

Sulle due build viste sopra stampa `strip` quando il type stripping funziona e `false` quando no, qualunque cosa dica il numero di versione. Va in uno script di setup, accanto al controllo della versione, perché sul mio server era proprio quello a passare.
