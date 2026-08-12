---
lang: it
title: "Ho aperto il sito a tutti i crawler IA. Un mese dopo non so quante persone mi hanno letto"
date: 2026-08-12
description: "Cloudflare mi ha fatto i complimenti per 33.561 pageview. Il piano gratuito non separa gli umani dai bot, e i bot li ho invitati io. Ecco cosa ho misurato davvero, e il contatore che ho scritto per smettere di tirare a indovinare."
tags: [webdev, ai, privacy, cloudflare]
edicola: "crawler o persone"
---

A inizio agosto Cloudflare mi ha mandato una mail di complimenti. Il sito aveva superato i diecimila pageview nel primo mese: 33.561, per la precisione, su un dominio nato il 5 luglio.

Per circa dieci secondi è stata una bella notizia.

Poi mi sono ricordato di cosa avevo fatto a luglio, cioè aprire il `robots.txt` a ogni crawler di intelligenza artificiale in circolazione. Training incluso, per scelta. Non ho un brand da proteggere e il mio problema non è che qualcuno mi copi: è che nessuno mi trovi. Quindi entrano tutti.

Il che rende quel numero, preso così, buono per niente.

## Perché un numero di pageview non dice quante persone ti hanno letto?

Perché il piano gratuito di Cloudflare conta le richieste, non le persone, e non separa gli umani dai bot. Dentro quei 33.561 ci sono i crawler che ho invitato io, e non ho modo di sapere in che proporzione.

È un problema pratico, non filosofico. Se domani un cliente mi chiede quanto traffico fa il sito, non ho una risposta che posso difendere. «Trentatremila» sarebbe una frase vera e un'informazione falsa, perché chi la ascolta capisce «trentatremila persone». Preferisco dire che non lo so.

E c'è la domanda opposta, che per me conta di più: aprire i cancelli sta funzionando? Se GPTBot passa e rilegge il sito ogni settimana, ho fatto bene. Se non passa mai, sto regalando banda in cambio di niente e conviene saperlo.

## Aprire il sito ai crawler IA conviene davvero?

Su metà della domanda ho una risposta misurata, e le due metà non si somigliano per niente. Perplexity mi cita in prima posizione sulla domanda «chi è Marco Bellingeri, cloud e security engineer». ChatGPT, interrogato con la stessa domanda, non mi cita affatto.

Il monitor che lo misura gira ogni lunedì e scrive lo storico su un database. Fin qui è ordinaria amministrazione. La parte interessante è cosa ha fatto il modello quando gli ho fatto quella domanda.

Non ha cercato me. Ha riscritto la domanda in una query di ricerca, «Marco Bellingeri sicurezza AI», e ha letto dodici pagine sul tema: il regolamento europeo, l'AI Act, la dichiarazione di Bletchley, un paio di quotidiani. Nessuna riguardava una persona. Ha risposto sull'argomento perché la persona non l'ha trovata.

Questo è un tipo di fallimento diverso da «il tuo contenuto non è abbastanza buono». È il motore che non collega la domanda alla pagina, e la differenza cambia cosa ha senso fare dopo. Se il crawler non passa, riscrivere gli articoli è tempo buttato e il problema è di accesso. Se passa e non cita, il problema è che il contenuto non è estraibile, e allora riscrivere serve.

Per sapere quale delle due, mi serviva contare chi passa.

## Come si contano i crawler senza tracciare le persone?

Guardando lo `User-Agent` di ogni richiesta di pagina e registrando la sola famiglia a cui appartiene, senza indirizzo IP, senza cookie, senza sessione, senza niente che leghi due richieste alla stessa persona.

Il sito è statico e sta su Cloudflare Workers, quindi il posto ovvio era il Worker. Sono partito con un'assunzione che si è rivelata falsa: credevo che tutte le richieste ci passassero. Non era così. Il Worker era configurato per girare su cinque rotte soltanto, la root e quattro API. Ogni pagina del sito veniva servita direttamente dagli asset statici, senza che il mio codice vedesse niente.

La correzione non è stata «fai passare tutto». Le richieste di asset statico sono gratuite e illimitate, quelle che invocano il Worker consumano la quota del piano gratuito, centomila al giorno. Passare tutto avrebbe messo il mio codice davanti a ogni font e a ogni foglio di stile, cioè davanti alla maggior parte del volume e a tutta la latenza che conta, per contare cose che non sono pageview.

Quindi passano solo le pagine HTML. Un pageview è una richiesta HTML: il resto è roba che quella pagina si porta dietro.

## Cosa NON conservare, e perché è la parte difficile

La classificazione è banale: una lista di nomi, GPTBot, ClaudeBot, PerplexityBot, Googlebot, e un paio di regole per riconoscere un browser vero. Venti righe. La parte che mi ha preso tempo è stata decidere cosa buttare via.

Uno `User-Agent` di browser identifica una persona molto più di quanto sembri. Combinato con altro diventa un'impronta. Quindi di una persona conservo una parola sola, `umano`, e la stringa la getto.

Di un crawler che conosco già conservo il nome della famiglia e basta: so chi è, il resto non aggiunge niente.

Resta il caso scomodo, quello che mi ha fatto riscrivere il codice due volte. Se non riconosco il client, cosa faccio? La prima versione lo chiamava `bot` e ne teneva l'`User-Agent` intero. Sbagliato per due motivi. Il primo è che lì dentro può esserci una persona: un browser testuale, una webview dentro un'app, uno strumento di accessibilità, un `User-Agent` ripulito da un'estensione per la privacy. Trattarla come un bot e conservarle la stringa è precisamente la cosa che dicevo di non fare.

Il secondo motivo è che il numero mente. Se metto nello stesso secchio «un crawler che non conosco» e «non sono riuscito a capire cosa fosse», poi leggo che il quaranta per cento del traffico è automatico e ci credo, quando in realtà una fetta di quel quaranta è un mio dubbio travestito da certezza. E quel numero è quello che finisce davanti a un cliente.

Adesso sono due etichette. Chi si dichiara automatico nel proprio `User-Agent`, scrivendoci dentro `bot` o `crawler` o `curl`, viene conservato come nome breve del prodotto: serve ad accorgersi di una famiglia nuova. Chi semplicemente non si colloca viene registrato come `non classificato` e nient'altro.

## Quanto costa contare?

Poco, ma non zero, e il punto è saperlo prima invece di scoprirlo. Ogni pagina che passa dal Worker consuma una richiesta della quota gratuita. Con il traffico di oggi siamo intorno a millecento al giorno contro centomila: un margine di novanta volte, che è comodo ma non infinito, e su quelle rotte non c'è un rate limit.

L'ho scritto nel README del progetto, insieme a cosa farò se il numero si avvicina, in ordine: guardare il contatore, restringere le rotte e accettare di contare meno, e solo alla fine pagare. Un tetto dichiarato con una via d'uscita accanto è debito accettabile. Un tetto scoperto per caso in una notte è un incidente.

## La riga che mi ha quasi fatto pubblicare una bugia

L'informativa privacy del mio sito diceva, in italiano e in inglese, «non usa tracciamento o analytics».

Era vero fino al giorno prima. Se avessi spedito il contatore senza toccare quella pagina, il sito che vende trasparenza avrebbe pubblicato un'affermazione falsa su se stesso, e nessun test l'avrebbe presa: i test guardano il codice, non le promesse.

L'ho riscritta prima di spedire. Adesso dice cosa fa: conta le richieste una alla volta, senza identificatori, senza profilazione, e conserva i dati tre mesi perché è la piattaforma a cancellarli dopo. Ho anche tolto la parola «aggregato» da una prima stesura, perché non era vera: quello che scrivo è un evento per richiesta, non un totale, e chiamarlo aggregato sarebbe stato più rassicurante e meno esatto.

## Cosa non so ancora

Il contatore è acceso da poche ore. I primi punti li ho generati io stesso, mandando tre richieste di prova con `User-Agent` finti per verificare che funzionasse, e onestamente non saprei distinguerli dal traffico vero.

Quindi non ho ancora niente da dirvi sui crawler. Fra una settimana lo saprò: quali famiglie passano, quante volte, su quali pagine, e soprattutto se GPTBot arriva davvero. Quella risposta decide se ha senso continuare a scrivere per farmi trovare da un modello, oppure se sto scrivendo per un pubblico che non è mai passato di qui.

Nel frattempo ho smesso di poter dire trentatremila. È un peggioramento apparente e un miglioramento vero: prima avevo un numero grosso e nessuna idea di cosa contenesse, adesso ho una misura che arriverà e nel frattempo una risposta onesta.
