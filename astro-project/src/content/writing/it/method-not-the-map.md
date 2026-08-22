---
lang: it
title: "Ho fatto un pentest al mio hub AI e ho pubblicato il metodo, non la mappa"
date: 2026-08-22
description: "Un audit in sola lettura del mio stack di osservabilità, condotto come un ingaggio vero. Quasi ogni cosa seria che ha trovato stava dentro una difesa scritta poche ore prima, e la peggiore stava dentro le prove che uso per dimostrare che le difese funzionano."
tags: [ai, opentelemetry, programming, security]
edicola: "Il metodo, non la mappa"
---

La settimana scorsa ho fatto un penetration test alla mia infrastruttura. Niente Burp Suite, nessun exploit lanciato contro la produzione, nessuna CVE saltata fuori. Tutto l'ingaggio si è ridotto a una sola abitudine: non credere che un controllo funzioni finché non l'ho visto funzionare.

Il bersaglio è un piccolo hub di osservabilità che mi sono costruito per il mio lavoro di coding assistito dall'AI. Sei servizi in un solo file compose: un tunnel, un OpenTelemetry Collector che riceve metriche e log da Claude Code, Prometheus, Grafana, Loki e una status API. La superficie pubblica sono tre numeri aggregati. Tutto il resto resta privato. Quel confine, tre numeri fuori e nient'altro, era esattamente la cosa che stavo testando.

La parola "pentest" porta con sé un'immagine che non corrisponde, quindi: non ho lanciato traffico d'attacco contro il sistema vivo. La piattaforma fattura a consumo, davanti ci sono un rate limiter e un WAF, e una raffica di probe sarebbe costata soldi e avrebbe avvelenato i suoi stessi risultati. È stato un audit in sola lettura del codice e della configurazione, strutturato come un ingaggio, più una corsa dinamica contro tutto lo stack tirato su in locale con Docker. Le cose interessanti non sono venute dall'entrare. Sono venute dal verificare se le difese reggono quando le esegui.

## Quasi tutto quello che contava stava dentro una difesa

Mi aspettavo che i rilievi si concentrassero dove non aveva guardato nessuno. È successo l'opposto. Quasi ogni difetto serio stava dentro un controllo scritto giorni o ore prima, quasi sempre da me, quasi sempre con accanto un commento che nominava il guasto da cui proteggeva. Il codice vecchio è stato osservato: ha girato contro traffico vero, qualcuno l'ha interrogato di ritorno, qualcuno ci è rimasto sorpreso. Una difesa scritta ieri è stata soltanto ragionata, che sembra la stessa cosa e non lo è.

## Allow-list, non deny-list

La prima versione del mio confine di privacy cancellava i cinque attributi d'identità che Claude Code è stato misurato mandare: `user.email`, con dentro un indirizzo vero, più `user.id`, `user.account_id`, `user.account_uuid` e `organization.id`. Non c'è un flag per spegnerli, e una `delete_key` per ciascuno funziona fino al giorno in cui il client ne aggiunge un sesto. Questa telemetria è in beta e il suo insieme di attributi non è un contratto. Su un confine di privacy una deny-list fallisce in apertura su tutto quello di cui non ha mai sentito parlare.

Tenere quello che è noto e sicuro, e buttare il resto, trasforma un attributo sconosciuto in un'etichetta mancante invece che in una fuga. Il prezzo è che un produttore futuro le cui etichette non sono in elenco resta muto, ed è la direzione giusta in cui rompersi.

```yaml
- context: resource
  statements:
    - keep_keys(resource.attributes, ["service.name"])
    - set(resource.attributes["service.name"], "claude-code")
```

Quella seconda riga non è ridondante, e capire perché mi è costato una misura. `keep_keys` filtra le chiavi, non i valori, e `service.name` è l'unico attributo che diventa una label di indice in Loki. Il 20/08/2026 un mittente che aveva il token d'ingest ha scritto `service.name: claude-code-…vittima@example.com` e quell'indirizzo è arrivato come label di indice, con la cardinalità che ne consegue. Il tetto sotto è `max_global_streams_per_user`, 5000 di default, che è un limite e non una difesa. Un produttore, un valore lecito, fissato.

## "Indipendenti" è una misura, non un commento

Su quel confine avevo due barriere, una nel Collector e una in Loki, che rifiltra qualunque cosa le arrivi. Una mia nota di design le chiamava indipendenti: ne rompi una, tiene l'altra.

Non lo erano, e lo so soltanto perché una prova è diventata rossa. `keep_keys(log.attributes, …)` governa gli attributi del record, e l'`otlp_config` di Loki ha tre sezioni, tutte e tre di attributi. Gli attributi di scope attraversavano entrambe intatti. Togli l'elenco di Loki per testare l'isolamento e uno `scope.secret` piantato apposta diventa di colpo interrogabile, seduto accanto ai dati che volevo, mentre identità e contenuto restano fuori. La riparazione sembra un no-op ed è tutta la correzione:

```yaml
- context: scope
  statements:
    - keep_keys(scope.attributes, [])
```

Il client oggi non manda attributi di scope. La lista è vuota perché adesso non costa niente e copre qualunque cosa ci metta una versione futura. Quello che avrebbe dovuto avvisarmi è che lo stesso buco esisteva due volte: due giorni dopo il percorso delle metriche è saltato fuori che lasciava uscire gli attributi di scope come label `otel_scope_*` senza passare da nessuna allow-list, mentre il commento accanto a quell'exporter dichiarava il confine chiuso. Stessa forma, corretta su un percorso e non sull'altro, con in mezzo della prosa che affermava andasse bene.

## Una prova che si esegue non è una prova che esercita

Da qualche parte nel percorso dei log c'era una riga che doveva azzerare il trace ID su ogni record prima dell'archiviazione. Scritta correttamente, nel posto giusto, e coperta da una prova che la eseguiva.

```yaml
# sembra giusta, fallisce su ogni record
- set(log.trace_id.string, "")
```

Il setter passa da `ParseTraceID`, che pretende 32 caratteri esadecimali. La stringa vuota non lo è, quindi lo statement falliva su ogni record, il Collector scriveva `warn … failed to execute statement` e tirava dritto, e il campo arrivava a Loki intatto. Misurato il 21/08/2026 sul primo traffico vero: due warning per record, circa 180 per sessione, e una barriera dichiarata e assente. Il valore che il parser accetta è l'ID di tutti zeri, il modo della specifica OTel di dire "nessuna traccia".

La prova non poteva vederlo, perché il payload non portava mai un trace ID. Non c'era niente su cui la riga rotta potesse rompersi. Verde, e cieca.

Il suo gemello è peggio, perché lì il guasto era condizionale. OTTL documenta che `set` non fa assolutamente niente se il valore si risolve a nil, quindi una riga che riduceva il body del log al nome dell'evento non faceva nulla, in silenzio, su ogni record senza `event.name`. Misurato contro il Collector vero: un body che conteneva un prompt e un indirizzo è arrivato in Loki verbatim. Nessuna delle due prove poteva prenderlo, perché il client manda sempre `event.name` e il payload sintetico doveva contenerlo per soddisfare un'altra asserzione. La difesa era un no-op esattamente nel caso per cui esisteva. Si chiudono allo stesso modo, facendo portare la cosa al payload: la prova sulla privacy adesso spinge dentro `deadbeefdeadbeefdeadbeefdeadbeef` come trace ID e pretende che non torni.

## La peggiore stava dentro le prove

Quelle prove in shell sono lo strumento che questo progetto usa per non avere guasti silenziosi. Durante l'audit ho trovato un guasto silenzioso dentro lo strumento, vecchio sei ore e mio.

Due di loro pinnavano l'immagine del Collector alla lettera, `0.158.0`, sotto un commento che dichiarava fosse lo stesso digest della produzione. Una PR di dipendenze aveva portato compose e Dockerfile Railway a `0.159.0`, Dependabot non legge la shell, e le prove hanno continuato a scaricare la vecchia e a passare. Quindi la frase con cui avevo verificato quell'aggiornamento, "prova del contratto verde sull'immagine nuova", era falsa. Il pin non si copia più, si legge da `docker-compose.yml`, che è la copia unica, e ogni prova adesso stampa l'immagine su cui sta girando, perché una prova che non dice cosa ha testato sta chiedendo di essere creduta.

Poi ho scritto un gate di CI perché non ricapitasse, e una revisione avversaria ha trovato il gate nato rotto. Contava quante prove derivano la propria immagine cercando la stringa `docker-compose.yml` nel testo intero del file, commenti inclusi: così il commento che descrive la derivazione sopravviveva alla derivazione, e togliendo la riga vera il conteggio restava a tre e il gate restava verde. Sono quindici righe sotto un commento che vieta esattamente quel pattern, in un file dove lo stesso errore era già stato fatto tre volte.

La forma ha fratelli, una volta che la cerchi. Una scansione bloccante dell'immagine passava perché disinstallare pip non è la stessa cosa che rimuoverlo: `ensurepip/_bundled/` ne conserva una seconda copia come wheel, lo scanner non legge dentro un archivio, e il codice vulnerabile viaggiava nell'immagine a un `python -m ensurepip` dall'essere reinstallato. Un watchdog leggeva una metrica assente come zero guasti, quindi avrebbe detto "sano" esattamente nel momento in cui il suo input fosse sparito. Ognuna di queste cose ha l'aspetto di un pass. Nessuna è la prova della proprietà che volevi.

## La corsa dinamica, e cosa non dimostra

Così ho tirato su il percorso delle metriche in locale con segreti finti e ho spinto dentro una metrica che portava identità, con un token valido. Il canarino è deliberato: un'email in `user.email`, un id in `organization.id`, e un valore ostile dentro `service.name` stesso.

```text
# prima l'autenticazione, prima che qualunque altra cosa abbia voce in capitolo
niente token    -> 401
token sbagliato -> 401
token valido    -> 200   # accettata: adesso vediamo cosa le sopravvive
```

Poi ho letto l'exporter. Questa è l'unica serie che espone, per intero:

```text
claude_code_token_usage{job="claude-code",model="claude-opus-5",session_id="sess-canary",type="input"} 4242
```

L'email non c'è, l'id dell'organizzazione non c'è, il `service.name` ostile è stato fissato invece di diventare una label. Quello che è rimasto sono le tre chiavi che avevo ammesso.

E il valore, `4242`, è arrivato fino ai numeri pubblici, che è la metà onesta. Una allow-list di nomi non vincola i valori: chi ha il token d'ingest può scrivere `claude_code.token.usage` col numero che vuole, e le query pubbliche leggono un contatore con `max_over_time(…[25h])`, quindi un picco iniettato resta appiccicato venticinque ore e non si annulla aspettando né riavviando. Misurato su uno stack di prova: `1e12` token. Quello lì non si chiude qui, e la ragione conta. Il token identifica il produttore fidato, che è l'unica fonte che questi numeri hanno, quindi filtrare i valori sarebbe un secondo parere senza una seconda fonte. Quello che il progetto può fare è impedire che il numero arrivi da qualcun altro, e le tre query pubbliche adesso portano `{job="otel-collector"}` per questo.

Il payload è anche sintetico, quindi dimostra che la allow-list scarta quello che le passo io, non che il client mandi soltanto quello. Su questo stesso progetto un payload sintetico ha già confermato una query e poi mi ha mentito.

## Cosa non ho pubblicato, e perché

Esiste una versione di questo articolo che elenca per nome ogni debolezza residua del sistema in esecuzione, con la rotta esatta e la finestra esatta. Quel report l'ho scritto. Resta nel cassetto.

L'obiezione ovvia è che il repository è pubblico, quindi cosa sto trattenendo. La risposta è l'aggregazione. Ogni difetto qui sopra è chiuso, ed è chiuso alla luce del sole, con la misura che l'ha trovato dentro il commit che l'ha corretto. Un elenco di quello che è ancora aperto, tutto in un posto, con le rotte e i tempi uno accanto all'altro, è un oggetto diverso. Non è una divulgazione, sono indicazioni stradali.

## Cosa guarderei sul tuo

Se mandi telemetria da un client di coding AI, leggi un record grezzo prima di leggere la tua configurazione. In questa classe di prodotti l'identità parte di default, l'insieme degli attributi è in beta, e ogni deny-list che scrivi oggi è l'elenco dei campi che esistevano stamattina.

Se ti appoggi a due barriere, la domanda utile non è se sono configurate entrambe. È quale insieme di dati ne sta vedendo una sola. Rompine una alla volta e interroga di ritorno l'altra. La parola "indipendenti" in una nota di design è un'affermazione, e la mia è sopravvissuta a due percorsi prima che una prova la smentisse.

E se hai delle prove, chiediti contro cosa hanno girato davvero le ultime tre volte che erano verdi. Le mie scaricavano un'immagine che la produzione si era già lasciata alle spalle, e me l'hanno detto nel modo più gentile a disposizione: passando.
