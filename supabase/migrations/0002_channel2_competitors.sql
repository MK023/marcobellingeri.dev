-- 0002: Canale 2 — competitor-watch INTERNO (radar privato, mai pubblicato).
-- Separato dal numero mensile (Canale 1). Embeddabile nel RAG per interrogarlo.

-- Chi monitoriamo.
create table competitor_sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  url        text not null,
  kind       text,                              -- blog | newsletter | research | outlet ...
  category   text,                              -- verticale/tema
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (url)
);

-- Cosa abbiamo raccolto (uno snapshot per scrape).
create table competitor_snapshots (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references competitor_sources(id) on delete cascade,
  title       text,
  summary     text,
  url         text,
  raw_content text,
  scraped_at  timestamptz not null default now()
);

-- Chunk + embedding per il RAG interno (stesso modello del Canale 1: vector(1024)).
create table competitor_chunks (
  id          uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references competitor_snapshots(id) on delete cascade,
  chunk_index int  not null,
  content     text not null,
  embedding   extensions.vector(1024),
  unique (snapshot_id, chunk_index)
);

create index competitor_chunks_embedding_hnsw
  on competitor_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- INTERNO: RLS on, nessuna policy anon → mai leggibile dal browser (solo service_role).
alter table competitor_sources   enable row level security;
alter table competitor_snapshots enable row level security;
alter table competitor_chunks    enable row level security;
