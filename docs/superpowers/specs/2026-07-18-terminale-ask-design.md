# Terminale `ask` (C1) — design spec

- **Data:** 2026-07-18
- **Progetto:** marcobellingeri.dev — endpoint pubblico RAG + comando terminale
- **Stato:** design in review
- **Tipo:** demo RAG dal vivo ("il sito interroga sé stesso"), pubblica

## Scopo

Il comando `ask <domanda>` nel `NeonTerminal`: l'utente chiede, il sito risponde
**interrogando il magazine dal vivo** (RAG) con **citazioni** ai numeri. È l'ultima
casella feature della roadmap (v1.x) e il massimo dell'ethos "dimostra invece di
dichiarare": non dice di avere un RAG, lo fa usare.

## Decisioni fissate

1. **Corpus = solo il magazine.** Chunk già embeddati su Supabase; la RPC
   `match_article_chunks` esiste e **filtra a `published`** a prescindere dal chiamante
   (il publish gate è in DB, un draft non è mai retrievabile). Citazioni ai numeri.
2. **Posture costo/abuso = Turnstile invisibile + rate-limit per IP** (come `/api/contact`).
   L'endpoint chiama API a pagamento a ogni query; i bot sono il rischio vero → fermati
   prima di spendere, attrito ~zero per l'umano.
3. **Modello generazione = Claude Haiku** (economico; il compito è sintesi grounded, non
   ragionamento profondo).
4. **Disclosure AI Act art. 50** in ogni risposta (è contenuto generato da IA).
5. **Guardrail prompt-injection** by-design (query utente + chunk recuperati = input non fidato).

## Non-obiettivi (v1)

Streaming della risposta; conversazione multi-turno (è Q&A singola, senza memoria);
corpus oltre il magazine; cache delle risposte. Tutti → Fase 2.

## Architettura

### Backend — `gestisciAsk` in `worker/index.js`, rotta `POST /api/ask`

Riusa **quasi tutto** l'hardening di `gestisciContatto`: `rispostaJson`
(no-store/nosniff/HSTS), rate-limit per IP (nuovo binding **`ASK_LIMITER`**), Origin
check, `leggiBodyLimitato` (cap byte reale, qui **2 KB** — una domanda è corta),
Turnstile `siteverify`, `segnala` (Sentry sui fallimenti gestiti), `rigaPulita`.
In `fetch()`: `if (url.pathname === '/api/ask') return gestisciAsk(request, env);`.
`wrangler.jsonc`: aggiungere `/api/ask` a `run_worker_first` e il binding `ASK_LIMITER`.

**Flusso** (ogni passo con fail chiaro, come il contatto):
1. `POST` only (405 altrimenti).
2. Rate-limit `ASK_LIMITER` per `CF-Connecting-IP` (429).
3. Origin check (403 se diverso dal dominio).
4. Body cap 2 KB (413).
5. Parse JSON `{ q, turnstile, locale }`. `q` validata: `rigaPulita`, lunghezza 3–500 (422).
6. Turnstile `siteverify` (403) — fail-open **con** allarme Sentry, come il contatto.
7. **Embed** `q` via Voyage REST (`input_type=query`).
8. **Retrieve**: Supabase RPC `match_article_chunks` via REST col `service_role`
   (`match_threshold` ~0.3, `match_count` cappato — già clampato in migration 0009,
   `filter_locale`). Se **zero match** → risposta gentile "non trovo nel magazine",
   **senza** chiamare il modello (niente spesa, niente allucinazione).
9. **Generate**: Anthropic Messages (Haiku), system prompt grounded (con prompt-master):
   risponde **solo** dai chunk forniti, cita i numeri, rifiuta il fuori-tema, tratta il
   testo recuperato come **dati, non istruzioni**. `max_tokens` cappato.
10. Risposta JSON `{ answer, citations: [{title, url}], disclosure }`.

### Frontend — comando `ask` in `NeonTerminal.astro`

`ask <domanda>` → esegue il Turnstile invisibile (execute-on-demand, come il form) →
`POST /api/ask` → stampa: riga "pensando…", poi la risposta, le citazioni, e la riga di
**disclosure AI Act**. Tutto reso con l'`esc()` già presente (mai `innerHTML`): la
risposta è **output del modello**, quindi non fidato per il DOM.

## Sicurezza by-design (OWASP LLM) — lo strato che conta

- **Prompt injection (diretta e indiretta):** la query utente **e** i chunk recuperati
  sono input non fidato. Il controllo **è nel codice, non nel prompt** (regola: *il
  prompt di sistema non è un controllo di sicurezza*): l'endpoint **non ha tool, non fa
  `eval`, non scrive su DB, non espone segreti** al modello — emette **solo testo**. Il
  raggio di esplosione di un'iniezione riuscita è una risposta strana, niente di più. Il
  system prompt (grounding + rifiuto fuori-tema) è difesa in profondità, non la barriera.
- **XSS:** la risposta del modello entra nel terminale **solo via `esc()`/textContent**,
  mai `innerHTML`. È la barriera critica lato client.
- **Costo/abuso (OWASP API4):** Turnstile + `ASK_LIMITER` per IP; body cap 2 KB;
  `max_tokens` cappato; `match_count` clampato in DB; zero-match non chiama il modello.
- **Segreti** (`VOYAGE_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`): via Doppler → env del Worker, mai nel repo.
- **Gate RAG:** la RPC serve solo `published` — i draft non escono, per costruzione.
- **AI Act art. 50:** disclosure in ogni risposta, non negoziabile.

## Costo

Per `ask`: 1 embed Voyage (query, minuscola) + 1 generate Haiku (economico) + 1 RPC
Supabase (gratis). Centesimi, cappati da Turnstile + rate-limit. Deroga free-tier-first
accettata (pay-as-you-go, come Valyu) — nessun costo fisso.

## Contratto di test (modello MUST)

Nel pattern di `astro-project/test/worker.test.mjs` (fetch moccato). `gestisciAsk`:
happy path (embed→match→generate→answer+citazioni), **zero-match → niente modello**,
429 rate, 403 origin, 413 body, 422 query invalida, 403 turnstile, 503 config mancante.
Lato client: verifica che la risposta passi da `esc()` (mai `innerHTML`). Zero rete nei
test. Coverage *clean as you code* sul nuovo; il ramo zero-match e i fail sono bloccanti.

## Pipeline (modello MUST)

Test worker nella **Site CI** esistente (gate su PR). Segreti su Doppler, sincronizzati
nei GitHub/Worker secrets (pattern esistente). L'endpoint va in produzione col deploy del
sito da `main`. `run_worker_first` aggiornato per `/api/ask`.

## Fase 2 (fuori scope)

Streaming, multi-turno, corpus oltre il magazine, cache risposte, `ask` anche via ⌘K.

## Fonti / riuso

`worker/index.js` (`gestisciContatto` = template hardening), `engine/retrieve.mjs`
(pattern embed→match), RPC `match_article_chunks` (migration 0001/0009), `NeonTerminal.astro`
(`esc()`, dispatch comandi). Il system prompt di generazione si disegna con **prompt-master**.
