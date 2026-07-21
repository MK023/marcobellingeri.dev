---
lang: it
title: "Dal parsing del JSON nel testo al tool use di Claude in JobSearch"
date: 2026-07-21
description: "Avevo cinque funzioni il cui unico mestiere era riparare JSON che Claude aveva appena scritto. Una PR le ha cancellate tutte, e la sorpresa è arrivata dopo il lancio."
tags: [ai, python, claude, programming]
---

Il mio tool per la ricerca di lavoro aveva cinque funzioni il cui unico mestiere era riparare JSON che Claude aveva appena scritto. `_clean_json_text`, `_fix_unescaped_newlines`, `_fix_single_quotes`, `_strip_markdown_wrapper`, `_extract_and_parse_json`. Ce n'era anche una sesta, `_retry_json_fix`, che prendeva il JSON rotto e lo rimandava al modello chiedendogli gentilmente di sistemare il pasticcio suo. Le ho scritte tutte io, un bug alla volta, nel giro di settimane. E ne ero pure un po' fiero.

Era quello il problema.

## Come si arriva ad avere cinque parser

JobSearch è il mio tool personale, in produzione, un solo utente: io. Pesca offerte di lavoro da nove job board e, quando premo "Analizza", Claude legge l'offerta contro il mio CV e restituisce un verdetto strutturato: punteggio, raccomandazione, career track, il livello d'inglese che l'annuncio chiede davvero. Quel verdetto deve essere JSON, perché tutto quello che viene dopo è una riga di database, non prosa.

La prima versione faceva quello che fanno tutti i tutorial. Chiedi il JSON nel prompt, prendi `response.content[0].text`, ci lanci sopra `json.loads`. In demo funzionava, poi la produzione ha cominciato a insegnarmi le cose.

Il modello incorniciava il JSON nei fence markdown, e ho scritto una funzione che li toglieva. Ogni tanto usava gli apici singoli, e ho scritto una funzione che li correggeva. Poi una descrizione con un a capo dentro una stringa, ed è nata `_fix_unescaped_newlines`. Poi un `NaN` dove doveva esserci un numero. Ogni fix era cinque righe, palesemente giusto, coi suoi test. I nomi dei test sono ancora nella storia git e letti in fila suonano come una confessione: `test_removes_trailing_commas`, `test_replaces_nan_with_null`, `test_replaces_infinity`, `test_unclosed_fence_still_strips_opening`.

Ad aprile lo strato di parsing era sulle 250 righe con sette strategie in catena, ognuna a raccogliere quello che la precedente lasciava passare. L'ultima spiaggia era la chiamata di auto-riparazione: se non parsava niente, rimandavi l'output rotto al modello e gli chiedevi di ripararlo. Una seconda chiamata API, con latenza vera e costo vero, per un problema di formato che la prima chiamata non avrebbe dovuto avere.

Avevo una suite di test che garantiva che il mio codice sopravvivesse a output che nessuno avrebbe mai dovuto produrre. Quella non è robustezza. È una segnalazione di bug spedita al destinatario sbagliato.

## Il fix vero

L'API di Anthropic ha il tool use. Di solito lo usi per far chiamare al modello le tue funzioni. Ma ha una lettura più severa: se definisci un solo tool il cui schema d'input è la forma della risposta che vuoi, e lo forzi con `tool_choice`, il modello non può rispondere in nessun altro modo. Il JSON arriva già parsato, validato contro lo schema dall'API stessa, come dict Python sull'oggetto risposta.

Il modello Pydantic dell'analisi ce l'avevo già, perché serviva alla riga di DB. Quindi lo schema era gratis:

```python
def _schema_from_model(model_cls: type[BaseModel]) -> dict[str, Any]:
    """JSON Schema da un modello Pydantic, pronto per input_schema."""
    ...

response = client.messages.create(
    model=model_id,
    system=system,
    messages=[{"role": "user", "content": user}],
    tools=[{
        "name": "submit_analysis",
        "description": "Return the structured job analysis.",
        "input_schema": _schema_from_model(JobAnalysis),
    }],
    tool_choice={"type": "tool", "name": "submit_analysis"},
)
block = next(b for b in response.content if b.type == "tool_use")
data = block.input  # un dict, parsato dall'SDK, niente testo di mezzo
```

Il refactor è atterrato il 14 aprile in un commit solo: tutte le chiamate AI del codebase migrate, i cinque parser cancellati, il fallback di auto-riparazione cancellato, il file di test sul JSON spazzatura cancellato con loro. Il messaggio di commit dice meno 200 righe e si tiene basso, perché le righe uscite erano proprio quelle che dovevo rileggermi ogni volta che qualcosa si rompeva.

Era la PR che faceva paura, in mezzo a un pomeriggio in cui io e Claude ne abbiamo portate in produzione tredici. Di quel giorno ho scritto [a parte](https://dev.to/mk023/how-i-shipped-13-prs-in-one-afternoon-pair-programming-with-claude-and-what-i-learned-1274). Dodici erano ordinaria amministrazione. Questa cancellava una rete di sicurezza e la sostituiva con la promessa di un'API, nello stesso diff.

Una cosa l'ho tenuta: la validazione Pydantic dopo la chiamata. Lo schema garantisce la forma, non il senso. Un punteggio di 950 su un campo 0-100 è JSON perfettamente conforme allo schema ed è comunque spazzatura, e l'output del modello resta input non fidato in qualunque confezione arrivi. Il contratto si è spostato dentro l'API; il controllo è rimasto dalla mia parte.

## La sorpresa è arrivata dopo il lancio

Ed ecco la parte che non mi aspettavo, il motivo per cui questo pezzo non è solo "usa il tool use e cancella i parser".

Con l'output testuale il modello prendeva le mie regole di prompt un po' alla leggera, e il caos del parsing lo copriva. Con lo schema forzato obbedisce molto più alla lettera. Avevo una regola di fallback per le posizioni freelance: gli annunci italiani ogni tanto vogliono la P.IVA, e quello cambia se l'offerta per me ha senso oppure no. La regola diceva, più o meno, "se lo status freelance è ambiguo, segnalalo". Col tool use il modello ha cominciato a segnalare offerte che nominavano il freelance di passaggio, una riga sui contractor di un altro team, qualsiasi cosa. Ambiguo era silenziosamente diventato "nominato da qualche parte".

Lo schema ha reso il modello più obbediente, e l'obbedienza ha messo in piazza quanto erano sciatte le mie istruzioni. Il fix non era codice. Era riscrivere il prompt con precedenze esplicite: vince il tipo di contratto dichiarato nell'offerta, il fallback scatta solo quando è l'offerta stessa a parlare di contratto senza chiuderlo.

Quindi la lezione che ho pagato davvero: quando passi dal parsing testuale al tool use, le regole interpretative del prompt vanno strette, non allentate. Il modello smette di improvvisare sul formato e comincia a prendere sul serio le tue parole. Se le regole erano vaghe, lo scopri adesso.

## Cosa direi al me di prima

I parser non sono mai stati programmazione difensiva. Erano il sintomo che il contratto viveva dal lato sbagliato della chiamata API, e ogni nuova funzione di riparazione ero io che rinegoziavo quel contratto nel posto peggiore possibile, dopo la risposta, un caso limite alla volta.

Se la tua pipeline ha una funzione che si chiama `_fix_single_quotes`, non ti serve un parser migliore. Sposta la forma in `input_schema`, forza il tool, tieniti la validazione e cancella il museo. Poi vatti a rileggere il prompt, perché il modello sta per cominciare a credere a ogni sua parola.
