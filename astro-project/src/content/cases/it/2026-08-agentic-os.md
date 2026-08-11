---
lang: "it"
month: "Agosto 2026"
date: 2026-08-01
title: "Agentic OS — la telemetria di Claude Code, in produzione"
stat: 3
problem: >
  Ogni sessione di Claude Code manda la sua telemetria a un hub che ho costruito,
  e da lì un widget pubblico su questo sito ne mostra i numeri. Misurato contro
  il client vero (v2.1.220), Claude Code spedisce cinque attributi di identità
  insieme alle metriche, e uno di quelli porta il mio indirizzo email reale.
  Tutto ciò che arriva a Prometheus diventa una label, e una label è per sempre.
approach: >
  La prima versione cancellava i cinque attributi conosciuti. È una deny-list, e
  una deny-list a un confine di privacy fallisce aperta su tutto ciò che non ha
  ancora sentito nominare: la telemetria di Claude Code è in beta, il suo insieme
  di attributi non è un contratto, e la prossima release può aggiungerne un sesto.
  Ora nel Collector c'è un allow-list che tiene sei chiavi note e scarta il resto,
  prima del batch, così un attributo sconosciuto diventa una label mancante invece
  che una fuga. Verificato contro il client vero, compresi attributi che nessuna
  versione emette ancora.
result: >
  L'identità non arriva nemmeno all'archivio. L'intero hub è fatto di cinque
  servizi su Railway con un solo ingresso, dietro un Cloudflare Tunnel, e la sua
  superficie pubblica sono tre numeri aggregati: sessioni, token, costo. Quando l'hub
  non risponde il sito scrive tre trattini invece di uno zero, perché uno zero
  sembrerebbe una risposta.
lesson: >
  Il costo del compromesso è dichiarato, non nascosto: un produttore nuovo le cui
  label non sono in lista se le vede sparire in silenzio. È la direzione in cui
  voglio che fallisca. Cancellare ciò che conosci ti protegge fino alla prossima
  release di qualcun altro.
---
