-- Bootstrap CI: simula l'ambiente Supabase su un Postgres+pgvector effimero,
-- cosi' le migration girano identiche in CI (job db-rebuild di backend-ci.yml).
-- Supabase fornisce questi oggetti out-of-the-box; un container nudo no.
create schema if not exists extensions;

-- Supabase configura il search_path del database con `extensions` incluso:
-- senza, la create function di 0001 non risolve l'operatore pgvector <=>.
-- (Le sessioni successive — le psql delle migration — lo ereditano.)
alter database postgres set search_path to public, extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;
