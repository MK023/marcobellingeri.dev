---
lang: "it"
month: "Settembre 2026"
date: 2026-09-08
title: "L'indice TTL che non poteva scadere niente"
stat: 0
problem: >
  RabbitWatch, il mio stack di monitoraggio, dichiara una retention di sette giorni
  sulle metriche: un indice TTL su MongoDB, creato da uno script apposta, che
  dovrebbe cancellare da solo i documenti più vecchi. Rileggendo il codice prima di
  toccarlo, quella retention non poteva avere mai funzionato. Il consumer scrive il
  campo `timestamp` come intero Unix (`consumer/metrics_consumer_mongo.py:67`), e
  l'indice TTL è creato su quello stesso campo
  (`consumer/setup_ttl_indexes.py:23`).
approach: >
  La documentazione MongoDB è esplicita, e l'ho letta invece di dedurla: il campo
  indicizzato deve contenere valori di tipo data BSON, e se non li contiene il
  documento non scade. Il nome del campo diceva la cosa giusta, il tipo no. Ho
  cercato le due cose una accanto all'altra, il punto di scrittura e il punto di
  creazione dell'indice, perché sono in file diversi e nessuno dei due da solo
  sembra sbagliato.
result: >
  L'indice esiste, il thread TTL gira ogni sessanta secondi, legge quel campo,
  trova un numero e passa oltre. Non un errore, non un'eccezione, non una riga di
  log: il numero di documenti che quell'indice può far scadere è zero per
  costruzione. Nello stesso giro è saltato fuori che i due script non sono
  d'accordo su come si chiama la configurazione, `config_consumer.yaml` contro
  `consumer_config.yaml`, e che nel repository non è versionato nessun file YAML da
  cui partire. Il progetto non è mai andato in produzione, quindi finora non l'ha
  pagato nessuno.
lesson: >
  Una garanzia dichiarata e mai misurata resta un'ipotesi. Questo difetto non fa
  rumore: non c'era niente da notare, nessun allarme da ignorare, solo una
  collection che sarebbe cresciuta per sempre mentre il codice diceva il
  contrario. E la forma è sempre la stessa, il
  nome di un parametro non è la sua semantica, per cui la fonte da leggere era
  quella del fornitore e non il campo.
---
