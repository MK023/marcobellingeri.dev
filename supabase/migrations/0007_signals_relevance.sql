-- 0007: persistiamo il relevance_score Valyu sui signals (check filtri 2026-07-07).
-- "Migliori i filtri = piu' guadagno" richiede che la qualita' del sourcing sia
-- MISURABILE nel tempo: senza lo score non si puo' auditare ne' tarare nulla.
-- (Evidenza attuale: l'oro sta a 0.69-0.76, il rumore scora anche 0.86 -> la
-- soglia NON va alzata alla cieca; si decide sui dati accumulati qui.)
alter table signals add column relevance numeric;
comment on column signals.relevance is 'relevance_score Valyu al momento dell''ingest (null = pre-0007 o fonte non-Valyu)';
