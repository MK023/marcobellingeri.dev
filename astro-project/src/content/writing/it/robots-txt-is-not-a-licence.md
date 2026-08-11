---
lang: it
title: "Un robots.txt permissivo non è una licenza"
date: 2026-08-18
description: "Ho controllato le licenze di dieci fonti che il mio scraper leggeva da un mese. Ne sono passate due. Quella che faceva entrare tutti i crawler non mi concedeva niente, e quella che bloccava i bot sarebbe andata benissimo."
tags: [webdev, legal, ai, opensource]
edicola: "robots.txt e licenze"
---

Ho uno scraper che tiene d'occhio dieci siti che considero vicini al mio lavoro. Gira da inizio luglio. Quello che raccoglie finisce in un vector store che al momento non legge nessuno, ed è l'unico motivo per cui questa storia finisce senza un avvocato dentro.

Questa settimana ho controllato quelle dieci fonti con la stessa asticella che uso per i feed di sicurezza del sito: la licenza deve permettere il riuso commerciale, per iscritto. Il mio sito vende. Ambiguo vuol dire no.

Ne sono passate due. Otto no. E lo schema delle bocciature non era quello che mi aspettavo.

## Le due domande non sono la stessa domanda

Questo è il robots.txt di Simon Willison, accogliente quanto basta:

```
User-agent: ChatGPT-User
Disallow:

User-agent: *
Disallow: /admin/
Disallow: /search/
```

Un permesso esplicito per uno user agent di IA. Nessun blocco a GPTBot, nessuno a Google-Extended, niente. Il mio scraper è il benvenuto.

Adesso il footer dello stesso sito: un simbolo di copyright e un elenco di anni. Nessuna licenza. Nessuna pagina di termini. Niente che mi dia il diritto di ripubblicarne una riga su una pagina che vende consulenza.

E questo è il footer di Troy Hunt, su un sito il cui robots.txt non blocca niente di interessante nemmeno lui:

> Copyright 2026, Troy Hunt. This work is licensed under a Creative Commons Attribution 4.0 International License. In other words, share generously but provide attribution.

Quella è una licenza. Dice cosa posso fare e cosa devo in cambio. Con la mia regola d'ammissione, Troy Hunt entra e Simon Willison resta fuori, e non c'entra niente quale dei due sia più gentile con i crawler.

Le due domande sono separate, e solo una è quella a cui mi serve una risposta:

- il robots.txt risponde a "il tuo bot può scaricare questa pagina?"
- la licenza risponde a "quello che il bot ha scaricato lo puoi ripubblicare?"

Un sito può dire di sì alla prima e tacere sulla seconda. Il silenzio non è un sì. È l'assenza di un sì, che con la mia regola è un no.

## Vale in tutte e due le direzioni

È saltato fuori anche il caso opposto. Il robots.txt di Julia Evans contiene, in ASCII art abbastanza grande da non poterla mancare:

```
NO LLM PLZ
```

più un `Disallow: /` per GPTBot. Più chiaro di così non si può. Quello che tecnicamente non è, è una restrizione di licenza: `/license`, `/licence`, `/copyright` e `/terms` danno tutti 404, e il footer dice solo "© Julia Evans".

Quindi un avvocato potrebbe dirmi che il robots.txt non è un contratto, e che l'assenza di un divieto esplicito mi lascia spazio. Quello spazio non lo voglio. Una persona ha scritto NO LLM PLZ in ASCII sul proprio sito. È la dichiarazione d'intenti più chiara possibile, e costruire un business nello spazio fra quello che qualcuno ha dichiarato e quello che si è trovato a rendere opponibile è un brutto modo di gestire un business che vende fiducia.

A quel verdetto ho dato un nome suo. Non "fuori" per motivi di licenza, ma fuori per volontà dell'autore. Documenta che la richiesta l'abbiamo letta e rispettata, invece di perdere la distinzione in un foglio dove tutte le bocciature si assomigliano.

La newsletter di Gergely Orosz si è rivelata la più precisa di tutte, con un header che non avevo ancora visto in giro:

```
Content-Signal: search=yes, ai-input=yes, ai-train=no
```

Recupero sì, addestramento no. È un segnale davvero utile, e sono contento che qualcuno lo stia mettendo in forma leggibile da una macchina. Resta il fatto che non è una licenza di riuso, quindi la fonte per me è fuori, ma almeno per una volta sapevo esattamente cosa voleva l'autore.

## Il difetto non è l'audit, è quando l'ho fatto

Otto fonti su dieci bocciate, e potrei raccontarti che averlo scoperto è la vittoria. Non lo è. Lo scraper ha girato per un mese contro siti che avevano detto di no per iscritto, e l'unico motivo per cui non è stato pubblicato niente è che il percorso di retrieval sopra quel magazzino ancora non esiste.

Quella è fortuna, non un controllo.

Il vaglio della licenza va nel momento in cui una fonte entra. Non nel momento in cui il suo contenuto viene servito la prima volta, che è dove l'avevo messo implicitamente pensando alla cosa come "interna, per ora". Interno è una proprietà dell'architettura di oggi. Lo scraping è successo lo stesso.

Nel repo, accanto alle cancellazioni, sono finite due cose. I verdetti, ognuno con la citazione testuale e il link alla pagina su cui l'ho letta, nello stesso file di compliance che tenevo già per i feed pubblici del sito. E una nota, bene in vista, che dice che i feed pubblici hanno un test in CI che fallisce se una fonte non ha licenza scritta, mentre il roster interno quel test non ce l'ha, perché vive in un database e la mia suite gira senza rete. Quel gate è un umano che legge un file. È un tetto dichiarato, non un controllo, e scriverlo nero su bianco è la differenza fra un limite e una sorpresa.

## La versione corta

Controlla tutti e due, in tutte e due le direzioni.

Un robots.txt gentile senza licenza ti dà accesso e nessun diritto. Un robots.txt ostile su un sito CC BY ti dà diritti che probabilmente non dovresti prenderti. La combinazione che cerchi è una concessione scritta, e l'unico modo per trovarla è aprire la pagina della licenza con i tuoi occhi.

Lo scraper non ha mai dovuto chiedere. Il problema era tutto lì.
