L'ingest è passato: i signal del numero nuovo sono a DB in `stage=discovery`, senza tier.
Da qui in avanti tocca a te. I due gate sono manuali per scelta: il giudizio editoriale non si delega.

### 1. Verify dei signal — Supabase Studio, tabella `signals`

Per ogni fonte che vale come **prova**, metti `stage='verify'` e assegna il `tier`:

- `tier=1` — fonte primaria: CISA, NCSC, CERT-FR, MITRE ATLAS, un ente o regolatore, un paper.
- `tier=2` + `independent=true` — secondaria credibile che conferma in modo indipendente.
- Il resto lascialo `discovery`. Non serve taggare tutto: ne basta **una** che passi la barra.

Per vedere cosa hai sbloccato — la vista *è* la barra editoriale, la stessa che il gate interroga:

```sql
select source_name, tier, independent
from verified_signals
where issue_id = (select id from issues where period = '<AAAA-MM>');
```

Almeno una riga = gate aperto. **Il mattino dopo alle 06:30 UTC il cron genera la bozza da solo** e apre una issue.

### 2. Approvazione della bozza — Supabase Studio, tabella `issues`

Leggi la bozza IT+EN, poi metti `status='approved'`. Da lì il cron fa il resto da solo: embed, export, PR di contenuto.

Se il gate rifiuta, il messaggio dice quale delle tre condizioni manca: la prova, le traduzioni it+en, o i chunk embeddati.

### 3. Merge della PR di contenuto

La apre il cron, la mergi tu: il contenuto è tuo, il codice no.

### 4. dev.to — indipendente da tutto questo

Il cron pubblica da solo, ma solo ciò che esiste. Scrivi il pezzo in `astro-project/src/content/writing/{it,en}/<slug>.md` con una `date:` **futura**: alle 07:00 UTC di quel giorno esce.

Nessun file nuovo significa nessuna uscita, col cron che resta verde. Il silenzio non è un guasto.
