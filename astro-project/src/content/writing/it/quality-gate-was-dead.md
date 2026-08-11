---
lang: it
title: "Il mio quality gate non era severo. Era morto."
date: 2026-08-11
description: "Un gate LLM-as-a-judge bocciava ogni PR di contenuto da settimane. Sembrava un'asticella alta. Era un 400 dell'API, e il messaggio d'errore nominava metà del problema."
tags: [testing, ai, devops, api]
edicola: "Il gate morto"
---

Nella mia CI c'è un job che si chiama `judge`. Legge il numero mensile che scrive la pipeline dei contenuti, lo valuta su una rubrica di cinque criteri e blocca il merge se qualcosa torna a 2 su 5 o meno. Un LLM che dà i voti a un LLM, con una politica scritta di cosa conta come rotto.

Questa settimana è andato rosso su una PR di contenuto. Il primo pensiero è stato che il pezzo fosse debole. Il secondo, quattro minuti dopo, è stato peggio: quel gate era rosso su ogni PR di contenuto da un pezzo, e io lo stavo leggendo come un'asticella alta.

Non era un'asticella alta. Il job non arrivava proprio alla rubrica.

```
Error: anthropic messages -> 400: output_config.format.schema:
For 'integer' type, properties maximum, minimum are not supported
```

Il judge chiede al modello una structured output, e lo schema che gli mandava conteneva questo:

```js
voto: { type: "integer", minimum: 1, maximum: 5 },
```

Che è JSON Schema corretto, e che la structured output rifiuta. La richiesta non arrivava nemmeno al modello. Il job usciva 1 prima di valutare una sola parola.

Un gate che non può tornare verde non sta applicando niente. Sulla pipeline ha lo stesso effetto di un `continue-on-error`, con in più il fatto che ti fa sentire virtuoso mentre non fa nulla.

## Il messaggio d'errore nominava metà del problema

La correzione ovvia è togliere `minimum` e `maximum` e andare avanti. Stavo per farlo. Mi ha fermato l'aver notato che nello schema c'era un secondo tipo di vincolo:

```js
motivo: { type: "string", maxLength: 300 },
```

Anche i vincoli di lunghezza sono rifiutati. `maxLength`, `minLength`, `pattern`, `minItems`, tutta la famiglia. Nel mio schema ce n'erano tre, e il 400 non ne nominava nessuno, perché la validazione si ferma al primo difetto. Se avessi corretto quello che diceva il messaggio, avrei pushato, aspettato la CI e incassato il 400 successivo. Poi quello dopo ancora.

È una proprietà generale dei messaggi d'errore, non una stranezza di un'API: riportano la prima cosa che si è rotta, non l'insieme delle cose rotte. Una correzione che si limita a quello che dice il messaggio è una correzione della dimensione del messaggio, non del difetto.

C'è un'altra cosa che vale la pena sapere: gli SDK Python e TypeScript ripuliscono da soli i vincoli non supportati prima di spedire la richiesta. La mia pipeline è zero-dipendenze e chiama l'API con `fetch` nativo, quindi lì non ripuliva nessuno. Se il tuo SDK ti sta salvando in silenzio, te ne accorgi il giorno che lo togli.

## Quindi il test è sul contratto

Potevo scrivere un test che verifica l'assenza di `minimum` sugli interi. Sarebbe passato, e sarebbe stato inutile tre settimane dopo, quando qualcuno aggiunge un `pattern` a una stringa.

Le keyword accettate e quelle rifiutate stanno invece scritte una volta sola, e ogni schema che mando all'API viene verificato contro di loro:

```js
const RIFIUTATE = new Map([
  ["minimum", "vincolo numerico"],
  ["maximum", "vincolo numerico"],
  ["maxLength", "vincolo di lunghezza"],
  ["pattern", "vincolo su stringa"],
  // ...
]);

export function keywordRifiutate(schema, percorso = "$") { /* scende nell'albero */ }
```

Scende negli schemi annidati, e sa che dentro `properties` le chiavi sono i nomi dei miei campi e non keyword dello schema, così un campo che si chiama davvero `pattern` non lo fa inciampare.

Al primo giro ha trovato sedici violazioni nello schema del judge. Non due. Lo schema della generazione, controllato nello stesso momento, era già pulito, cosa su cui non avrei scommesso.

Accanto c'è un secondo controllo che elenca le keyword che il contratto non menziona. Fallisce invece di lasciarle passare, il che suona aggressivo per roba che l'API potrebbe accettare benissimo. Il motivo è che voglio che il momento in cui qualcuno aggiunge una keyword sconosciuta sia il momento in cui qualcuno legge la documentazione, e non il momento in cui la CI diventa rossa per una ragione che nessuno collega allo schema.

## Dove è finito il vincolo

La rubrica gira ancora su una scala da 1 a 5. Quella scala adesso vive nei due posti dove l'API non può rifiutarla.

Il prompt la descrive, con ogni voto definito. E il codice tratta un voto fuori scala come già trattava un criterio mancante:

```js
const fuoriScala = (v) => !Number.isInteger(v) || v < 1 || v > 5;
```

Fail closed. Se il modello risponde 7, la rubrica è illeggibile, e una rubrica illeggibile non promuove niente. Era già la politica per un criterio che il modello dimentica di compilare. Un voto fuori dalla scala è lo stesso tipo di problema, quindi riceve la stessa risposta.

Spostare un vincolo fuori da uno schema di solito vuol dire rinunciarci. Qui ha voluto dire solo applicarlo in un posto con una reputazione peggiore e una portata migliore.

## Cosa guarderei sulla tua pipeline

Cerca nella storia della CI un job che non è mai stato verde. Non "oggi è rosso": mai verde, o non più da un commit che non c'entrava niente con lui. Quel job non ti sta proteggendo, e nel frattempo ti sta costando quella particolare forma di tranquillità che viene dal credere di sì.

Il mio ha girato per settimane. Era la riga più rassicurante del workflow.
