-- 0014: `issues.sector` diventa un enum.
--
-- Era `text` libero e nullable: niente lo legava ai verticali del registro
-- (engine/primary-sources.json). Il valore lo scrive un posto solo — ingest.mjs,
-- con la chiave scelta dalla rotazione — quindi finora ha sempre funzionato, ma
-- un refuso o una chiave rinominata sarebbero entrati senza che nessuno se ne
-- accorgesse, e il settore e' cio' che il numero dichiara di essere.
--
-- I valori sono i cinque verticali che il registro conosce, non i quattro in
-- rotazione: `insurance` e' uscito dal turno l'01/09/2026 ma DUE numeri lo
-- portano gia' (#1 2026-07 e #3 2026-09). Un enum senza `insurance` fallirebbe
-- la conversione su quelle righe, e cancellerebbe la storia per far tornare una
-- regola di oggi. La rotazione dice cosa esce il mese prossimo; l'enum dice cosa
-- e' lecito che esista, e sono due domande diverse.
--
-- Il nome e' `issue_sector` per stare accanto a `issue_status`, l'unico altro
-- enum dello schema.
--
-- Verificato sul DB PRIMA di scrivere questa migration: i valori presenti sono
-- 'insurance' (2 righe) e 'software-engineering' (1), nessun NULL. La `using`
-- non ha righe da rifiutare.
create type issue_sector as enum (
  'insurance',
  'security',
  'cloud',
  'devsecops',
  'software-engineering'
);

alter table issues
  alter column sector type issue_sector using sector::issue_sector;

comment on column issues.sector is
  'Il verticale del numero. Enum e non testo: il valore arriva da ingest.mjs via la rotazione in primary-sources.json, e un refuso non deve poter entrare. Aggiungere un verticale = ALTER TYPE ... ADD VALUE in una migration nuova.';

-- La colonna resta NULLABLE, com'era. Renderla NOT NULL sarebbe corretto — oggi
-- nessuna riga e' NULL e ingest la valorizza sempre — ma e' un vincolo diverso da
-- quello che questa migration ha il mandato di aggiungere: si fa quando serve, e
-- si fa sapendo che blocca gli insert che oggi passerebbero.
