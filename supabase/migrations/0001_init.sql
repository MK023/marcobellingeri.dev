-- ADR-0002 — schema del motore del numero mensile (human-in-the-loop + RAG).
-- Applicare con la Supabase CLI: `supabase db push` (o via dashboard).
-- NOTA: nessuna key qui dentro; questo è solo lo schema.

-- pgvector nello schema `extensions` (convenzione Supabase).
create extension if not exists vector with schema extensions;

-- Ciclo di vita di un numero: la bozza NON si pubblica senza approvazione umana.
create type issue_status as enum ('draft', 'approved', 'published');

-- Un numero mensile.
create table issues (
  id           uuid primary key default gen_random_uuid(),
  number       int  not null,                 -- progressivo del numero
  period       text not null,                 -- es. '2026-07'
  sector       text,                           -- verticale del caso (healthcare, legal, logistics…); i numeri ruotano i settori
  status       issue_status not null default 'draft',
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,                   -- valorizzato al gate umano
  published_at timestamptz,
  unique (period)
);

-- Un articolo del numero. L'approvazione vive sul numero (per-numero).
create table articles (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid not null references issues(id) on delete cascade,
  slug        text not null,
  stat        int,                             -- metrica in evidenza (opzionale)
  stat_suffix text,                            -- es. '×'
  created_at  timestamptz not null default now(),
  unique (issue_id, slug)
);

-- Traduzioni: IT ed EN pari livello (EN primario, cfr. ADR-0001).
create table article_translations (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references articles(id) on delete cascade,
  locale      text not null check (locale in ('it', 'en')),
  title       text not null,
  problem     text not null,                   -- caso
  application text not null,                    -- applicazione
  solution    text not null,                    -- soluzione
  body        text,                             -- markdown esteso
  unique (article_id, locale)
);

-- Segnali grezzi Firecrawl che alimentano la generazione (tracciabilità fonti).
create table signals (
  id          uuid primary key default gen_random_uuid(),
  issue_id    uuid references issues(id) on delete set null,
  source_url  text not null,
  source_name text,
  category    text,                             -- verticale/categoria della fonte
  stage       text not null default 'discovery' -- modello a 2 stadi: 'discovery' (lead, es. last30days) | 'verify' (prova)
              check (stage in ('discovery', 'verify')),
  tier        int check (tier in (1, 2, 3)),    -- barra verify: 1=istituz./primaria+indip · 2=testata seria · 3=community/vendor (mai da solo)
  independent boolean,                           -- indipendente dal vendor? (filtro anti-vendor; nullo in discovery)
  raw_content text,
  scraped_at  timestamptz not null default now()
);

-- Chunk + embedding per il RAG. Modello scelto: Voyage voyage-3.5 → vector(1024)
-- (free tier 200M token/modello; cfr. ADR-0004 — "voyage-3" era stale).
create table article_chunks (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references articles(id) on delete cascade,
  locale      text not null check (locale in ('it', 'en')),
  chunk_index int  not null,
  content     text not null,
  embedding   extensions.vector(1024),
  unique (article_id, locale, chunk_index)
);

-- Indice ANN per la similarity search (HNSW: buon default qualità/latenza).
create index article_chunks_embedding_hnsw
  on article_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS: il `service_role` (pipeline server-side) bypassa RLS di default.
-- Qui definiamo solo la lettura pubblica (anon): SOLO contenuti di numeri
-- pubblicati. Protegge il futuro percorso di query live dal browser.
-- ---------------------------------------------------------------------------
alter table issues               enable row level security;
alter table articles             enable row level security;
alter table article_translations enable row level security;
alter table article_chunks       enable row level security;
alter table signals              enable row level security;   -- nessuna policy anon = privata

create policy "anon reads published issues"
  on issues for select to anon
  using (status = 'published');

create policy "anon reads articles of published issues"
  on articles for select to anon
  using (exists (select 1 from issues i where i.id = articles.issue_id and i.status = 'published'));

create policy "anon reads translations of published issues"
  on article_translations for select to anon
  using (exists (
    select 1 from articles a join issues i on i.id = a.issue_id
    where a.id = article_translations.article_id and i.status = 'published'
  ));

create policy "anon reads chunks of published issues"
  on article_chunks for select to anon
  using (exists (
    select 1 from articles a join issues i on i.id = a.issue_id
    where a.id = article_chunks.article_id and i.status = 'published'
  ));

-- Similarity search per la generazione grounded e il componente live futuro.
-- Filtra a `published` a prescindere dal chiamante.
create or replace function match_article_chunks (
  query_embedding extensions.vector(1024),
  match_threshold float,
  match_count int,
  filter_locale text default null
)
returns table (article_id uuid, locale text, content text, similarity float)
language sql stable
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
  limit match_count;
$$;
