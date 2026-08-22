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

La parola "pentest" porta con sé un'immagine che non corrisponde, quindi: niente traffico d'attacco contro il sistema vivo. La piattaforma fattura a consumo e davanti c'è un WAF, quindi una raffica di probe sarebbe costata soldi e avrebbe avvelenato i suoi stessi risultati. Quello che ho fatto è un audit in sola lettura del codice e della configurazione, più una corsa dinamica contro tutto lo stack tirato su in locale con Docker.

Mi aspettavo che i rilievi si concentrassero dove non aveva guardato nessuno. È successo l'opposto. Quasi ogni difetto serio stava dentro un controllo scritto giorni o ore prima, quasi sempre da me, quasi sempre con accanto un commento che nominava il guasto da cui proteggeva. Il codice vecchio è stato osservato: ha girato contro traffico vero e qualcuno ci è rimasto sorpreso. Una difesa scritta ieri è stata soltanto ragionata, che sembra la stessa cosa e non lo è.

## "Indipendenti" è una misura, non un commento

Il confine della privacy è una allow-list e non una deny-list, e quella parte era giusta. Claude Code è stato misurato mandare cinque attributi d'identità, fra cui `user.email` con dentro un indirizzo vero, e non c'è un flag che li spenga. Una `delete_key` per ciascuno funziona finché il client non ne aggiunge un sesto, e questa telemetria è in beta: il suo insieme di attributi non è un contratto.

```yaml
- context: resource
  statements:
    - keep_keys(resource.attributes, ["service.name"])
    - set(resource.attributes["service.name"], "claude-code")
```

La seconda riga non è ridondante: `keep_keys` filtra le chiavi, non i valori, e `service.name` è l'unico attributo che diventa una label di indice in Loki. Il 20/08/2026 un mittente che aveva il token d'ingest l'ha scritto come `claude-code-…vittima@example.com`, e quell'indirizzo è arrivato come label di indice.

Quello che era sbagliato è una frase della mia nota di design, che chiamava indipendenti le due barriere su quel confine. Una sta nel Collector, una in Loki, che rifiltra qualunque cosa le arrivi. `keep_keys(log.attributes, …)` governa gli attributi del record, e l'`otlp_config` di Loki ha tre sezioni, tutte e tre di attributi. Gli attributi di scope le attraversavano entrambe intatti: togli l'elenco di Loki per testare l'isolamento e uno `scope.secret` piantato apposta diventa di colpo interrogabile, mentre identità e contenuto restano fuori. La riparazione sembra un no-op ed è tutta la correzione:

```yaml
- context: scope
  statements:
    - keep_keys(scope.attributes, [])
```

Quello che avrebbe dovuto avvisarmi è che lo stesso buco esisteva due volte. Due giorni dopo il percorso delle metriche è saltato fuori che lasciava uscire gli attributi di scope come label `otel_scope_*` senza passare da nessuna allow-list, mentre il commento accanto a quell'exporter dichiarava il confine chiuso.

## Una prova che si esegue non è una prova che esercita

Una riga nel percorso dei log doveva azzerare il trace ID su ogni record prima dell'archiviazione. Scritta correttamente, nel posto giusto, coperta da una prova che la eseguiva.

```yaml
# sembra giusta, fallisce su ogni record
- set(log.trace_id.string, "")
```

`ParseTraceID` pretende 32 caratteri esadecimali e la stringa vuota non lo è, quindi lo statement falliva su ogni record, il Collector scriveva `failed to execute statement` e tirava dritto, e il campo arrivava a Loki intatto. Misurato il 21/08/2026 sul primo traffico vero: due warning per record, circa 180 per sessione, e una barriera dichiarata e assente. La prova non poteva vederlo, perché il payload non portava mai un trace ID. Verde, e cieca.

Il suo gemello è peggio, perché lì il guasto era condizionale. OTTL documenta che `set` non fa assolutamente niente se il valore si risolve a nil, quindi una riga che riduceva il body del log al nome dell'evento non faceva nulla su ogni record senza `event.name`, e un body che conteneva un prompt e un indirizzo è arrivato in Loki verbatim. Nessuna delle due prove poteva prenderlo: il client manda sempre `event.name`, e il payload sintetico doveva contenerlo per soddisfare un'altra asserzione. La difesa era un no-op esattamente nel caso per cui esisteva. Si chiudono allo stesso modo, facendo portare la cosa al payload.

## La peggiore stava dentro le prove

Quelle prove in shell sono lo strumento che questo progetto usa per non avere guasti silenziosi. Durante l'audit ho trovato un guasto silenzioso dentro lo strumento, vecchio sei ore e mio.

Due di loro pinnavano l'immagine del Collector alla lettera, `0.158.0`, sotto un commento che dichiarava fosse lo stesso digest della produzione. Una PR di dipendenze aveva portato compose e Dockerfile Railway a `0.159.0`, Dependabot non legge la shell, e le prove hanno continuato a scaricare la vecchia e a passare. Quindi la frase con cui avevo verificato quell'aggiornamento, "prova del contratto verde sull'immagine nuova", era falsa. Il pin non si copia più: si legge da `docker-compose.yml`, e ogni prova stampa l'immagine su cui sta girando.

Poi ho scritto un gate di CI perché non ricapitasse, e una revisione avversaria ha trovato il gate nato rotto. Contava quante prove derivano la propria immagine cercando la stringa `docker-compose.yml` nel testo intero del file, commenti inclusi: così il commento che descrive la derivazione sopravviveva alla derivazione, e togliendo la riga vera il conteggio restava a tre e il gate restava verde. Quindici righe sotto un commento che vieta esattamente quel pattern, in un file dove lo stesso errore era già stato fatto tre volte.

La forma ha fratelli. Una scansione bloccante dell'immagine passava perché disinstallare pip non è rimuoverlo: `ensurepip/_bundled/` ne conserva una seconda copia come wheel, e lo scanner non legge dentro un archivio. Ognuna di queste cose ha l'aspetto di un pass. Nessuna è la prova della proprietà che volevi.

## La corsa dinamica, e cosa non dimostra

Ho tirato su il percorso delle metriche in locale con segreti finti e ho spinto dentro una metrica che portava identità, con un token valido: un'email in `user.email`, un id in `organization.id`, e un valore ostile dentro `service.name` stesso.

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

E `4242` è arrivato fino ai numeri pubblici, che è la metà onesta. Una allow-list di nomi non vincola i valori: chi ha il token d'ingest può scrivere `claude_code.token.usage` col numero che vuole, e le query pubbliche leggono quel contatore con `max_over_time(…[25h])`, quindi un picco iniettato resta appiccicato venticinque ore. Misurato su uno stack di prova: `1e12` token. Non si chiude qui, perché il token identifica il produttore fidato e questi numeri non hanno una seconda fonte. Quello che si chiude è il numero che arriva da qualcun altro: le tre query pubbliche adesso portano `{job="otel-collector"}`.

Il payload è anche sintetico, quindi dimostra che la allow-list scarta quello che le passo io, non che il client mandi soltanto quello. Su questo stesso progetto un payload sintetico ha già confermato una query e poi mi ha mentito.

## Cosa non ho pubblicato, e perché

Esiste una versione di questo articolo che elenca per nome ogni debolezza residua del sistema in esecuzione, con la rotta esatta e la finestra esatta. Quel report l'ho scritto. Resta nel cassetto.

L'obiezione ovvia è che il repository è pubblico, quindi cosa sto trattenendo. La risposta è l'aggregazione. Ogni difetto qui sopra è chiuso alla luce del sole, con la misura che l'ha trovato dentro il commit che l'ha corretto. Un elenco di quello che è ancora aperto, tutto in un posto, con le rotte e i tempi uno accanto all'altro, è un oggetto diverso. Non è una divulgazione, sono indicazioni stradali.

## Cosa guarderei sul tuo

Se mandi telemetria da un client di coding AI, leggi un record grezzo prima di leggere la tua configurazione. In questa classe di prodotti l'identità parte di default, e ogni deny-list che scrivi oggi è l'elenco dei campi che esistevano stamattina.

Se ti appoggi a due barriere, la domanda utile non è se sono configurate entrambe. È quale insieme di dati ne sta vedendo una sola. Rompine una alla volta e interroga di ritorno l'altra.

E se hai delle prove, chiediti contro cosa hanno girato davvero le ultime tre volte che erano verdi. Le mie scaricavano un'immagine che la produzione si era già lasciata alle spalle, e me l'hanno detto nel modo più gentile a disposizione: passando.
