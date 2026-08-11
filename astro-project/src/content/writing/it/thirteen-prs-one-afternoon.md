---
lang: it
title: "Tredici PR in un pomeriggio, e la regola noiosa che le ha rette"
date: 2026-04-15
description: "Avevo in lista sei modifiche e contavo di chiuderne due. Sei ore dopo ne erano in produzione tredici, e la cosa che ha tenuto in piedi il pomeriggio non è la velocità."
tags: [ai, python, claude, programming]
edicola: "Tredici PR"
---

Mi sono seduto un pomeriggio con una lista di sei cose da portare in JobSearch, il tool per la ricerca di lavoro che mi sono scritto per la mia ricerca di lavoro e che poi ho tenuto in produzione per un utente esatto. Tre funzionalità piccole, due pezzi di debito tecnico, e un refactor che rimandavo da un mese perché cancellava una rete di sicurezza e al suo posto ci metteva una promessa.

Contavo di chiuderne due. Tre se il pomeriggio girava bene.

Sei ore dopo erano tredici pull request dentro `main`, tutte verdi, tutte live. Su quel giorno ci sono tornato più di una volta, perché la parte interessante non è il numero. Tredici è un numero che mi è capitato. Quella che vale la pena scrivere è la regola che ho seguito senza pensarci, ed è l'unico motivo per cui il numero non è diventato un disservizio.

## Cosa c'era davvero sul tavolo

JobSearch è un'applicazione FastAPI con PostgreSQL e Redis dietro, su Render. Niente di esotico. All'epoca aveva 394 test e una pipeline CI da nove stadi: lint, formattazione, uno scanner di sicurezza, l'audit delle dipendenze, stylelint, CodeQL, la suite di test, la build Docker e il deploy. È un'app di produzione vera con un'utenza di una persona, e quella persona scrive segnalazioni di bug molto dettagliate.

Ho cominciato chiedendo a Claude di pianificare il lavoro invece di farlo. Quello che è tornato era una roadmap da sei PR ordinate per rischio, prima le più economiche e sicure, con in fondo il refactor che mi faceva paura. Ho cambiato due cose nell'ordine e poi abbiamo semplicemente cominciato a scendere la lista. Quel passaggio di pianificazione è l'unico motivo per cui il pomeriggio ha avuto una forma. Senza, avrei aperto per prima quella spaventosa, perché è quello che faccio sempre.

## La regola

Tutte e tredici le PR sono andate allo stesso modo, senza eccezioni e senza scorciatoie quando mi stancavo:

1. Ramo dall'ultimo `main`.
2. Una cosa sola per ramo. Mai una correzione che viaggia insieme a una funzionalità.
3. Test scritti per la modifica.
4. Push, aspetta nove check verdi, merge, cancella il ramo.
5. `pull` di `main`, poi si comincia la prossima.

Scritta così sembra la prima pagina di qualsiasi guida a git, e mi rendo conto di quanto suoni ovvia. È anche tutta la risposta. Non ci sono mai stati due rami aperti insieme, quindi non ho mai dovuto ragionare su due modifiche contemporaneamente, quindi nessun merge ha prodotto sorprese. Quando qualcosa è andato storto, ed è successo, la superficie di quello che poteva averlo causato era un diff piccolo, non sei diff sovrapposti.

Non abbiamo mai fatto rollback. La produzione non si è mai rotta. Non per una prudenza eroica: per il fatto che in ogni istante c'era una cosa sola in volo.

## Chi faceva cosa

Claude scriveva e verificava. Io decidevo e mettevo in ordine.

Detta così sembra uno slogan, quindi ecco com'era in pratica. Su due delle tredici PR ho buttato via la prima proposta, non perché il codice fosse sbagliato ma perché era cresciuto in silenzio: chiedevo una correzione e mi arrivava la correzione, più un piccolo refactor del modulo intorno, più una funzione di supporto che nient'altro avrebbe mai chiamato. Tutte e due le volte il secondo tentativo era un terzo della roba e faceva esattamente quello che avevo chiesto. Lo scope creep è il modo di fallire che ora mi guardo. Arriva con l'aria di farti un favore.

E ho letto ogni diff prima del merge. Tutti e tredici. È il pezzo che salta chiunque racconti il pair programming con un modello, ed è il pezzo che rende sicuro tutto il resto.

## L'affermazione a cui ho smesso di credere

Due volte quel pomeriggio Claude mi ha detto che la suite passava, e due volte non passava.

Il meccanismo era lo stesso. Un test lento era stato saltato in locale, la riga di riepilogo diceva che il resto era verde, e il referto che ricevevo era vero su quello che aveva girato e muto su quello che non aveva girato. Lanciare `pytest` da solo costava dieci secondi. Credere al riepilogo mi sarebbe costato un giro di CI ogni volta, e soprattutto mi avrebbe insegnato che al riepilogo si può credere.

Adesso più che una regola è un'abitudine: quando il referto riguarda il permesso di procedere, il referto me lo verifico. Non per diffidenza. È che un'affermazione sullo stato del mondo e lo stato del mondo sono due oggetti diversi, e solo uno dei due blocca un merge.

## Quella che mi faceva paura

L'ultima PR della lista cancellava circa 250 righe il cui unico mestiere era riparare JSON che Claude aveva appena scritto, e al loro posto ci metteva il tool use di Anthropic con uno schema forzato. Il saldo fra il client e i suoi test era intorno alle 370 righe in meno.

È uscita da sola, per ultima, dietro la sua bandierina, con niente altro in volo. E ha introdotto un bug che ho notato solo la mattina dopo, perché il bug non era nel codice. Era in una regola di prompt che campava sull'ambiguità. Quella l'ho raccontata a parte, in [dal parsing del JSON nel testo al tool use di Claude](/it/writing/tool-use-jobsearch), perché si merita il suo pezzo.

Qui conta un'altra cosa: la modifica più rischiosa è stata la più facile da diagnosticare il giorno dopo. Una PR, una cosa sola, un diff da rileggere. Se fosse uscita in mezzo al mucchio con altre quattro, quella mattina l'avrei passata a bisecare invece che a ragionare.

## Cosa mi terrei

Pianificare prima di eseguire, anche per un pomeriggio. Soprattutto per un pomeriggio, perché è lì che la voglia di partire e basta è più forte.

Tenersi le review. Il modello scrive più veloce di quanto tu legga, e in quello scarto ci stanno gli errori.

E tenersi la regola noiosa. Un ramo, una cosa sola, aspetta il verde. Non è una tecnica di produttività e non dà la sensazione di andare forte. È quello che mi ha permesso di lavorare sei ore a quel ritmo senza trovarmi mai nella posizione di non saper spiegare cosa stava girando in produzione.
