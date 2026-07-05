-- Миграция для хораров (типы кейсов).
-- Выполнить в Supabase SQL Editor. Код приложения толерантен к отсутствию
-- этих колонок: до миграции хорары просто сохраняются без метаданных типа.

alter table charts add column if not exists case_type text;   -- 'natal' | 'horary' | 'election' | 'synastry' | …
alter table charts add column if not exists question  text;   -- текст вопроса (хорар)
alter table charts add column if not exists outcome   text;   -- исход хорара: 'yes' | 'no' | 'partial'
