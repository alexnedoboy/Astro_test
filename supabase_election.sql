-- Миграция для элекции (тип кейса «election»).
-- Выполнить в Supabase SQL Editor. Код приложения толерантен к отсутствию
-- этой колонки: до миграции элекция сохраняется без вариантов (snapshots).
--
-- Колонки case_type / question / folder уже добавлены миграцией хораров
-- (supabase_horary.sql) — элекция переиспользует их (case_type='election',
-- question = «что подбираем», folder = «Электив»). Здесь добавляется только
-- хранилище вариантов.

alter table charts add column if not exists snapshots jsonb default '[]'::jsonb;   -- варианты элекции: [{ id, jd }]
