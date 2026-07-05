# Bellingeri — pacchetto completo

Due cose, dentro questo zip:

## 1. `astro-project/`
Il progetto vero, quello su cui lavorare in VSCode e da cui partire per il
deploy su Vercel. Struttura Astro componentizzata, Content Collections per
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

## Prossimi passi consigliati
1. `npm install && npm run dev` dentro `astro-project/` — verifica che tutto
   funzioni dopo la migrazione (probabile qualche piccolo errore di battitura
   al primo giro, normale)
2. Sostituisci il link LinkedIn placeholder in `SiteFooter.astro`
3. Personalizza `SOURCES` in `firecrawl_issue.py` se vuoi cambiare le fonti
   dell'Archivio
4. Quando sei pronto: repo GitHub → collega Vercel → deploy
