-- 0005: dedup dei signals a livello DB (audit 2026-07-06 sera).
-- ingest.mjs deduplica per (issue_id, source_url) in app: il constraint rende
-- la garanzia strutturale (due run concorrenti o un bug non creano doppioni).
-- Parziale su issue_id not null: i signals orfani (issue cancellata, FK set null)
-- non devono bloccare futuri insert.
create unique index signals_issue_url_key
  on signals (issue_id, source_url)
  where issue_id is not null;
