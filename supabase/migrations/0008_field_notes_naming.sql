-- 0008: via il legacy naming di article_translations. Le colonne nascono come
-- application/solution/body (0001), ma la forma reale del prodotto e' Field Notes:
-- approach/result/lesson. generate/export/embed mappavano avanti e indietro solo
-- per colmare quel divario: debito, non design. Rename semplice: i dati restano,
-- nessun trigger/policy/gate referenzia queste colonne per nome (solo la def in 0001).
alter table article_translations rename column application to approach;
alter table article_translations rename column solution   to result;
alter table article_translations rename column body       to lesson;

comment on column article_translations.approach is 'come la soluzione e'' stata applicata (ex application)';
comment on column article_translations.result   is 'cosa e'' cambiato, prima/dopo (ex solution)';
comment on column article_translations.lesson   is 'la lezione trasferibile, nullable (ex body)';
