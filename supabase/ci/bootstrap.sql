-- Bootstrap CI: simula l'ambiente Supabase su un Postgres+pgvector effimero,
-- cosi' le migration girano identiche in CI (job db-rebuild di backend-ci.yml).
-- Supabase fornisce questi oggetti out-of-the-box; un container nudo no.
create schema if not exists extensions;

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
