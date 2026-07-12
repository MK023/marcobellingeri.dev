-- 0009: tetto su match_count in match_article_chunks (audit 2026-07-12, DB-L1).
-- La RPC e' esposta ad anon: senza clamp, match_count null (LIMIT NULL = tutto)
-- o enorme + threshold negativa = scan ordinato dell'intera tabella. Nessun leak
-- (filtra comunque published): solo resource abuse, ma il tetto e' gratis.
--
-- NB: create or replace AZZERA i set di funzione — il search_path pinnato dalla
-- 0003 va ri-dichiarato qui, altrimenti l'advisor WARN tornerebbe.
create or replace function match_article_chunks (
  query_embedding extensions.vector(1024),
  match_threshold float,
  match_count int,
  filter_locale text default null
)
returns table (article_id uuid, locale text, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select
    c.article_id,
    c.locale,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from article_chunks c
  join articles a on a.id = c.article_id
  join issues   i on i.id = a.issue_id
  where i.status = 'published'
    and (filter_locale is null or c.locale = filter_locale)
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit least(greatest(coalesce(match_count, 5), 1), 20);
$$;
