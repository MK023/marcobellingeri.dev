-- 0004: grant espliciti — chiude il gotcha "tabelle create via Supabase MCP
-- non ricevono i privilegi di default". Senza questi, PostgREST col service key
-- risponde 403 42501 (permission denied). Renderlo una migration rende il
-- rebuild riproducibile da zero (prima era applicato a mano post-migration).
--
-- RLS resta il filtro DI RIGA (anon vede solo 'published'); qui diamo solo i
-- privilegi DI TABELLA. Le tabelle interne (signals, competitor_*) NON ricevono
-- grant anon → doppiamente negate (nessun grant + RLS senza policy).

-- Pipeline server-side: il service_role bypassa RLS ma serve comunque il grant di tabella.
grant select, insert, update, delete on
  issues, articles, article_translations, signals, article_chunks,
  competitor_sources, competitor_snapshots, competitor_chunks
to service_role;

-- Lettura pubblica del solo Canale 1 (percorso query live futuro dal browser);
-- RLS limita comunque a 'published'.
grant select on issues, articles, article_translations, article_chunks to anon;
