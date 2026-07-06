-- 0003: hardening post-audit (2026-07-06).
-- Esiti dell'audit di sicurezza: advisor Supabase + review manuale grant/RPC.

-- 1) Pin del search_path della funzione RPC (advisor WARN: function_search_path_mutable).
--    `extensions` serve per gli operatori pgvector (<=>).
alter function match_article_chunks(extensions.vector, double precision, integer, text)
  set search_path = public, extensions;

-- 2) Privilegio minimo sui ruoli esposti: revoca verbi DDL/bulk mai usati via
--    PostgREST ma presenti nei default (TRUNCATE bypassa RLS by design).
revoke truncate, references, trigger on
  issues, articles, article_translations, signals, article_chunks,
  competitor_sources, competitor_snapshots, competitor_chunks
from anon, authenticated;

-- 3) RPC con execute esplicito invece del default PUBLIC.
revoke execute on function match_article_chunks(extensions.vector, double precision, integer, text) from public;
grant execute on function match_article_chunks(extensions.vector, double precision, integer, text) to anon, service_role;

-- 4) Indici di copertura FK (advisor: unindexed_foreign_keys).
create index signals_issue_id_idx on signals (issue_id);
create index competitor_snapshots_source_id_idx on competitor_snapshots (source_id);
