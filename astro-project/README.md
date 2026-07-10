# Bellingeri — sito personale (Astro)

Il frontend di [marcobellingeri.dev](https://marcobellingeri.dev): Astro statico,
bilingue IT/EN, servito da Cloudflare Workers static assets. Il sito fa l'audit di
sé stesso — la sezione Security legge gli header dalla risposta HTTP che il browser
ha appena ricevuto.

## Setup

```bash
npm install
npm run dev        # sviluppo locale, http://localhost:4321
npm run build      # build di produzione in ./dist
npm run test:csp   # i test girano su dist/, non sul sorgente: prima serve build
npx wrangler dev   # serve dist/ CON gli header veri di public/_headers
```

`astro preview` **non applica `public/_headers`**: la CSP e gli header di sicurezza
si vedono solo con `wrangler dev` o in produzione. È il motivo per cui i test girano
sulla build e la verifica si fa sul sito servito.

## Struttura

```
src/
  layouts/BaseLayout.astro   — head, meta social, hreflang, script anti-FOUC
  components/                — un file per sezione (Hero, Dossier, Stack, …)
  lib/sections.ts            — fonte unica di sezioni e numerazione (sommario,
                               palette comandi, `ls` del terminale)
  lib/issues.ts              — l'Archivio esiste solo se index.json ha un numero
  i18n/ui.ts                 — tutte le stringhe, IT ed EN
  pages/[lang]/index.astro   — assembla i componenti
  pages/404.astro            — servita da Cloudflare per ogni percorso inesistente
worker/index.js              — sceglie la lingua su `/` (paese + cookie pref-lang)
public/
  _headers                   — header di sicurezza; in CSP SOLO frame-ancestors
  data/issues/index.json     — l'indice dei numeri; vuoto = Archivio nascosto
  cv-{it,en}.pdf             — generati da scripts/genera-cv.py (root del repo)
test/                        — CSP, sezioni, worker, compatibilità CSS
wrangler.jsonc               — Workers static assets + custom domain
```

## La CSP, in breve

La policy vive nel `<meta>` generato da Astro in build (`security.csp` in
`astro.config.mjs`), con gli hash di ogni script. In `public/_headers` resta **solo**
`frame-ancestors`, che dentro un `<meta>` verrebbe ignorata. Rimettere una CSP negli
header annullerebbe gli hash e manderebbe il sito offline: `npm run test:csp` lo
impedisce. Lo script anti-FOUC del tema è `is:inline` e il suo hash sta a mano nella
config — se lo modifichi, il test fallisce e ti dice quale hash mettere.

## Deploy

Ogni push su `main` pubblica in produzione (`.github/workflows/deploy.yml`):
build → test su `dist/` → `wrangler deploy` → verifica del sito servito.
Il deploy manuale (`npx wrangler deploy`) resta possibile con `wrangler login`.

## Sicurezza — stato

- CSP con hash, niente `unsafe-inline` ([Mozilla Observatory: A+](https://developer.mozilla.org/en-US/observatory/analyze?host=marcobellingeri.dev))
- HSTS con preload, `nosniff`, Referrer-Policy, Permissions-Policy da `_headers`
- TLS minimo 1.2 (impostato nella zona Cloudflare)
- Font self-hosted (Fontsource): nessun transfer di IP a Google
- Il calendario Cal.eu si carica solo dopo un clic esplicito
