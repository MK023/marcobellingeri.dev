-- 0012: la barra editoriale in UN posto solo. Fino a qui la regola "cosa vale
-- come prova" viveva in tre copie, due linguaggi: il trigger 0006 (SQL), il
-- decisore advance.mjs e il selettore generate.mjs (PostgREST). Cambiare la
-- barra voleva dire tre edit; dimenticarne uno significa che advance dice
-- "genera" e generate non trova fonti, o peggio che il gate rifiuta cio' che
-- advance aveva approvato. Una regola sola, una definizione sola.
--
-- La vista E' la barra: stage='verify' e (Tier-1 oppure Tier-2 indipendente),
-- da ADR-0004. `independent` e' nullable: con NULL il predicato non e' vero e
-- la riga resta fuori — stesso comportamento del trigger 0006, invariato.
--
-- security_invoker: la vista non deve diventare una scorciatoia che aggira le
-- policy di signals (interna, solo service_role). Con l'invoker le RLS della
-- tabella sottostante valgono per chi chiama, esattamente come oggi.

create view verified_signals
with (security_invoker = true) as
  select id, issue_id, source_url, source_name, category, stage,
         tier, independent, raw_content, scraped_at, relevance
  from signals
  where stage = 'verify'
    and (tier = 1 or (tier = 2 and independent));

comment on view verified_signals is
  'La barra editoriale ADR-0004 in un posto solo: signal che valgono come prova. Consumata da enforce_issue_gate, advance.mjs e generate.mjs.';

-- Nessun grant ad anon: i signal restano interni (vedi 0004).
grant select on verified_signals to service_role;

-- Il trigger smette di riscriversi la regola in casa e chiede alla vista.
-- Il resto del gate (traduzioni it+en, chunk embeddati, timestamp) non cambia.
create or replace function enforce_issue_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('approved', 'published') then
    if not exists (select 1 from verified_signals v where v.issue_id = new.id) then
      raise exception 'gate: numero % senza fonte verify Tier-1 o Tier-2 indipendente', new.number;
    end if;
    if new.approved_at is null then
      new.approved_at := now();
    end if;
  end if;

  if new.status = 'published' then
    if not exists (
      select 1 from articles a
      where a.issue_id = new.id
        and exists (select 1 from article_translations t where t.article_id = a.id and t.locale = 'it')
        and exists (select 1 from article_translations t where t.article_id = a.id and t.locale = 'en')
    ) then
      raise exception 'gate: numero % senza articolo con traduzioni it+en', new.number;
    end if;
    if not exists (
      select 1 from article_chunks c
      join articles a on a.id = c.article_id
      where a.issue_id = new.id and c.embedding is not null
    ) then
      raise exception 'gate: numero % con chunk non embeddati (lanciare engine/embed.mjs)', new.number;
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end
$$;
