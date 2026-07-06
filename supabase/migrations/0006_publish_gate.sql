-- 0006: publish gate a DB — la barra editoriale diventa STRUTTURALE, non solo
-- disciplina umana (audit+test 2026-07-07). Un numero non puo' diventare
-- approved/published senza prova, ne' published senza contenuto embeddato.
--
-- Regole (da ADR-0004 / modello editoriale):
--  - approved|published  => >=1 signal stage='verify' con tier=1 OPPURE (tier=2 AND independent)
--  - published           => >=1 articolo con traduzioni it+en  E  >=1 chunk embeddato
--  - approved_at/published_at auto-valorizzati alla transizione se null
--
-- NB: BEFORE INSERT OR UPDATE (non solo "of status"): anche un insert diretto
-- come published e' gated, e ogni update di un numero published ri-valida gli
-- invarianti (togliere la prova a posteriori fa fallire l'update successivo).

create or replace function enforce_issue_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('approved', 'published') then
    if not exists (
      select 1 from signals s
      where s.issue_id = new.id
        and s.stage = 'verify'
        and (s.tier = 1 or (s.tier = 2 and s.independent))
    ) then
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

create trigger issues_publish_gate
  before insert or update on issues
  for each row execute function enforce_issue_gate();
