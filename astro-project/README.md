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
  data/issues/                  — numeri legacy dell'Archivio (JSON statico, in dismissione)
vercel.json                     — header di sicurezza (CSP, HSTS, ecc.) + caching
```

## Come aggiungere un caso studio mensile a Field Notes

Copia un file in `src/content/cases/`, rinominalo `YYYY-MM-titolo.md`,
cambia i campi nel frontmatter. Non serve toccare altro — la sezione si
aggiorna da sola al prossimo build.

## Come funziona l'Archivio

**In migrazione al DB.** Il vecchio meccanismo (JSON generato da `firecrawl_issue.py`
e letto via `fetch`) è superato: il numero mensile vive ora su Supabase (pipeline
`engine/`, vedi [ADR-0004](../docs/adr/0004-sourcing-due-canali.md)). Il componente
`ArchiveSection.astro` legge ancora il JSON statico in `public/data/issues/` finché
non viene riscritto DB-backed (con escaping/validazione `source_url`, ADR-0004 §4).

## Da personalizzare prima del deploy

- `src/components/Booking.astro` — verifica il link Calendly (`CALENDLY_URL`)
- `src/components/SiteFooter.astro` — link LinkedIn (attualmente placeholder)
- `astro.config.mjs` — campo `site` con il dominio reale

## Deploy su Vercel

1. Collega il repo GitHub a Vercel (import progetto, riconosce Astro automaticamente)
2. `vercel.json` è già pronto con header di sicurezza OWASP-aligned e regole di cache
3. Dopo il primo deploy, in Vercel → Firewall: attiva **Managed Rulesets** (copertura OWASP Top 10) e **Bot Protection**

## Sicurezza — checklist rapida

- [ ] CSP in `vercel.json` aggiornata se aggiungi nuovi domini esterni
- [ ] WAF managed rulesets attivi su Vercel
- [ ] `FIRECRAWL_API_KEY` solo nei GitHub Secrets, mai nel codice
- [ ] Lighthouse (Performance / Accessibilità / Best Practices / SEO) verificato dopo ogni deploy importante
