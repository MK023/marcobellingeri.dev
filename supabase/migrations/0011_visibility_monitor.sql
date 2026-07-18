-- 0011_visibility_monitor.sql
-- Monitor discoverability (SEO via GSC + AEO via Perplexity). Dato privato:
-- RLS attiva, policy esplicite service_role-only (come 0010) per tenere
-- l'advisor pulito (rls_enabled_no_policy) mantenendo deny-by-default per
-- anon/authenticated. Il service_role bypassa comunque RLS (come per le
-- tabelle competitor). Grant espliciti come in 0004.

create table if not exists visibility_queries (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  locale      text not null check (locale in ('it', 'en')),
  market      text not null check (market in ('naz', 'internaz')),
  content_ref text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists visibility_observations (
  id         uuid primary key default gen_random_uuid(),
  run_at     timestamptz not null,
  engine     text not null check (engine in ('perplexity', 'gsc')),
  query_id   uuid references visibility_queries(id) on delete set null,
  present    boolean not null,
  rank       numeric,
  detail     jsonb not null default '{}'::jsonb,
  raw        text,
  created_at timestamptz not null default now()
);

create index if not exists visibility_obs_run_idx on visibility_observations (run_at desc);
create index if not exists visibility_obs_query_idx on visibility_observations (query_id);

alter table visibility_queries enable row level security;
alter table visibility_observations enable row level security;

-- Policy esplicite service_role-only, come 0010: anon/authenticated restano a
-- deny-by-default (zero grant + RLS on), qui zittiamo solo l'advisor.
create policy "pipeline only (service_role)" on visibility_queries
  for all to service_role using (true) with check (true);

create policy "pipeline only (service_role)" on visibility_observations
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on visibility_queries to service_role;
grant select, insert, update, delete on visibility_observations to service_role;
