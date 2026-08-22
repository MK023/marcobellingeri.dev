---
lang: it
title: "Cross-posting su dev.to senza regalare la SEO"
date: 2026-08-21
description: "Il tag canonical non è la parte difficile. La parte difficile è che il tuo sito deve esistere, ed essere datato, prima della copia. Ho sbagliato quell'ordine una volta e lo specchio è finito sette giorni più vecchio dell'originale."
tags: [seo, webdev, writing]
edicola: "Canonical-first su dev.to"
---

Ogni articolo che scrivo esce prima sul mio sito. Una copia va su dev.to un giorno o due dopo, e quella copia porta puntualmente più lettori dell'originale. Un pezzo là sopra ha 106 visualizzazioni. Le mie analytics non sanno dirmi onestamente quante persone l'hanno letto qui, che è un altro pasticcio di cui ho scritto la settimana scorsa.

Quindi pubblico deliberatamente le cose che scrivo meglio su un posto con più traffico del mio, sotto un dominio che non è mio. Quello che rende tutto questo una strategia di sindacazione invece di un lento autolesionismo è un campo dell'API di dev.to:

```js
const canonicalDi = (slug) => `https://marcobellingeri.dev/en/writing/${slug}`;
```

È tutto lì, ed è anche la parte meno interessante. Quella che ho impiegato di più a capire è che canonical-first non è un campo da riempire. È un ordine da rispettare.

## Cosa ti compra davvero il tag

Quando due URL servono lo stesso articolo, un motore di ricerca deve sceglierne uno da posizionare e uno da trattare come duplicato. Lasciato a sé sceglie quello con più autorità, che in qualunque settimana dell'anno è dev.to e non tu. `rel="canonical"` è il modo in cui la copia punta indietro e dichiara che l'originale è l'altro.

dev.to lo gestisce come si deve. Se imposti `canonical_url` su un post, il tag finisce davvero nell'head, e in più ai lettori compare una riga che dice che il pezzo è uscito prima altrove, con il link. Qualcuno ci clicca. Quel link per me vale più del contatore delle visualizzazioni.

La precisazione che conta: il canonical è un suggerimento, non un ordine. Google lo tratta come uno dei segnali, e un altro dei segnali è quale URL ha visto per primo. Ed è lì che entra l'ordine.

## La casa deve essere più vecchia dello specchio

Se dev.to pubblica lunedì e il tuo sito pubblica lo stesso pezzo giovedì, hai appena dato a un crawler un'ottima ragione per credere che l'originale sia dev.to e la copia sia tu, qualunque cosa dica il tuo tag. Gli stai chiedendo di ignorare quello che ha visto coi suoi occhi sulla parola di un'annotazione.

Quindi la regola che la mia pipeline fa rispettare è che l'URL canonical deve rispondere, con la data giusta sopra, prima che lo specchio vada live. Non insieme. Prima.

Il modo in cui la fa rispettare è rifiutandosi di pubblicare. Il workflow che parla con dev.to a ogni merge può creare solo bozze:

```yaml
on:
  push:
    branches: [main]
    paths: ["astro-project/src/content/writing/en/**"]
```

Lancia `node engine/devto.mjs <slug>` senza il flag `--publish`, mai. Mergiare un articolo lo deploya sul mio sito e lascia una bozza non pubblicata ferma su dev.to. Là sopra non è live niente finché non succede una seconda cosa, separata.

Quella seconda cosa è un cron giornaliero alle 07:00 UTC che legge la `date` nel frontmatter di ogni articolo e gira l'interruttore a quelli la cui data è arrivata:

```
devto: niente in uscita oggi (2026-08-19)
DOMANI=
```

Quasi tutte le mattine non ha niente da fare e lo dice. Lo stesso run apre anche una issue con l'elenco di quello che esce domani, il che mi lascia una finestra vera di 24 ore per spostare una data o cancellare un file se un pezzo è invecchiato male da quando l'ho scritto. Nessuno deve approvare niente perché la pubblicazione avvenga. Il silenzio pubblica. L'unica decisione umana è il merge, e a quel punto è già stata presa.

## La data che mentiva

Mi piacerebbe raccontare che ha tenuto. A luglio ho mergiato un articolo sulle licenze delle fonti con `date: 2026-08-18` nel frontmatter, programmandolo per un martedì. Ad agosto mi sono accorto che era pubblico su dev.to dall'11.

Sette giorni prima della sua stessa data di pubblicazione.

Non era stato il workflow delle bozze, che `--publish` non lo passa mai. Non era stato il cron, che le date future le salta. Ero stato io, pubblicando quello a mano dall'interfaccia di dev.to settimane prima e dimenticandomene. L'automazione era innocente e non aveva nessun modo di accorgersene.

Quello che lo rende un problema vero e non solo una figuraccia è cosa stava servendo il mio sito nel frattempo. La pagina dell'articolo costruisce il suo JSON-LD dallo stesso campo del frontmatter:

```json
"datePublished": "2026-08-18"
```

Quindi per sette giorni l'URL canonical ha raccontato a ogni crawler che l'originale era uscito il 18, mentre la copia a cui puntava era dimostrabilmente live dall'11. L'unico segnale che controllo stava attivamente sostenendo che il mio sito fosse arrivato secondo.

La correzione era cambiare una data su una riga, e le correzioni fatte così ti fanno venire voglia di chiederti a quale classe appartengono. Appartengono a questa: la data nel frontmatter non è decorazione. È l'affermazione che il mio canonical fa su chi è arrivato prima, e qualunque cosa pubblichi fuori dalla pipeline può renderla falsa senza toccare il repository.

Ho controllato anche cosa sarebbe successo il 18 se non me ne fossi accorto. Niente, a conti fatti, perché il cron salta i pezzi già live. Il difetto sarebbe rimasto lì in silenzio invece di annunciarsi. Sono quelli che vale la pena andare a cercare.

## Rilanciare deve costare zero

L'altra proprietà che conta è che pushare due volte lo stesso articolo non deve creare un secondo post. dev.to non ha un upsert, quindi lo script se lo costruisce chiedendo cosa esiste già e confrontando gli URL canonical:

```js
const canonicalPubblicati = (await publishedArticles()).map((a) => a.canonical_url);
```

Confrontare il canonical invece del titolo vuol dire che se cambio l'intestazione aggiorno il post esistente invece di biforcarne un duplicato, e i duplicati sono esattamente ciò che il tag canonical esiste per evitare. Uno script di sindacazione capace di creare due copie live dello stesso articolo sta facendo il contrario del suo mestiere.

Se modifico un pezzo già pubblicato e ri-mergio, si aggiorna il corpo della bozza e il suo stato di pubblicazione resta dov'è. Ho rilanciato tutta la baracca più volte di quante mi faccia piacere ammettere mentre ci debuggavo sopra, e non ha mai ripubblicato niente.

Ancora una cosa, visto che sta nella stessa funzione. Lo slug arriva da un nome di file, viene interpolato in un URL e viene usato per aprire un file, quindi si valida prima di tutti e due:

```js
if (!slug || !/^[a-z0-9-]+$/.test(slug)) { /* exit 1 */ }
```

I nomi dei file nel mio repository non li controlla un attaccante, e li valido lo stesso. Il controllo costa una riga, e il giorno in cui qualcun altro potrà aprire una pull request qui dentro è il giorno in cui altrimenti dovrei ricordarmi di aggiungerlo.

## Cosa controllerei sul tuo

Se già cross-posti, tre cose valgono dieci minuti.

Apri la copia sullo specchio e guarda il sorgente. Verifica che il tag canonical ci sia davvero, perché parecchie piattaforme accettano il campo e poi su qualche template il tag lo perdono.

Poi confronta le due date di pubblicazione, non i due URL. Se una copia mirror è più vecchia dell'originale a cui punta, il tuo canonical in questo momento sta arringando contro di te, e nessuna quantità di configurazione corretta rimedia a un ordine che hai invertito.

Poi trova tutto quello che può pubblicare fuori dalla tua pipeline. Un bottone del CMS, un post programmato, un collega con gli accessi, te di tre settimane fa. Nel mio caso ero io, e l'automazione su cui avevo passato un weekend a stare attento non ne sapeva niente.

Il tag è la parte facile. Restare primo è il lavoro.
