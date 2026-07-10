# marcobellingeri.dev

Sito personale di **Marco Bellingeri** — Cloud Platform & Security Engineer.
Astro statico, bilingue EN/IT, con un archivio mensile generato da una pipeline RAG.

[![Site CI](https://github.com/MK023/marcobellingeri.dev/actions/workflows/site-ci.yml/badge.svg)](https://github.com/MK023/marcobellingeri.dev/actions/workflows/site-ci.yml)
[![Backend CI](https://github.com/MK023/marcobellingeri.dev/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/MK023/marcobellingeri.dev/actions/workflows/backend-ci.yml)
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
| `engine/` | Pipeline Node del numero mensile: sourcing → verifica → embed → radar competitor. Zero dipendenze esterne. |
| `supabase/` | Migration, seed e policy RLS del database RAG (Postgres + pgvector). Ricostruibile da zero. |
| `docs/adr/` | Le decisioni architetturali e il perché. |
| `mock-html-singolo/` | Il prototipo HTML da cui è nato tutto. Riferimento storico, non si tocca. |

## Farlo girare

```bash
cd astro-project
npm install
npm run dev          # sviluppo
npm run build        # build statica in dist/
npm run test:csp     # i test girano su dist/, non sul sorgente
```

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
- [x] **Engine nel repo** — `engine/` (ingest, embed, radar competitor), database ricostruibile da migration, tracing Langfuse
- [x] **Sito sbloccato** (`v0.2.0`) — CSP risolta con gli hash, hosting Cloudflare configurato, CI sul frontend, repository pubblico
- [ ] **Primo numero** — archivio DB-backed e pubblicazione del numero #1. Finché non esiste un numero vero, la sezione Archivio non viene renderizzata: un archivio con dentro un segnaposto vale meno di un archivio assente
- [x] **Go-live** (`v1.0.0`, 2026-07-10) — [marcobellingeri.dev](https://marcobellingeri.dev) su Cloudflare, deploy automatico da `main`, www e anti-spoofing email configurati
- [ ] **Blog** (`v1.x`) — Hashnode in POSSE: la fonte di verità resta qui, il canonical punta qui
- [ ] **Terminale C1** (`v1.x`) — interfaccia RAG reale (`ask`), endpoint con rate-limit, guardrail e disclosure AI Act art. 50

## Licenza

Il **codice** è [MIT](LICENSE): prendilo, imparaci sopra, riusalo.

I **contenuti** no. Testi, design, tipografia, fotografie e i numeri dell'archivio
restano © 2026 Marco Bellingeri, tutti i diritti riservati. Il codice è un esempio di
come è fatto; il sito è di una persona sola.
