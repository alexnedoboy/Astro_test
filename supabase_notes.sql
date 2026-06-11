-- Таблица заметок к картам.
-- Выполнить один раз в Supabase: Dashboard → SQL Editor → Run.

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  chart_id   uuid not null references public.charts(id) on delete cascade,
  title      text,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "Users manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index notes_chart_idx on public.notes (chart_id, updated_at desc);
