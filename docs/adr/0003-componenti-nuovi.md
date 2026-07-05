# ADR 0003 — Componenti nuovi "show-off"

- **Stato**: Accettato (design; build in sequenza)
- **Data**: 2026-07-05
- **Blocco**: B3
- **Dipende da**: [ADR-0001](0001-architettura-hosting-i18n.md), [ADR-0002](0002-motore-numero-mensile.md)

## Contesto

Il sito è la business card tecnica di Marco (professionista AI/security) e hub di
un futuro canale YouTube noir su "IA spiegata ai senior", target anglosassone. I
componenti nuovi devono **dimostrare competenza reale**, non essere gadget, e
restare coerenti con l'estetica "90s magazine / noir".

Componenti già esistenti (non toccati qui): CommandPalette (⌘K), NeonTerminal
(CRT), UtilityBar giorno/notte, halftone, cursori custom.

## Scelti (Marco)

### C1 — Terminale CRT → interfaccia RAG reale
- **Cosa**: l'easter-egg neon diventa un comando `ask <domanda>` che interroga
  l'archivio dei numeri **pubblicati**.
- **Dimostra**: AI + RAG + backend edge, in un'estetica noir/hacker.
- **Flusso**: input → Worker → embed query (Voyage) → `match_article_chunks`
  (solo `published`) → Claude compone la risposta **citando i numeri** → stream
  al terminale. Risponde nella lingua della UI (IT/EN).
- **Security by design** (è un endpoint AI **pubblico** = superficie):
  - **Rate limiting** per IP (Cloudflare) + **cost-cap** (max token/chiamata, tetto
    giornaliero) per evitare abuso e bollette.
  - **Guardrail anti prompt-injection**: system prompt irrigidito, nessun accesso
    a tool, output confinato all'archivio, rifiuto fuori-scope; l'input utente non
    entra mai in un contesto privilegiato.
  - Nessuna PII raccolta; CSP dedicata per l'endpoint.
- **Dipendenze**: B2 implementato (Supabase + RAG con contenuti pubblicati) +
  key (Voyage/Anthropic/Supabase) + Worker. → **BLOCCATO finché non ci sono key.
  Ultimo a costruirsi.**

### C3 — Security card auto-referenziale
- **Cosa**: riquadro che mostra gli **header di sicurezza del sito stesso**
  (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) con
  una riga di spiegazione per ciascuno.
- **Dimostra**: competenza security, in modo meta e coerente col noir.
- **Spec**: valori generati **a build-time dalla fonte-di-verità degli header**
  (config CF/`_headers`), non da un fetch live → sempre coerenti, zero superficie.
  Bilingue.
- **Dipendenze**: nessuna key. **Costruibile ora** (meglio dopo aver portato gli
  header su Cloudflare, così mostra quelli reali di produzione).

### C4 — Switcher lingua + banner geo
- **Cosa**: switcher `/it/ ↔ /en/` + banner che **suggerisce** la lingua in base
  al geo, SEO-safe ([[ADR-0001]] §4): non redirige i crawler, override via cookie,
  entrambe le lingue sempre crawlabili.
- **Dimostra**: competenza i18n / SEO internazionale.
- **Dipendenze**: la **fondazione i18n Astro** (`/it//en/`, hreflang, x-default).
  Nessuna key. **Costruibile ora** ed è il cuore del lavoro bilingue.

## Scartato

- **C2 — Wire-feed dei signals** (dispaccio d'agenzia dei segnali Firecrawl):
  scartato da Marco.

## Ordine di build (Marco decide la sequenza)

1. **Ora, senza key**: fondazione i18n → **C4**; e **C3** (standalone).
2. **Dopo B2-impl + key**: **C1** (terminale RAG) con la sua spec di sicurezza.

## Osservabilità (decisione aperta, vincolo: gratis)

- Proposta: **Langfuse** (trace/costi della generazione LLM — Marco lo usa già) +
  **observability nativa Cloudflare** (edge, gratis) + **log GitHub Actions** (CI).
- Alternativa vetrina: **Grafana + Loki** self-host (cruscotto unico, ma costo
  infra). Da decidere.
