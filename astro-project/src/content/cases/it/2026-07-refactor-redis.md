---
lang: "it"
month: "Luglio 2026"
date: 2026-07-01
title: "Refactor Redis — sistema in produzione"
problem: >
  La query critica del sistema era lenta sotto carico: la cache Redis veniva
  invalidata molto più spesso di quanto servisse davvero, vanificando gran
  parte del beneficio del caching.
approach: >
  Analisi dei pattern di invalidazione reali, non presunti. Refactor completo
  della strategia di caching, proposto ed eseguito in autonomia, senza fermare
  il sistema che il team usava ogni giorno.
result: >
  Throughput della query critica portato a 41 volte il valore di partenza,
  zero downtime durante il rollout.
lesson: >
  Il bug più costoso è spesso il più noioso: nessuna invalidazione era
  "sbagliata" singolarmente, il problema era la disciplina complessiva nella
  gestione della cache.
---
