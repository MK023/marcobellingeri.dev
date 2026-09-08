---
lang: it
title: "Una settimana di run verdi, e la pipeline aspettava me"
date: 2026-09-08
description: "La pipeline del magazine è girata ogni mattina per una settimana e ha risposto success ogni volta. Dal primo del mese non aveva prodotto niente, perché era ferma a un gate che posso aprire solo io, e nessuno dei miei allarmi considera quello uno stato da segnalare."
tags: [devops, automation, monitoring, postgres]
edicola: "Otto run verdi, nessun pezzo"
---

Il primo settembre alle 10:57 UTC è girato l'ingest mensile. Ha aperto il numero 3 del magazine, ha scelto il verticale dal registro delle fonti, ha scritto 19 candidati su Postgres con `stage = 'discovery'` e ha aperto una issue su GitHub per dirmi che toccava a me.

Ogni mattina dopo quella, il job giornaliero è girato ed è andato a buon fine. Otto run verdi di fila, dal primo all'otto del mese. Il numero di articoli di settembre è rimasto zero per tutto il tempo.

## Il gate stava facendo il suo lavoro

Il job giornaliero non decide niente da solo. Chiede al database quale stadio eseguire, e la risposta dipende da una vista:

```sql
SELECT id, issue_id, source_url, tier, independent
FROM signals
WHERE stage = 'verify' AND (tier = 1 OR tier = 2 AND independent);
```

Niente soddisfa quella vista finché non mi siedo in Supabase Studio e taggo le fonti a mano. Tier 1 è una fonte primaria, un regolatore o l'ente che la cosa l'ha fatta davvero. Tier 2 vale solo se è indipendente da chi descrive, il che esclude la società di consulenza che racconta il proprio progetto come caso studio.

Quel giudizio è mio per scelta. È la barra editoriale del magazine, e non volevo che a decidere cosa vale come prova fosse un modello.

Così la funzione di decisione ha trovato un numero in bozza senza segnali verificati, ha restituito `niente` e ha stampato la ragione su stderr:

```
advance: signal in attesa di verifica in Studio
```

Poi è uscita con codice zero, correttamente. Non aveva niente da fare.

## Cosa sorvegliano davvero i miei allarmi

Ne ho tre, ed ero abbastanza soddisfatto.

Un cron che fallisce apre una issue su GitHub da solo. Un cron che non parte mai lo prende un guardiano giornaliero che chiede alla API di GitHub quando ogni schedule ha sparato l'ultima volta, perché uno schedule che GitHub ha disattivato in silenzio non produce nessun fallimento da segnalare. E siccome un guardiano dentro lo stesso dominio di guasto che sorveglia non è un guardiano, quel job fa anche il check-in su un monitor Sentry che allarma sul silenzio, da fuori GitHub.

Insieme coprono il job che si rompe e il job che non parte. Nessuno dei due è successo. È successo un job che gira, riesce e non fa niente, per sette giorni, perché aspettava una persona che non se n'era accorta.

## L'informazione c'era già

La parte che mi dà fastidio è che non era nascosto niente. La ragione è scritta ogni singola mattina, nel log della run, su stderr. Il job sa esattamente perché è fermo e lo dice a voce alta.

Quello che non sa è da quanto lo sta dicendo. `niente` il due del mese e `niente` l'otto sono la stessa stringa, e l'unica cosa che le separa è una settimana della mia attenzione andata altrove. Nessun allarme legge quella riga di log, e nessun contatore la trasforma in una durata.

Verde vuol dire che la macchina sta bene. Io lo stavo leggendo come "il lavoro avanza", e sono due affermazioni diverse.

## Com'è finita

L'otto ho aperto Studio e ho taggato 11 fonti su 19: due del regolatore come tier 1, nove report di analisti come tier 2 e indipendenti. Ho lasciato fuori un caso studio di un fornitore, che il test di indipendenza non lo passa per costruzione, e sette bollettini di sicurezza il cui corpo raccolto è solo il titolo.

Dopo di che la pipeline ha fatto il resto in pochi minuti. Generate ha scritto il pezzo da otto fonti, embed ha rifatto i chunk, export ha prodotto i due file markdown, e il giudice sulla pull request mi ha bocciato per attribuzione debole, che è il pezzo di un'altra volta.

Il numero di settembre è uscito con una settimana di ritardo. Non si era rotto niente, e tutte le run erano verdi.

Quindi non mi serve un quarto allarme. Mi serve che il job giornaliero conti le mattine passate a rispondere `niente`, e che quel numero lo dica dove guardo davvero.
