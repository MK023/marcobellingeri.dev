# Bellingeri — sito personale (Astro)

Migrazione del sito da singolo file HTML a progetto Astro componentizzato.
Stessa identità visiva, stessa funzionalità (terminale, command palette,
Archivio, giorno/notte automatico, ecc.), ma ora organizzata in componenti
e con le Content Collections per Field Notes.

## Setup

```bash
npm install
npm run dev       # sviluppo locale, http://localhost:4321
npm run build     # build di produzione in ./dist
npm run preview   # anteprima della build di produzione
```

Se `nvm install lts/*` ti dà errore in zsh, usa le virgolette:
`nvm install "lts/*"` oppure `nvm install --lts`.

## Struttura

```
src/
  layouts/BaseLayout.astro      — head, meta, font, script anti-flash, loader
  components/                   — un file per sezione (Hero, Dossier, Stack, ...)
  content/
    config.ts                   — schema tipizzato per Field Notes
    cases/*.md                  — un file = un caso studio mensile
  pages/index.astro             — assembla tutti i componenti
public/
  data/issues/                  — numeri dell'Archivio (generati da GitHub Action)
firecrawl_issue.py              — genera un numero dell'Archivio via Firecrawl
.github/workflows/
  monthly-issue.yml             — esegue firecrawl_issue.py il 1° di ogni mese
vercel.json                     — header di sicurezza (CSP, HSTS, ecc.) + caching
```

## Come aggiungere un caso studio mensile a Field Notes

Copia un file in `src/content/cases/`, rinominalo `YYYY-MM-titolo.md`,
cambia i campi nel frontmatter. Non serve toccare altro — la sezione si
aggiorna da sola al prossimo build.

## Come funziona l'Archivio

A differenza di Field Notes, l'Archivio **non** usa le Content Collections:
i numeri vengono generati a runtime da `firecrawl_issue.py` (via GitHub
Action mensile) e scritti in `public/data/issues/`, poi letti dal browser
con una `fetch` — così l'Archivio si aggiorna senza dover rifare il build
del sito ogni volta.

Prima di attivarlo:
1. Personalizza la lista `SOURCES` in `firecrawl_issue.py` con i concorrenti/fonti reali da monitorare
2. Aggiungi il secret `FIRECRAWL_API_KEY` nel repo GitHub (Settings → Secrets and variables → Actions)
3. Il workflow gira da solo il 1° di ogni mese (o manualmente da GitHub → Actions → Run workflow)

## Da personalizzare prima del deploy

- `src/components/Booking.astro` — verifica il link Calendly (`CALENDLY_URL`)
- `src/components/SiteFooter.astro` — link LinkedIn (attualmente placeholder)
- `astro.config.mjs` — campo `site` con il dominio reale
- `firecrawl_issue.py` — lista `SOURCES`

## Deploy su Vercel

1. Collega il repo GitHub a Vercel (import progetto, riconosce Astro automaticamente)
2. `vercel.json` è già pronto con header di sicurezza OWASP-aligned e regole di cache
3. Dopo il primo deploy, in Vercel → Firewall: attiva **Managed Rulesets** (copertura OWASP Top 10) e **Bot Protection**

## Sicurezza — checklist rapida

- [ ] CSP in `vercel.json` aggiornata se aggiungi nuovi domini esterni
- [ ] WAF managed rulesets attivi su Vercel
- [ ] `FIRECRAWL_API_KEY` solo nei GitHub Secrets, mai nel codice
- [ ] Lighthouse (Performance / Accessibilità / Best Practices / SEO) verificato dopo ogni deploy importante
