# marcobellingeri.dev

Monorepo del sito personale: frontend Astro + schema Supabase (RAG) + docs/ADR.
Due directory principali:

## 1. `astro-project/`
Il progetto vero, quello su cui lavorare in VSCode e da cui partire per il
deploy su Cloudflare. Struttura Astro componentizzata, Content Collections per
Field Notes, Archivio, terminale, command palette, tutto quello costruito
finora. **Parti da qui.**

```bash
cd astro-project
npm install
npm run dev
```

Istruzioni complete, checklist di sicurezza, e come aggiungere un caso
mensile: vedi `astro-project/README.md`.

## 2. `mock-html-singolo/`
Il file HTML singolo, quello con cui abbiamo iterato e testato tutto
(giorno/notte, terminale, easter egg) prima di componentizzare in Astro.
Utile come:
- riferimento per confrontare che la migrazione Astro sia fedele
- versione "usa e getta" da aprire al volo senza installare nulla
- backup nel caso qualcosa si rompa durante il lavoro su Astro

Non è più il file su cui continuare a lavorare — da qui in poi le modifiche
vanno fatte nel progetto Astro.

## Git hooks (secret guard)

Rete anti-secret pre-commit (interim finché la repo è privata). Ad ogni
clone attivala una volta:

```bash
git config core.hooksPath .githooks
brew install gitleaks   # opzionale ma consigliato: copertura reale vs grep
```

## Versioning

Schema leggero — un sito non ha consumatori di API, semver rigido non serve:

- `v0.x` — fase privata / build (attuale: **`v0.1.0` Foundation**, pre-release)
- **`v1.0.0` = go-live** — primo deploy pubblico su Cloudflare
- **minor** per blocco/feature shippato · **patch** per fix

Si tagga a milestone (blocco chiuso), non a ogni commit. Le [GitHub Releases](https://github.com/MK023/marcobellingeri.dev/releases) fanno da changelog. Il tracking dei task vive su Notion, non su GitHub Issues/Milestones.

## Roadmap

- [x] **Foundation** (`v0.1.0`) — Astro static bilingue EN/IT, security-by-design, i18n + sitemap, componenti show-off, secrets su Doppler, postura GDPR
- [x] **Backend numero mensile + RAG** — due canali su Supabase pgvector ([ADR-0004](docs/adr/0004-sourcing-due-canali.md)): sourcing Valyu → verify 3-tier → bozza Claude (human-in-the-loop) → embed voyage-3.5; numero #1 in draft; competitor-watch interno
- [ ] **Collegamento** — rendering Archivio DB-backed (con escaping, vedi ADR-0004 §4), engine in `engine/` + GitHub Actions, publish del #1
- [ ] **Go-live** (`v1.0.0`) — dominio su Cloudflare, repo pubblica, deploy
- [ ] **Blog** (`v1.x`) — Hashnode (POSSE: own-site source of truth + canonical)
- [ ] **Terminale C1** (`v1.x`) — interfaccia RAG reale (`ask`), endpoint con rate-limit + guardrail + disclosure AI Act art.50

## Note legacy
`astro-project/firecrawl_issue.py` e `public/data/issues/` sono il vecchio
meccanismo dell'Archivio (ritirato, [ADR-0004](docs/adr/0004-sourcing-due-canali.md)):
verranno rimossi col rewrite DB-backed di `ArchiveSection`.
