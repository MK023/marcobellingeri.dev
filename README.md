# marcobellingeri.dev

Sito personale di **Marco Bellingeri** — Cloud Platform & Security Engineer.
Astro statico, bilingue EN/IT, con un magazine mensile alimentato da una pipeline RAG.

[![Site CI](https://github.com/MK023/marcobellingeri.dev/actions/workflows/site-ci.yml/badge.svg)](https://github.com/MK023/marcobellingeri.dev/actions/workflows/site-ci.yml)
[![Backend CI](https://github.com/MK023/marcobellingeri.dev/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/MK023/marcobellingeri.dev/actions/workflows/backend-ci.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=MK023_marcobellingeri.dev&metric=alert_status)](https://sonarcloud.io/summary/overall?id=MK023_marcobellingeri.dev)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=MK023_marcobellingeri.dev&metric=coverage)](https://sonarcloud.io/component_measures?id=MK023_marcobellingeri.dev&metric=coverage)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)

Il sito fa l'audit di sé stesso: la sezione *Security* non dichiara gli header di
sicurezza, li **rilegge dalla risposta HTTP** che il browser ha appena ricevuto. È il
motivo per cui la Content Security Policy di questo repository è costruita con gli hash
degli script anziché con `unsafe-inline`, ed è verificata in CI su `dist/` — non sul
sorgente.

---

## Struttura

| Directory | Cosa contiene |
| --- | --- |
| `astro-project/` | Il sito. Astro statico, i18n EN/IT, componenti, CSP, test. **Si parte da qui.** |
| `engine/` | Pipeline Node del numero mensile: sourcing → verifica → generazione → embed → export → radar competitor. Zero dipendenze esterne. |
| `supabase/` | Migration, seed e policy RLS del database RAG (Postgres + pgvector). Ricostruibile da zero. |
| `docs/adr/` | Le decisioni architetturali e il perché. |
| `mock-html-singolo/` | Il prototipo HTML da cui è nato tutto. Riferimento storico, non si tocca. |

## Farlo girare

```bash
cd astro-project
npm install
npm run dev          # sviluppo
npm run check        # type-check dei .astro (tsconfig strict)
npm run lint         # ESLint, gli unici occhi sui .astro
npm run build        # build statica in dist/
npm run test:csp     # i test girano su dist/, non sul sorgente
```

`check` e `lint` girano anche in CI **e sulla strada del deploy**, non solo in `Site
CI`: quel workflow è separato e il deploy non lo aspetta, quindi un gate che stesse
solo lì non fermerebbe niente.

Per servire il sito **con gli header veri** — quelli di `public/_headers`, che
`astro preview` non applica:

```bash
npx wrangler dev
```

La pipeline richiede i segreti da Doppler:

```bash
cd engine
doppler run -- npm run ingest
npm test             # unit + integration, zero rete
```

## Sicurezza

La CSP non ammette `unsafe-inline` su `script-src`: gli script bundled sono
autorizzati per hash, calcolati da Astro in build, e l'hash dello script anti-FOUC
— che è `is:inline` e quindi Astro non tocca — è dichiarato a mano in
`astro.config.mjs`. Se qualcuno lo modifica, `npm run test:csp` fallisce e dice
esattamente quale hash mettere.

`frame-ancestors` è l'unica direttiva CSP che resta in `public/_headers`: dentro un
`<meta>` verrebbe ignorata per specifica. Tutto il resto vive nel meta generato in
build, perché è l'unico posto dove gli hash sono calcolabili.

Altre reti:

- **Quality gate SonarQube Cloud sulla strada del deploy**: in `deploy.yml` il job
  di analisi precede la pubblicazione (`sonar.qualitygate.wait=true`) — gate rosso,
  niente produzione. Sulle PR l'analisi arriva come check, quando la modifica si
  può ancora discutere. La coverage la calcola il test runner di Node, nessuna
  dipendenza in più.
- **`astro check` + ESLint**, perché Sonar da solo lasciava scoperta **più di metà
  del sito**: non ha un parser per Astro, e i 20 file `.astro` (~2800 righe, più di
  tutto ciò che Sonar analizza) passavano senza alcun controllo statico — proprio
  dove vive la logica lato browser: form di contatto, palette comandi, terminale.
  Il `tsconfig` era già `strict`, ma nessuno lo eseguiva: severità decorativa.
  **Niente Prettier**: formatta, non trova bug — e le liti sullo stile si fanno in
  due. Nella config di ESLint non c'è **nessuna regola disattivata**: le due sole
  eccezioni sono sulla riga, con il motivo accanto (la regex anti header-injection
  del Worker, dove i caratteri di controllo sono il bersaglio e non l'errore).
- **gitleaks** sull'intera storia a ogni push su `main`, e in pre-commit locale.
- **Push protection** del secret scanning: GitHub rifiuta un push che contiene un
  segreto, invece di scoprirlo dopo.
- **RLS su tutte le tabelle**, verificata in CI ricostruendo il database da zero e
  facendo mordere il *publish gate* — un numero non può passare a `published` senza
  la prova delle fonti.
- Segreti su **Doppler**, mai nel repository. `.env` è ignorato.

Vulnerabilità: **non aprire una issue pubblica**, vedi [SECURITY.md](SECURITY.md).

Attiva l'hook anti-segreti una volta per clone:

```bash
git config core.hooksPath .githooks
brew install gitleaks
```

## Osservabilità

Sentry, piano free, region DE. Il principio è che si accende solo ciò che, quando
suona, dice qualcosa che non si sarebbe saputo altrimenti.

- **Errori** su client e Worker. Sul Worker `withSentry` cattura le eccezioni non
  gestite; i fallimenti *gestiti* del form (Turnstile senza secret, Resend che
  risponde male) passano dall'hook `__SEGNALA_SENTRY__`, perché `withSentry` da solo
  non li vedrebbe mai — sono `return`, non `throw`.
  Sul client il SDK si carica **pigro** (prima interazione o primo idle): il suo
  costo stava tutto nel percorso critico ed era l'ultimo motivo per cui il TBT
  mobile non era zero. Gli errori pre-caricamento finiscono in un buffer e partono
  appena il SDK arriva (`sentry.client.config.js`).
- **Tracing solo su `/api/contact`.** Con `run_worker_first` ogni asset statico passa
  dal Worker: un sample rate globale traccerebbe a tappeto il servizio di file dalla
  cache edge, cioè spenderebbe quota per scoprire che la CDN è veloce. L'unica rotta
  la cui latenza può degradare davvero è il form, che parla con due terzi.
- **Cron monitor sul keepalive Supabase.** Il workflow apre già una issue se il ping
  *fallisce*; nessuno però si accorge se il job **non parte affatto** — ed è lo
  scenario che manda in pausa il database (GitHub spegne gli schedule dopo 60 giorni
  di inattività sul repo). Un cron monitor è l'unico strumento che rende osservabile
  un'assenza, e sta **fuori** da GitHub: non condivide il dominio di guasto che
  sorveglia. Il check-in non può far fallire il ping — un guardiano che uccide ciò
  che sorveglia è peggio di nessun guardiano.
- **Niente session replay**, per scelta: registrerebbe il DOM di un form dove si
  scrivono nome, email e brief, su un sito che dichiara di non tracciare — in cambio
  di 50 sessioni al mese, cioè di un campione che non risponde a nessuna domanda.

Il percorso Worker → Sentry è stato **verificato end-to-end**, non dedotto: eseguendo
il Worker senza secret si ottengono i due eventi attesi in Sentry. Vale la pena dirlo
perché per settimane quel percorso è esistito senza che nessuno lo avesse mai visto
funzionare.

Sul motore, il tracing è Langfuse (vedi [engine/README.md](engine/README.md)).

## Contribuire

Branch `<tipo>/<slug>`, Conventional Commits con oggetto in italiano, `main` protetta
da ruleset: niente push diretti, niente force-push, PR con CI verde.
Tutto in [CONTRIBUTING.md](CONTRIBUTING.md).

## Decisioni

- [ADR 0001](docs/adr/0001-architettura-hosting-i18n.md) — hosting, i18n, rilevamento lingua
- [ADR 0002](docs/adr/0002-motore-numero-mensile.md) — motore del numero mensile, human-in-the-loop
- [ADR 0003](docs/adr/0003-componenti-nuovi.md) — componenti "show-off"
- [ADR 0004](docs/adr/0004-sourcing-due-canali.md) — sourcing Valyu, architettura a due canali

## Versioning

Schema leggero: un sito non ha consumatori di API, il semver rigido non serve.

- `v0.x` — fase di costruzione
- `v1.0.0` — **go-live**, primo deploy pubblico su Cloudflare
- **minor** per blocco chiuso · **patch** per fix

Si tagga a milestone, non a ogni commit. Le
[Releases](https://github.com/MK023/marcobellingeri.dev/releases) fanno da changelog;
il tracking dei task vive su Notion, non su GitHub Issues.

## Roadmap

- [x] **Foundation** (`v0.1.0`) — Astro statico bilingue, i18n e sitemap, componenti, segreti su Doppler, postura GDPR
- [x] **Backend e RAG** — due canali su Supabase pgvector ([ADR 0004](docs/adr/0004-sourcing-due-canali.md)): sourcing Valyu → verifica a tre livelli → bozza human-in-the-loop → embed voyage-3.5
- [x] **Engine nel repo** — `engine/` (ingest, generate, embed, export, radar competitor), database ricostruibile da migration, tracing Langfuse
- [x] **Sito sbloccato** (`v0.2.0`) — CSP risolta con gli hash, hosting Cloudflare configurato, CI sul frontend, repository pubblico
- [x] **Primo numero** (`2026-07-12`) — Magazine DB-backed, numero #1 pubblicato («AI insurance governance», NAIC Model Bulletin). La sezione non si renderizza finché non esiste un numero vero: un magazine con dentro un segnaposto vale meno di un magazine assente
- [x] **Go-live** (`v1.0.0`, 2026-07-10) — [marcobellingeri.dev](https://marcobellingeri.dev) su Cloudflare, deploy automatico da `main`, www e anti-spoofing email configurati
- [x] **Distribuzione canonical-first** — il sito è la casa canonical; dev.to è lo specchio primario (import RSS nativo, `canonical_url` che punta qui). Long-form ospitato sul sito (collection `writing`) ed Edicola delle firme esterne
- [ ] **Terminale C1** (`v1.x`) — interfaccia RAG reale (`ask`), endpoint con rate-limit, guardrail e disclosure AI Act art. 50

## Licenza

Il **codice** è [MIT](LICENSE): prendilo, imparaci sopra, riusalo.

I **contenuti** no. Testi, design, tipografia, fotografie e i numeri del magazine
restano © 2026 Marco Bellingeri, tutti i diritti riservati. Il codice è un esempio di
come è fatto; il sito è di una persona sola.
