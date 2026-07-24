# Threat model AI — nel vocabolario MITRE ATLAS

> Le difese di questo sito sono nate prima del loro nome ATLAS: questo documento le mappa
> sulla tassonomia (release **2026.06**, la stessa servita dallo strato IA del Radar) perché
> un threat model che parla il vocabolario standard si confronta, si audita e si aggiorna.
> Ogni difesa citata porta la **prova** (`file:riga`) e, dove esiste, il test che la guarda.
> Convenzione: gli ID tecnica sono verificati contro `dist/v6/ATLAS-2026.06.yaml`, non citati
> a memoria.

## Perimetro

I sistemi AI del sito sono quelli elencati in `/ai`: il comando `ask` del terminale (RAG +
Claude Haiku), la pipeline del magazine (`engine/`: ingest → generate → embed), il judge
(LLM-as-a-judge sui numeri), gli embedding (Voyage). Il Radar **non** è un sistema AI e la
pagina lo dichiara.

**Fatto strutturale che taglia mezza tassonomia**: il sito non possiede modelli — niente
pesi, niente training, modelli di terzi via API (Anthropic, Voyage). Le tattiche su
training e furto del modello sono **non applicabili per architettura**, non per mitigazione
(v. ultima sezione).

## Mappa: tecnica ATLAS → vettore concreto → difesa → prova

### AML.T0093 — Prompt Infiltration via Public-Facing Application
`/api/ask` è esattamente la superficie descritta: input libero dal pubblico verso un LLM.

| Difesa | Prova |
|---|---|
| Turnstile + rate limit per IP | `astro-project/worker/index.js:210-212` (`ASK_LIMITER`) |
| Body limitato prima del parse | `astro-project/worker/index.js:69` (`leggiBodyLimitato`) |
| Output cappato (500 token) | `astro-project/worker/index.js:316` |

### AML.T0051 — LLM Prompt Injection (diretta e indiretta)
| Difesa | Prova |
|---|---|
| **I permessi stanno nel codice, non nel prompt**: `ask` non ha tool, non ha azioni, può solo rispondere con testo | commento-contratto a `astro-project/worker/index.js:201` |
| Il system prompt è difesa in profondità, **non** LA barriera | `astro-project/worker/index.js:293` |
| L'output del modello è input non fidato nel DOM: tutto passa da `esc()` | `astro-project/src/components/NeonTerminal.astro:56,100` |

### AML.T0070 / AML.T0071 — RAG Poisoning / False RAG Entry Injection
Il vettore vero del sito: contenuti di terzi entrano dai canali di sourcing (Valyu, Radar)
e potrebbero puntare ad avvelenare ciò che il RAG serve.

| Difesa | Prova |
|---|---|
| La RPC del RAG serve **solo** `published`; il publish gate è **in DB**, non in applicazione | `supabase/migrations/0006_publish_gate.sql:6-7` |
| `published` richiede verify **umano** con tier (1, o 2+indipendente) | stesso gate; il tier non è mai assegnato da un modello |
| Il testo di terzi è **dato, mai istruzioni** nella generazione | `engine/ingest.mjs:14`; stesso contratto in `engine/lib/radar-signals.mjs` |
| Gli item del Radar passano la barriera di dominio | `astro-project/worker/radar.js` (`hostAmmesso`), test in `radar.test.mjs` |

### AML.T0080 — AI Agent Context Poisoning
L'unico "agente" è la pipeline del magazine, e il suo contesto ingerisce web di terzi.

| Difesa | Prova |
|---|---|
| Autonomia cappata dai **due gate umani** (verify tier + merge contenuti) | `0006_publish_gate.sql`; regola nel `CLAUDE.md` di repo |
| Judge consultivo post-generazione (referto + exit code, mai bloccante per scelta) | `engine/judge.mjs:106` |

### AML.T0056 / AML.T0069.002 — Extract LLM System Prompt
Rischio **accettato per progetto**: il system prompt di `ask` non è un segreto né un
controllo di sicurezza — estrarlo non conferisce alcuna autorità (i permessi stanno nel
codice, v. sopra). Nessuna difesa dedicata, ed è una scelta, non una dimenticanza.

### AML.T0029 — Denial of AI Service
| Difesa | Prova |
|---|---|
| Rate limit per IP + Turnstile prima del modello | `astro-project/worker/index.js:210-212` |
| `max_tokens: 500` — il costo per richiesta è cappato | `astro-project/worker/index.js:316` |
| Fail-open dichiarato: modello giù = risposta degradata, non 500 | attributo `esito: degradato` in `astro-project/worker/langfuse.js` |

### AML.T0024 — Exfiltration via AI Inference API
Il RAG può esfiltrare solo ciò che è già pubblico: serve esclusivamente contenuto
`published`, che sta sul sito alla luce del sole. Il canale competitor (dati interni) è
**deny-all a livello RLS e non entra mai nel RAG** (`supabase/migrations/0002_channel2_competitors.sql:40`, ADR-0004).

### Non applicabili per architettura (dichiarato, non dimenticato)
`AML.T0020` (Poison Training Data), `AML.T0018` (Poison AI Model), `AML.T0058` (Publish
Poisoned Models), model theft/inversion: **nessun training e nessun modello proprio**.
Il rischio residuo è di filiera — la fiducia nei modelli API di Anthropic/Voyage — ed è
gestito come supply chain (SHA pinning, SBOM, attestation), non come difesa ML.

## Misurare (NIST AI RMF — funzione *Measure*)

Le metriche dichiarate, tutte esistenti oggi (niente dashboard da costruire):

| Metrica | Dove si legge | Quando |
|---|---|---|
| **Esito delle richieste `ask`**: `ok` / `degradato` / `zero-match` | attributo `esito` delle trace Langfuse (`worker/langfuse.js`) | a campione; un'impennata di `zero-match` = RAG che non copre le domande vere |
| **Verdetto del judge** per numero (promosso/bocciato + referto) | commento sulla PR di contenuto; exit code `engine/judge.mjs:106` | a ogni numero |
| **Silenzi e anomalie**: KEV muto, blackout Radar, cron che non partono | Sentry (segnalazioni + cron check-in) | a notifica |

Il criterio di lettura è scritto qui perché una metrica senza soglia d'attenzione è
arredamento: `zero-match` in crescita → si arricchisce il magazine, non si "tuna" il RAG;
judge che boccia due numeri di fila → si riapre l'editoriale, non si abbassa la barra.

## Retention della telemetria AI

- **Contenuti utente: mai raccolti, per costruzione.** Né la domanda né la risposta di
  `ask` lasciano il Worker verso Langfuse — solo numeri (token, tempi, esito) e un session
  id casuale per visita. Lo dice `/privacy`, lo implementa `worker/langfuse.js` ("SOLO
  NUMERI, MAI CONTENUTI") e **un test dedicato lo fa rispettare** (`astro-project/test/worker.test.mjs:397`).
  La retention del contenuto è quindi un non-problema: non c'è contenuto.
- **Telemetria (i numeri): 90 giorni.** Bastano per debug e per la metrica `esito` su una
  stagione; oltre, è accumulo. ⚠️ *Applicazione: la retention si imposta nel progetto
  Langfuse (impostazione una tantum, mano di Marco) — questa riga è la policy, quella è
  l'attuazione.*

## Manutenzione di questo documento

Si aggiorna quando: (1) entra un sistema AI nuovo in `/ai`; (2) MITRE pubblica una release
ATLAS con tecniche RAG/agent nuove (`node engine/atlas.mjs` la porta nel Radar — questo
documento va riletto nello stesso giro); (3) un incidente reale smentisce una riga qui
sopra — nel qual caso la riga si corregge, non si difende.
