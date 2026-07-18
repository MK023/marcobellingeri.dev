# CLAUDE.md — marcobellingeri.dev

> Memoria di progetto, caricata a ogni turno. **Corta e ad alta densità**: è context
> speso ogni turno, non un README. Le regole operative *generali* (PR, sicurezza
> baseline, i due modelli MUST pipeline+test) vivono nel CLAUDE.md **globale** di Marco —
> qui solo ciò che è **specifico di questo repo**. Sezione lunga → spostala in un file
> dedicato e rimanda al percorso (progressive disclosure: si legge on-demand, non si
> auto-carica un file grosso a ogni turno).

## Cos'è

Sito personale di Marco (live dal 2026-07-10). Non un portfolio: un sito che **dimostra**
invece di dichiarare (la sezione Security rilegge gli header dalla risposta HTTP; il
Terminale interroga il RAG dal vivo). Astro statico bilingue IT/EN su Cloudflare Workers;
un Worker sceglie la lingua su `/` e serve `/api/contact` + `/api/ask`. Backend `engine/`:
pipeline RAG del magazine mensile (Valyu → verifica → generate → embed voyage-3.5 su
Supabase pgvector → export). Security-by-design è il **posizionamento**, non una rifinitura.

## Struttura

- `astro-project/` — il sito **e** il `worker/`. **Si parte da qui.**
- `engine/` — pipeline Node zero-dipendenze (`fetch` nativo): `ingest`, `generate`, `embed`, `export`, `competitors`, `retrieve`, `visibility`.
- `supabase/` — migration sequenziali (`000N_*.sql`), RLS ovunque, DB ricostruibile da zero.
- `docs/adr/` — decisioni architetturali (ADR). *(Le spec/piani di processo non si versionano: vivono nella sessione e restano in git history.)*

## Comandi

Sito (`cd astro-project`): `npm run dev` · `npm run check` (astro/TS) · `npm run lint`
(ESLint — gli unici occhi sui `.astro`) · `npm run build` · `npm run test:csp`
(i test girano su `dist/`, **non** sul sorgente). Header veri (che `astro preview` non dà): `npx wrangler dev`.
Engine (`cd engine`): `doppler run -- node <script>.mjs [--limit N]` · `npm test` (unit+integration, **zero rete**).
Sempre `lint` + `check` + `test` verdi prima di dire "fatto".

## Stile di lavoro (specifico del repo)

- **Ogni modifica in branch + PR, mai su `main`** (nemmeno in locale). Il **codice** lo mergio io a gate verdi; i **contenuti** (articoli) li merge Marco.
- **`main` è la produzione**: deploy automatico a ogni push. L'autonomia si ferma alla produzione — migration sul DB vero, segreti, azioni verso l'esterno solo su ok esplicito di Marco (verificando prima il target di ogni DDL).
- **Verificare in browser, non fidarsi della lettura**: ogni bug serio è uscito eseguendo. Servi la build, misura.
- **Skill che usiamo** (invocale al momento giusto, senza aspettare che Marco le chieda): **graphify** (query dei chiamanti prima di ogni edit non triviale, update del grafo dopo i merge) · **verify**/**run** (esegui prima di dire "fatto") · **test-driven-development** (test prima del codice, i due modelli MUST) · **web-perf** (ogni task di performance/CWV) · **ponytail** (diff minimo, la scala YAGNI→riuso→stdlib→una riga) · **prompt-master** (ogni prompt non banale, es. il system prompt di `ask`) · **humanizer** (ogni testo pubblico — articoli, copy, bio; **mai** i CV) · **code-review** (prima del merge). Nota proattiva in `.claude/session-skills.md`.

## Convenzioni di codice

- **Match dello stile esistente.** Le lib `engine/lib/*` sono senza JSDoc: non aggiungerlo dove non c'è.
- Output del modello / dato di rete = **input non fidato**: nel DOM solo via `esc()` (mai `innerHTML` col grezzo); nei log solo via `logsafe` (S5145); nelle query PostgREST solo via la barriera `pg`.
- CSP a hash, **niente `unsafe-inline`**: niente `style=` inline nel JS runtime (la CSP li blocca in produzione — il colore va in `global.css`).

## Sicurezza (non negoziabile)

- Segreti solo su **Doppler**, mai nel repo. `.env` ignorato. gitleaks full-history + push protection attivi.
- **La CSP vive nel `<meta>`, non negli header** — rimetterla in `_headers` manda il sito offline (un test dedicato lo impedisce). In `_headers` resta solo `frame-ancestors`.
- RLS su tutte le tabelle; la RPC RAG serve **solo** `published` (il publish gate è in DB).

## Cosa NON fare (decisioni chiuse — non riaprire senza dati nuovi)

- Loader 780ms · CSP nel meta · SRI sul loader Turnstile (302 a un build id che ruota) · PII in history (`f731a91`, rischio accettato) · UX mobile a 15,7 schermate.
- I 3 debiti "il fix è un regresso": `UtilityBar` (setInterval), `Projects.astro` (`Record<Lang>`), log verbosi in `engine/lib/*`.
- I marker `ponytail:` sono **ceiling dichiarati** con upgrade path accanto, non debito da saldare.

## Riferimenti (leggi on-demand)

- `README.md` — comandi completi, contratto pipeline/test, roadmap.
- `SECURITY_AUDIT.md` — audit (0 finding aperti), difese confermate con prova.
- `docs/adr/` — hosting/i18n, motore mensile, componenti, sourcing a due canali.
- Ground truth cross-sessione: Atlas (repo privato `MK023/Atlas`) → `projects/marcobellingeri-dev.md`.
