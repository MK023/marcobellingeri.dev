-- 0010: policy esplicite sulle tabelle interne della pipeline (advisor INFO
-- rls_enabled_no_policy su signals + competitor_*). NON cambia la sicurezza:
--  - anon/authenticated non hanno alcun grant su queste tabelle (0004) e
--    restavano comunque a deny-by-default (RLS on, zero policy);
--  - il service_role di Supabase ha BYPASSRLS e non guarda le policy.
-- Rende ESPLICITO l'intento ("le tocca solo la pipeline"), zittisce l'advisor,
-- e allinea la CI: nel bootstrap effimero service_role NON ha BYPASSRLS, quindi
-- con queste policy un eventuale test via service_role si comporta come in prod.
create policy "pipeline only (service_role)" on signals
  for all to service_role using (true) with check (true);

create policy "pipeline only (service_role)" on competitor_sources
  for all to service_role using (true) with check (true);

create policy "pipeline only (service_role)" on competitor_snapshots
  for all to service_role using (true) with check (true);

create policy "pipeline only (service_role)" on competitor_chunks
  for all to service_role using (true) with check (true);
