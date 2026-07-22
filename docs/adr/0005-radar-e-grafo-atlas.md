# ADR 0005 — Radar e grafo Atlas: pagine vive, stessa infrastruttura

Data: 2026-07-22 · Stato: accettata

## Contesto

Due richieste di Marco nello stesso giorno: un globo degli eventi di sicurezza mondiali
("che si vedano i problemi che stanno succedendo nel mondo") e una pagina che mostri la
sua knowledge base personale come rete viva. Entrambe sono *pagine che dimostrano* — la
filosofia del sito — ma toccano dati esterni (feed) e dati privati (la wiki).

## Decisione

**Radar**: i feed li aggrega il Worker (`/api/radar`, same-origin) con cache edge 30′ e
fail-open per fonte; il browser riceve un JSON già sanificato. **Una fonte entra solo se
la sua licenza permette per iscritto l'uso commerciale** (il sito vende): il registro è
`docs/FONTI.md` + `src/data/radar-fonti.js`, e un test in CI lo fa rispettare. Rendering
canvas 2D con proiezione ortografica (Natural Earth nel repo, ~55KB): niente WebGL.
Conseguenza della regola: fuori Cloudflare Radar (CC BY-NC), abuse.ch, ransomware.live,
AI Incident DB e — ironia — l'ACN italiana (vieta l'uso commerciale); dentro CISA
(pubblico dominio/CC0), NCSC UK (OGL v3), CERT-FR (Licence Ouverte 2.0), Commissione UE
(Decisione 2011/833), MITRE ATLAS (Apache 2.0, per usi futuri).

**Grafo Atlas**: il grafo si genera **offline e a mano** (`scripts/genera-grafo-atlas.mjs`)
dai soli layer `concepts/` + `entities/tools/`; i wikilink verso i layer privati sono
contati, mai nominati. Il JSON (20KB, layout precalcolato) è committato: la PR è il punto
di revisione umana di ciò che diventa pubblico. Tre guardie di privacy (throw nel
generatore, test allowlist, test anti-stringhe sul JSON grezzo).

## Alternative scartate

- *Fetch dei feed dal browser*: aprirebbe la CSP a domini terzi e moltiplicherebbe il
  traffico verso le agenzie per visitatore. No.
- *three.js per il globo*: ~600KB per un wireframe che si disegna con ~30 righe di
  trigonometria. No.
- *Grafo Atlas generato in CI*: servirebbe una credenziale long-lived verso il repo
  privato e sparirebbe la revisione umana del diff. No: la frizione qui è una feature.
- *"Real time" sbandierato*: gli advisory escono a cadenza giornaliera; la pagina dice
  "aggiornato N minuti fa" invece di "LIVE". L'onestà sulla freschezza è parte del patto.
