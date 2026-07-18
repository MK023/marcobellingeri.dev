# Security Audit — marcobellingeri.dev

**Data:** 2026-07-11 · **Autore:** audit automatico (Claude) · **Scope:** intera repo
(frontend Astro, Worker Cloudflare, CI/CD, engine Node, Supabase, config).
**Modalità:** sola lettura + build servita in locale + probe read-only sugli header
live (`curl -sI`). Nessuna modifica al codice, nessun POST/carico verso la produzione.
**Nota:** file committato e pubblico per scelta (SECURITY.md lo linka): la postura
si dichiara, non si nasconde.

**Aggiornamento 2026-07-11 (post-remediation):** **tutti e 3 i Low risolti** e in
produzione (PR #34, #35, #36). Verificato dal vivo che l'HSTS ora compare anche sulle
risposte del Worker. Restano solo gli Info (nessuno actionable). Dettaglio nelle sezioni.

**Aggiornamento 2026-07-12 (audit round 2):** un secondo audit sull'intera repo
(engine incluso, entrato in scope dopo questo report) ha trovato 1 High (dati
personali hardcodati in `scripts/genera-cv.py`, ora sostituiti da digest sha256 —
il dato resta nella history), 5 Medium e una coda di Low/Info: **tutti gli
azionabili corretti nella stessa PR**. Dettagli nei commit dell'audit round 2.

**Aggiornamento 2026-07-13:** dal triage dei code smell SonarCloud è emerso **M-1**, un
ReDoS vero in `sanitizeSource` (backtracking quadratico su `raw_content` di terzi non
ancora limitato) — **risolto**, con test di regressione sulla linearità. Nello stesso
giro il fix di **L-1 è passato da "dedotto" a "verificato"**: il percorso Worker → Sentry
non era mai stato visto funzionare in vita sua, ora lo è (vedi *Metodo e limiti*).

---

## Executive summary

La codebase è **matura e ben difesa**. Le difese dichiarate nei commenti sono
implementate davvero e, dove verificabili, reggono: validazione al confine di fiducia
nel Worker, CSP a hash senza `unsafe-inline`, parametrizzazione PostgREST, RLS completa
su Supabase, actions CI pinnate a SHA, secret fuori dal repo (gitleaks pulito su 88
commit). L'XSS "pending" annotato in Atlas per `ArchiveSection.astro` **risulta già
chiuso** (costruzione DOM nodo-per-nodo + whitelist di protocollo, nessuna scrittura
HTML grezza).

Nessun finding **Critical** o **High**. Il tema ricorrente dei residui è stato per mesi
lo stesso: *fail-open silenziosi* — difese che, cadendo, non lo dicono a nessuno. Il caso
esemplare era `TURNSTILE_SECRET_KEY`: se sparisse in produzione, la protezione bot si
spegnerebbe senza un allarme. Oggi l'allarme c'è **ed è stato visto suonare** (L-1, e
*Metodo e limiti*). Il finding più severo mai trovato — M-1, un ReDoS su input di terzi —
è arrivato dallo stesso filone: non un buco aperto, ma un costo nascosto su un input che
nessuno limitava.

| Severità | Aperti | Risolti |
|----------|--------|---------|
| Critical | 0 | — |
| High     | 0 | — |
| Medium   | 0 | 1 (M-1, ReDoS — 2026-07-13) |
| Low      | 0 | 3 (L-1, L-2, L-3) |
| Info     | 4 | — |

Verifiche eseguite: `npm run build` (verde) · `npm run test:csp` (**53/53 pass**,
incl. il test anti header-injection) · suite engine (**93 test**, righe 100%) ·
`gitleaks detect` full-history (**no leaks**) · zero `.map` nella `dist/` · header di
sicurezza confermati serviti su `/it/` · percorso Worker → Sentry provato end-to-end.

---

## Findings

### L-1 — Turnstile fail-open silenzioso se il secret manca (Low) — ✅ RISOLTO
> **Risolto** in PR #34 (commit `9ca7695`, in produzione). Aggiunto il ramo `else` che
> chiama `segnala()` verso Sentry quando `TURNSTILE_SECRET_KEY` è assente, mantenendo il
> fail-open. Test `contatto: TURNSTILE_SECRET_KEY mancante = fail-open ma segnalato a
> Sentry`. Issue #33 chiusa. *(Descrizione originale del finding sotto.)*

**File:** `astro-project/worker/index.js:100-108`
La verifica Turnstile è dentro `if (env.TURNSTILE_SECRET_KEY) { … }`. È fail-open per
scelta (in locale/test il secret non c'è). Ma in **produzione** una regressione di
config — secret cancellato in Doppler, typo nel nome del binding — disattiva del tutto
la verifica bot **in silenzio**. Contrasta col trattamento di `RESEND_API_KEY:600`, la
cui assenza chiama `segnala()` verso Sentry e ritorna 503.
**Scenario:** secret Turnstile assente + richiesta senza header `Origin` (curl, `L-2`) +
honeypot vuoto → l'unica barriera residua è il rate-limit (~5/min/IP). Spam/abuse del
form senza che nessuno lo sappia.
**Raccomandazione:** in produzione, se `TURNSTILE_SECRET_KEY` è assente, chiamare
`segnala('contact: TURNSTILE_SECRET_KEY mancante in produzione')` (come per Resend).
Decidere se fail-open (alert) o fail-closed (503). Niente fix applicato.

### L-2 — Il cap da 32 KB si fida di `Content-Length` (Low) — ✅ RISOLTO
> **Risolto** in PR #35 (in produzione). Nuovo helper `leggiBodyLimitato()`: legge lo
> stream del body con un tetto di byte e si ferma (`reader.cancel()`) appena supera 32 KB,
> senza fidarsi di `Content-Length`. Test riscritto sul peso reale + guard di regressione
> (header gonfiato con body piccolo non scatta più il cap). *(Descrizione originale sotto.)*

**File:** `astro-project/worker/index.js:76-78`
Il guard legge `Content-Length` dall'header e, se assente, usa `'0'` → il check passa e
`request.json()` bufferizza comunque il body. Una richiesta con `Transfer-Encoding:
chunked` o senza `Content-Length` **aggira il cap dichiarato**.
**Scenario:** POST senza `Content-Length` con body > 32 KB → il cap non morde; il parse
avviene comunque. Impatto reale limitato: il runtime Cloudflare Workers impone comunque
un tetto di piattaforma al body e alla CPU, e il rate-limit per-IP delimita il volume.
**Raccomandazione:** trattare il cap come best-effort (com'è) oppure imporlo dopo il
parse misurando la dimensione effettiva del payload. Da confermare quale limite il
runtime applichi davvero a un body chunked. Basso impatto — nota di robustezza.

### L-3 — Le risposte del Worker non portano HSTS (Low) — ✅ RISOLTO
> **Risolto** in PR #36 (in produzione). Costante `HSTS` aggiunta a `rispostaJson()` e
> alla risposta 302, allineata a `_headers`. Verificato dal vivo: `curl -sI` mostra ora
> `strict-transport-security` sul 302 della root e sul 405 di `/api/contact`. *(Descrizione
> originale sotto.)*

**File:** `astro-project/worker/index.js:22-32` (JSON API), `:155-161` (302 root)
`public/_headers` copre solo gli asset statici; le risposte generate dal Worker (il 302
su `/` e le risposte di `/api/contact`) non passano di lì e **non portano HSTS**.
**Mitigazione forte:** il dominio è `.dev`, TLD con **HSTS preload obbligatorio a
livello di TLD** — i browser forzano HTTPS a prescindere. Il probe conferma: `curl -sI
https://marcobellingeri.dev/` (302) non ha `Strict-Transport-Security`, mentre `/it/`
sì. Coerente con la scelta documentata ("root spoglia, preload dal TLD").
**Raccomandazione:** nessuna azione necessaria finché il dominio resta `.dev`. Se un
giorno si aggiungesse un dominio non-preload, aggiungere HSTS anche in `rispostaJson` e
sul 302.

### M-1 — ReDoS in `sanitizeSource`: backtracking quadratico su testo di terzi (Medium) — ✅ RISOLTO
**File:** `engine/lib/guardrails.mjs:69` (PR #53, 2026-07-13)
Il lookahead che neutralizza il delimitatore `<fonte>` girava su testo **non ancora
limitato**: il tetto di 6000 caratteri è l'ultimo anello di `sanitizeSource`, quindi il
`.replace()` vedeva il `raw_content` **grezzo** della fonte scrapata. Il pattern
`/<(?=\s*\/?\s*fonte\b)/gi` aveva due `\s*` ambigui attorno a una `/` opzionale: gli
spazi se li potevano contendere entrambi, e su una corsa di spazi il matching andava in
tempo **quadratico**.

Misurato prima del fix — raddoppiando l'input il tempo quadruplica: 2k spazi → 2,4 ms;
4k → 9,1 ms; 8k → 37,7 ms; 16k → **149 ms**. Estrapolando, una pagina ostile da 1 MB
avrebbe bloccato l'engine per **minuti**. L'attaccante è una pagina web scrapata, cioè
proprio l'input che l'engine per mestiere non controlla.

**Fix:** gli spazi li può mangiare un solo quantificatore (il secondo viene solo dopo una
`/` letterale, niente ambiguità) e sono limitati a 8 — nessun delimitatore vero ne ha di
più. Dopo: 200k spazi in **1 ms**. Un test di regressione fissa la **proprietà** (il
costo non esplode col quadrato dell'input), non la velocità, così una futura
"semplificazione" della regex fa fallire la CI invece di riaprire il buco in silenzio.

*Nota sul metodo:* la stessa regola Sonar (S8786) segnalava altre due regex — lo slug e
la validazione email del Worker — che però lavorano su input **già troncato a 200
caratteri**: teoricamente ambigue, praticamente innocue. Stessa regola, stessa gravità
dichiarata, rischio opposto: a distinguerle è stato il grafo dei chiamanti, non la
severità dell'analizzatore. Sono state comunque rese non ambigue.

### I-1 — Engine fuori dalla copertura Dependabot (Info) — ✅ RISOLTO

> **Risolto** (2026-07-18): aggiunta la voce `npm` con `directory: "/engine"` in
> `dependabot.yml`. Oggi non produce nulla (zero dipendenze), ma la prima dipendenza
> futura nasce già coperta — il promemoria era il punto debole. *(Descrizione originale sotto.)*

**File:** `.github/dependabot.yml`, `engine/package.json`
`dependabot.yml` monitora `npm` solo in `/astro-project` e le `github-actions`.
L'engine **oggi non ha dipendenze** (solo built-in Node + `fetch` nativo, nessun
lockfile) → superficie supply-chain nulla, nessun gap concreto. Ma se un domani l'engine
aggiungesse una dipendenza, **Dependabot non la vedrebbe**.
**Raccomandazione:** promemoria — quando l'engine acquisirà un `package-lock.json`,
aggiungere una terza voce `npm` con `directory: "/engine"`.

### I-2 — `img-src 'self' data:` nella CSP (Info)
**File:** `astro-project/astro.config.mjs:23`
`data:` in `img-src` è storicamente un vettore XSS minore (immagini data-URI). Nel
contesto (sito statico, nessun input utente che genera `<img>`) il rischio è
trascurabile ed è lì per i subset di font/asset inline. Nessuna azione.

### I-3 — Rate-limit per-IP, approssimato e per-location (Info)
**File:** `astro-project/worker/index.js:57-66`, `wrangler.jsonc:18-20`
Il binding è "eventually consistent, intentionally not accurate" (per design
Cloudflare) e keyed su `CF-Connecting-IP`. Un attaccante con un blocco IPv6 /64 dispone
di molti IP. È difesa-in-profondità, non la barriera primaria (lo sono Turnstile +
honeypot). Coerente con la documentazione. Nessuna azione.

### I-4 — `reply_to` email non passa da `rigaPulita` (Info — non sfruttabile)
**File:** `astro-project/worker/index.js:92, 122`
L'email finisce in `reply_to` senza passare dal filtro dei caratteri di controllo. **Non
è sfruttabile**: la regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` vieta ogni whitespace (incluso
`\r\n`) nell'intera stringa, quindi la CRLF-injection è impossibile; inoltre si invia
JSON all'API Resend (non SMTP grezzo), che gestisce l'encoding degli header. Il test
`test/csp.test.mjs` copre già l'header injection nel subject. Documentato per completezza.

---

## Difese confermate (ciò che regge, con la prova)

- **Worker `/api/contact`** — ordine dei controlli corretto (rate-limit → Origin →
  cap body → parse → honeypot → validazione → Turnstile → Resend): i check economici
  precedono quelli costosi; la fetch esterna (Turnstile) sta dopo la validazione locale.
  `rigaPulita:36` neutralizza la CRLF-injection nel subject — **verificato dal test**.
- **XSS lato client** — grep completo su `src/`: nessun `set:html`, nessun sink di
  scrittura HTML non controllato. `ArchiveSection.astro` costruisce il DOM con
  `createElement`/`textContent`/`replaceChildren` e filtra i link con `new URL()` +
  whitelist `http/https` (`:149-160`). `NeonTerminal.astro` usa `innerHTML` solo su
  costanti hardcoded; **ogni** input utente passa da `esc()` (`:213, :220`) che copre
  `& < > " '`.
- **CSP** — `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, **nessun `unsafe-inline`/`unsafe-eval`**, script a hash SHA-256.
  Host esterni minimi e giustificati (Turnstile, ingest Sentry DE, cal; api.github.com
  rimosso nel round 2: era il residuo di una feature eliminata).
  `frame-ancestors 'none'` in `_headers` (clickjacking coperto). `test:csp` valida gli
  hash sulla `dist/` reale, non sul sorgente.
- **Header live** — probe `curl -sI` su `/it/`: HSTS `preload`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` tutti presenti e serviti.
- **CI/CD** — nessun `pull_request_target`; nessuna interpolazione `${{ github.event.* }}`
  in blocchi `run:` (niente script injection); actions pinnate a SHA con commento
  versione; `permissions` least-privilege per workflow (`deploy` solo `contents: read`;
  keepalive/radar `issues: write` giustificato). `deploy.yml` verifica gli header
  **post-deploy** sul sito vero, non sull'exit code di wrangler. Le sourcemap Sentry
  sono cancellate dopo l'upload (`filesToDeleteAfterUpload`) — **0 `.map` nella dist**.
- **Engine** — `lib/supabase.mjs` parametrizza le query PostgREST col template tag `pg``
  che codifica anche `!'()*` (i metacaratteri di `in.()`/`or=()`), difesa già pronta per
  il futuro endpoint pubblico. `lib/langfuse.mjs` è fail-open e **non spedisce mai
  `raw_content` di terzi** nelle trace (solo riassunti/conteggi). Il `SERVICE_ROLE_KEY`
  resta negli header delle richieste, mai loggato.
- **Supabase** — RLS abilitata su tutte le tabelle; `anon` legge solo `status='published'`;
  `signals` e `competitor_*` prive di policy anon = doppiamente negate. `match_article_chunks`
  **non è SECURITY DEFINER** (RLS si applica anche all'anon) e filtra comunque a
  `published`. RPC con `search_path` pinnato (`0003`). Il publish gate (`0006`) è
  `BEFORE INSERT OR UPDATE`: non bypassabile con insert diretto, ri-valida a ogni update.
  Il job `db-rebuild` in CI asserisce schema + RLS + gate a ogni push.
- **Secret / supply-chain** — `.gitignore` esclude `.env*` e `.dev.vars*`; `gitleaks`
  full-history **pulito** (88 commit); pre-commit hook con gitleaks staged + fallback
  grep; secret da Doppler → GitHub secrets, mai nel repo.

---

## Rischi futuri noti (non finding attuali)

- **Shiki + CSP** — il primo articolo con blocchi di codice introdurrà stili/script che
  romperanno la CSP a hash: `test:csp` fallirà alla build. Da gestire quando arriva il
  primo contenuto con codice (già annotato in memoria di progetto).
- **Endpoint pubblico C1 (ADR-0003)** — quando il terminale RAG diventerà interrogabile
  dal browser, i valori delle query PostgREST passeranno da input utente: il template
  `pg`` è già pronto, ma andrà verificato che *ogni* interpolazione lo usi.
- **Schedule GitHub a 60gg** — se il repo resta inattivo 60 giorni, il cron keepalive si
  spegne e Supabase va in pausa. Il rischio resta (GitHub non si può obbligare), ma dal
  2026-07-13 **non è più silenzioso**: un cron monitor Sentry si allarma sull'assenza del
  check-in. La scelta di metterlo *fuori* da GitHub è deliberata — un guardiano dentro lo
  stesso dominio di guasto che sorveglia non è un guardiano.

---

## Metodo e limiti

Audit statico + build servita in locale + probe **read-only** (GET) sugli header live.
**Non** eseguito, per scelta concordata: POST al form, test di carico, fuzzing attivo
dell'endpoint, scrittura su DB/prod. Le voci marcate "da confermare" (es. il
comportamento del runtime Workers su body chunked, `L-2`) richiederebbero un test attivo
in staging per essere chiuse con certezza. Nessun file del progetto è stato modificato.

### Aggiornamento 2026-07-13 — la segnalazione di L-1 è stata *verificata*, non dedotta

Il fix di L-1 poggiava su `segnala()` → Sentry, ma quel percorso **non era mai stato visto
funzionare**: fino a stamattina Sentry aveva ricevuto un solo evento in tutta la sua vita,
e veniva dal *browser*. Il Worker non gli aveva mai parlato — né via `withSentry`, né via
`__SEGNALA_SENTRY__`. Un allarme mai suonato e un allarme rotto si assomigliano troppo.

Verificato eseguendo il Worker (stesso bundle, stesso SDK, stesso DSN) **senza i due
secret**: entrambi i rami gestiti producono l'evento atteso in Sentry
(`TURNSTILE_SECRET_KEY mancante`, `RESEND_API_KEY mancante`). La produzione non è stata
toccata: i suoi secret non sono mai stati rimossi e il form live ha continuato a
rispondere 403 a una richiesta senza token.

*Limite residuo, dichiarato:* il test è girato su `workerd` in locale, non sull'edge di
Cloudflare. Bundle, SDK, DSN e ramo di codice sono gli stessi, quindi il dubbio è piccolo
— ma non è zero, e non lo si spaccia per zero. (Nota: `wrangler dev --remote` **non**
serve allo scopo — eredita i secret del Worker deployato, quindi il ramo "secret mancante"
lì è irraggiungibile per costruzione.)
