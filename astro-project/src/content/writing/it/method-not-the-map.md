---
lang: it
title: "Ho fatto un pentest al mio hub AI e ho pubblicato il metodo, non la mappa."
date: 2026-08-22
description: "Un audit in sola lettura del mio stack di osservabilità, condotto come un ingaggio vero. Non ha trovato niente di sfruttabile, e non è la parte interessante: la parte interessante sono quattro controlli che sembravano verdi e non facevano niente."
tags: [ai, programming, productivity, security]
edicola: "Il metodo, non la mappa"
---

La settimana scorsa ho fatto un penetration test alla mia infrastruttura. Niente Burp Suite, nessun exploit lanciato contro la produzione, nessuna CVE saltata fuori. Tutto l'ingaggio si è ridotto a una sola abitudine: non credere che un controllo funzioni finché non l'ho visto funzionare.

Il bersaglio è un piccolo hub di osservabilità che mi sono costruito per il mio lavoro di coding assistito dall'AI. Sei servizi: un OpenTelemetry Collector che riceve metriche e log da Claude Code, Prometheus, Grafana, un archivio dei log, una status API minuscola e un tunnel davanti a tutto. La superficie pubblica sono tre numeri aggregati. Tutto il resto resta privato. Quel confine, tre numeri fuori e nient'altro, era esattamente la cosa che stavo testando.

Voglio essere preciso su che tipo di test è stato, perché la parola "pentest" porta con sé un'immagine che non corrisponde. Non ho lanciato traffico d'attacco contro il sistema vivo. La piattaforma fattura a consumo, davanti ci sono un rate limiter e un WAF, e una raffica di probe sarebbe costata soldi e avrebbe avvelenato i suoi stessi risultati. Quindi è stato un audit in sola lettura del codice e della configurazione, strutturato come un ingaggio, dalla ricognizione al report, più una corsa dinamica contro tutto lo stack tirato su in locale con Docker. Le cose interessanti non sono venute dall'entrare. Sono venute dal verificare se le difese reggono quando le esegui davvero.

## L'audit non ha trovato niente di sfruttabile, e non è la parte interessante

Il passaggio statico non ha prodotto bug sfruttabili. Non perché abbia guardato con superficialità, ma perché quel codice ha una proprietà insolita: quasi ogni difesa si porta dietro un commento che nomina il guasto esatto che previene e la data in cui qualcuno l'ha misurato. Autenticazione all'ingest, non al tunnel. Identità tolta con una allow-list, non con una deny-list. Container non-root e pinnati per digest. Segreti fuori da git, con uno scanner che ha un canarino piantato apposta perché non possa passare mentre è cieco.

Leggere quella roba è rassicurante e anche un po' inutile. Un commento che dice "questo è sicuro" è un'affermazione, e il punto di una security review è che le affermazioni sono il punto di partenza, non quello d'arrivo. Quindi il lavoro vero era la seconda metà: tirare su tutto e provare a far comportare male le cose sicure.

## Lezione uno: allow-list, non deny-list

Il confine della privacy è dove la telemetria dell'AI diventa pericolosa. Il client che gli do in pasto manda `user.email`, con dentro un indirizzo vero, su quasi ogni record di log. Sempre. Non c'è un flag per spegnerlo. Va benissimo finché sei l'unico a vedere quei dati, e diventa un problema nell'istante in cui uno solo di quei record potrebbe essere visto da qualcun altro.

La riparazione ingenua è elencare i campi identificanti e cancellarli.

```yaml
# per favore, non fatelo su un confine di privacy
transform/redact:
  metric_statements:
    - context: datapoint
      statements:
        - delete_key(datapoint.attributes, "user.email")
        - delete_key(datapoint.attributes, "organization.id")
```

Funziona e marcisce. L'insieme degli attributi è in beta e non è un contratto. Il giorno in cui il client aggiunge un sesto campo identificante, una deny-list di quelli che conoscevi lo lascia passare. Su un confine di privacy, una deny-list fallisce in apertura su tutto quello di cui non ha mai sentito parlare.

Quindi la configurazione tiene un elenco corto di campi noti e sicuri, e butta via il resto.

```yaml
transform/allowlist:
  metric_statements:
    - context: resource
      statements:
        # il valore di service.name lo sceglie il client: fissalo, non filtrare solo le chiavi
        - keep_keys(resource.attributes, ["service.name"])
        - set(resource.attributes["service.name"], "claude-code")
    - context: datapoint
      statements:
        - keep_keys(datapoint.attributes, ["model", "type", "session.id"])
```

Un attributo sconosciuto diventa un'etichetta mancante invece che una fuga. Il prezzo è che un produttore futuro le cui etichette non sono in elenco resta muto, ed è la direzione giusta in cui rompersi.

## Lezione due: "indipendenti" è una misura, non un commento

Su quel confine avevo due barriere. Una nel Collector, una nell'archivio dei log, che rifiltra qualunque cosa gli arrivi. Mi ero raccontato che fossero indipendenti: ne rompi una, tiene l'altra.

Non lo erano, e lo so soltanto perché una prova è diventata rossa. La allow-list del Collector filtrava gli attributi di resource e quelli di record, ma non ha mai toccato quelli di scope, che quindi la attraversavano intatti e venivano presi solo dall'elenco dell'archivio. Togli l'elenco dell'archivio per testare l'isolamento e una chiave piantata nello scope diventa di colpo interrogabile, seduta accanto ai dati che volevo. Due barriere indipendenti sull'identità e sul contenuto, e non indipendenti su quel terzo insieme.

La parola "indipendenti" l'avevo scritta in una nota di design e ci avevo creduto. La configurazione veniva parsata. Un controllo statico sulla forma sarebbe passato. Solo una prova che è girata, e che poi è andata a guardare, ha trovato il buco. Adesso rompo ogni barriera apposta e verifico che l'altra tenga, invece di fidarmi dell'etichetta che le ho messo sopra.

## Lezione tre: una prova che si esegue non è una prova che esercita

Questa è quella su cui continuo a tornare. Da qualche parte nella configurazione c'era una riga che doveva azzerare il trace ID su ogni record di log prima dell'archiviazione. Era scritta correttamente, nel posto giusto. C'era pure un test che la eseguiva.

```yaml
# sembra giusta, fallisce su ogni record
- set(log.trace_id.string, "")
```

Falliva su ogni singolo record. Il setter interpreta il valore come un trace ID, la stringa vuota non è un trace ID valido, quindi lo statement andava in errore, la pipeline scriveva un warning e tirava dritto, e il campo arrivava all'archivio intatto. Il valore che vuole è l'ID di tutti zeri, `"000...000"`, che è il modo della specifica di dire "nessuna traccia". Il test che la "copriva" faceva girare la pipeline ma non mandava mai un trace ID, quindi la riga rotta non aveva niente su cui rompersi. Verde, e cieca.

La riparazione nella configurazione è stata un valore corretto. La riparazione nella mia testa è stata più grossa. Una prova che gira non è la stessa cosa di una prova che esercita quello che ti interessa. Se il payload non porta l'attributo che il controllo dovrebbe togliere, il controllo può essere un no-op e tutte le spie restano verdi.

## Lezione quattro: verde non vuol dire assente

Un tema ha continuato a ripetersi. Uno scanner delle dipendenze passava perché non legge dentro i wheel impacchettati, quindi una copia vulnerabile stava nell'immagine a un comando di distanza dall'essere reinstallata, invisibile al gate. Un watchdog trattava un risultato vuoto come zero fallimenti, il che vuol dire che avrebbe detto "sano" esattamente nel momento in cui il suo stesso input fosse sparito. Un grep sulla privacy che riporta "nessuna etichetta identificante trovata" quando non c'era niente da guardare non ti sta dicendo nulla, e suona come una buona notizia.

Ognuna di queste cose ha l'aspetto di un pass. Nessuna è la prova della proprietà che volevi. La contromossa è sempre la stessa: fai in modo che il sistema te la mostri, non lasciargli tenere il silenzio e chiamarlo successo.

## La corsa dinamica

Così ho tirato su tutto il percorso delle metriche in locale con segreti finti e ho spinto dentro una metrica che portava identità, con un token valido. Il canarino è deliberato: un'email in `user.email`, un id in `organization.id`, e un valore ostile dentro `service.name` stesso.

```text
# prima l'autenticazione, prima che qualunque altra cosa abbia voce in capitolo
niente token   -> 401
token sbagliato -> 401
token valido    -> 200   # accettata: adesso vediamo cosa le sopravvive
```

Poi ho letto l'exporter. Questa è l'unica serie che espone, per intero:

```text
claude_code_token_usage{job="claude-code",model="claude-opus-5",session_id="sess-canary",type="input"} 4242
```

L'email non c'è. L'id dell'organizzazione non c'è. Il `service.name` ostile non è diventato un'etichetta, è stato fissato a `claude-code`. Quello che è rimasto sono le tre chiavi che avevo ammesso. E il valore, `4242`, si è propagato fino ai numeri pubblici. Quest'ultima parte è il compromesso onesto: il token autentica il produttore fidato, quindi impedisce a qualcun altro di scrivere nella mia pipeline, ma non trasforma i valori del produttore stesso in qualcosa che io possa mettere in dubbio. Nove verifiche, tutte verdi: autenticazione all'ingest, la allow-list su entrambi i percorsi, il contratto della status API, la prova di privacy sui log con le immagini vere, la retention, gli alert.

Due limiti che non ho intenzione di nascondere. Il payload è sintetico, quindi dimostra che la allow-list scarta quello che le passo io, non che il client mandi soltanto quello. Su questo stesso progetto un payload sintetico ha già confermato una query e poi mi ha mentito. E una corsa in locale non è la produzione. La baseline vera arriva ancora dal far girare il client vero una volta e leggere cosa atterra.

## Cosa non ho pubblicato, e perché

Esiste una versione di questo articolo che elenca per nome ogni debolezza residua del sistema in esecuzione, con la rotta esatta e la finestra esatta. Quel report l'ho scritto. Resta privato.

Un penetration test della tua infrastruttura viva è, letto nel modo sbagliato, una mappa. Ogni "rischio accettato" è anche un elenco di indicazioni stradali per qualcuno che non le aveva. Quindi il report con dentro il bersaglio va nel cassetto, e quello che esce è il metodo e le lezioni, con gli hostname e i buchi specifici limati via. Se prendi la sicurezza abbastanza sul serio da fare l'audit al tuo lavoro, prendila abbastanza sul serio da non consegnare l'audit a chiunque.

È l'ultima lezione, ed è quella che terrei se dovessi perdere tutte le altre. La parte utile di una security review non è mai stata l'elenco di cos'è sbagliato in un sistema. Era l'insieme di abitudini che l'avrebbero preso in qualunque altro.

## Le abitudini, tutte in un posto

- Dai per scontato che l'identità parta di default. Guarda cosa manda il client prima che la tua configurazione entri in gioco.
- Allow-list sul confine della privacy. Una deny-list fallisce in apertura alla prossima release.
- Se ti appoggi a due barriere, rompine una alla volta e verifica che l'altra tenga.
- Una prova che si esegue non è una prova che esercita. Fai in modo che il payload porti la cosa.
- Verde non vuol dire assente. Fai in modo che il sistema ti mostri la proprietà, non accettare il silenzio.
- Leggi la configurazione per ultima. Falla girare, e interrogala di ritorno.
