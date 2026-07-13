# Contribuire

Questo documento **descrive la convenzione già in uso** in questo repository, ricavata
dalla storia dei commit. Non introduce un processo nuovo: mette per iscritto quello che
c'è, così che valga anche quando a scrivere è un agente e non una persona.

## Branch

Non si committa mai direttamente su `main`. Ogni lavoro nasce su un branch:

```
<tipo>/<slug-in-kebab-case>
```

dove `<tipo>` è lo stesso insieme dei tipi di commit: `feat`, `fix`, `chore`, `ci`,
`docs`, `test`. Esempi reali: `feat/design-refresh`, `fix/csp-e-cloudflare`.

I branch di Dependabot (`dependabot/…`) non seguono questa regola: li genera GitHub.

Un branch vive quanto un blocco di lavoro. Se supera la settimana, o il diff supera
il migliaio di righe, va spezzato: un diff che nessuno riesce a rivedere non è stato
rivisto.

## Commit

[Conventional Commits](https://www.conventionalcommits.org/), con l'oggetto in italiano:

```
<tipo>(<scope>): <oggetto all'infinito o al presente, minuscolo, senza punto finale>

<corpo: perché, non cosa. Il cosa lo dice il diff.>
```

**Tipi**, in ordine di frequenza reale: `feat`, `fix`, `chore`, `docs`, `ci`, `test`.

**Scope** usati finora: `site`, `engine`, `ci`, `db`, `security`, `adr`, `gdpr`,
`obs`, `secrets`, `env`, `readme`, `audit`, `backend`. Se serve uno scope nuovo va
bene; se ne serve uno per ogni commit, lo scope non sta funzionando.

**Merge commit**: `merge: <descrizione del blocco>`. È una deviazione consapevole
dallo standard — `merge` non è un tipo di Conventional Commits — ma rende la storia
di `main` leggibile come una lista di blocchi chiusi. Si mantiene.

Un solo commit storico è fuori convenzione (`sec: …`): per la sicurezza si usa
`fix(security)` o `chore(security)`.

Il corpo del commit spiega **perché**, e quando una scelta è controintuitiva dice
anche cosa succederebbe altrimenti. Il commit che ha sbloccato la CSP racconta perché
la policy è uscita da `_headers`: senza quella riga, il primo che la rimette dentro
manda il sito offline.

## Pull request

Ogni branch entra in `main` con una PR: `main` è protetta da un ruleset che vieta il
push diretto, la cancellazione e il force-push. Devono essere verdi:

- **Backend CI**: unit + integration, gitleaks full-history, ricostruzione del DB da
  zero con assert su schema, RLS e publish gate.
- **Site CI**: `astro check` (type-check), ESLint, build, poi i test su `dist/` —
  hash CSP di ogni script inline, `_headers` che non annulla il `<meta>`, Archivio
  coerente con l'indice dei numeri.

Prima di aprire la PR, in `astro-project/`: `npm run check && npm run lint`. Sono le
uniche due reti che guardano i file `.astro` — SonarCloud non li sa analizzare.

**Se tocchi lo script `is:inline` in `BaseLayout.astro`**, il suo hash SHA cambia e la
CSP non lo autorizza più: `npm run test:csp` fallisce e **stampa l'hash corretto** da
incollare in `astro.config.mjs`. Non è un incidente, è la procedura — quel test esiste
per impedire che l'hash e lo script divergano in silenzio.

Entrambi girano su **ogni** PR, senza filtri per path. Un filtro farebbe risparmiare
una cinquantina di secondi e in cambio bloccherebbe per sempre ogni PR che tocca solo
un `.md`: un check obbligatorio che non parte non riporta nulla, e GitHub lo lascia in
attesa all'infinito.

La CI del sito gira su `dist/`, non sul sorgente, perché il modo in cui questo sito si
rompe non è compilando: è servendo. `astro preview` non applica `public/_headers`, e
per questo la CSP rotta è sopravvissuta a ogni build verde finché non è stata servita
davvero.

## Segreti

Mai nel repository. `.env` è ignorato, `doppler.yaml` contiene solo nomi di progetto e
config. In locale i segreti arrivano da `doppler run`; in CI da service token scoped.
gitleaks gira sull'intera storia a ogni push su `main`.

Sulle PR di Dependabot gitleaks è saltato di proposito: il `GITHUB_TOKEN` è ristretto
per policy di GitHub e l'action fallirebbe chiamando l'API. Ogni merge resta comunque
coperto dallo scan su `main`.
