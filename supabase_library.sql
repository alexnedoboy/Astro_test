-- Библиотека: приватный бакет Storage с книгами (markdown) + индекс оглавления.
-- Выполнить один раз в Supabase: Dashboard → SQL Editor → Run.
--
-- Бакет приватный: читать может только авторизованный пользователь, писать — никто
-- из клиентов (заливка идёт service-ключом из tools/upload-library.mjs).
-- Содержимое книг защищено авторским правом: публичным бакет делать нельзя.

insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do update set public = false;

drop policy if exists "Authenticated read library" on storage.objects;

create policy "Authenticated read library"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'library');
