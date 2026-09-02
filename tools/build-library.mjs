#!/usr/bin/env node
// Сборка библиотеки: Obsidian-хранилище с книгами → library-dist/ для Supabase Storage.
//
//   node tools/build-library.mjs [<путь к хранилищу>] [--out <папка>]
//
// По умолчанию источник — ../Astrology, результат — library-dist/:
//   index.json          дерево книга → глава → раздел (+ якоря, страницы)
//   <book>/<chapter>.md текст главы без фронтматтера
//
// Заголовки читаются как есть: «#» — название главы, «##»/«###» — разделы.
// В сами .md ничего дописывать не нужно, индекс полностью производный.

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Аргументы ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let src = null, out = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i];
  else if (!src) src = argv[i];
}
src = resolve(ROOT, src || '../Astrology');
out = resolve(ROOT, out || 'library-dist');

// ── Транслитерация для слагов (id книг, имена файлов, якоря) ────────────────
const TRANSLIT = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y',
  к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
  х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya',
};

function slug(s) {
  const t = (s || '').toLowerCase().replace(/[а-яё]/g, ch => TRANSLIT[ch] ?? ch);
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

// Уникализатор якорей внутри главы: «луна-v-ovne», «луна-v-ovne-2», …
function uniquifier() {
  const seen = new Map();
  return key => {
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}-${n}`;
  };
}

// ── Фронтматтер ──────────────────────────────────────────────────────────────
// Плоский YAML вида `ключ: значение` / `ключ: "значение"` — большего в книгах нет.
function splitFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (!kv) continue;
    meta[kv[1].trim()] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: raw.slice(m[0].length) };
}

// ── Разбор главы ─────────────────────────────────────────────────────────────
function parseChapter(raw) {
  const { meta, body } = splitFrontmatter(raw);
  const anchor = uniquifier();
  const sections = [];
  let h1 = null;

  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const level = m[1].length, title = m[2].trim();
    if (level === 1) { if (!h1) h1 = title; continue; }
    sections.push({ level, title, anchor: anchor(slug(title)) });
  }
  return { meta, body: body.replace(/^\s+/, ''), h1, sections };
}

// ── Обход хранилища ──────────────────────────────────────────────────────────
const numPrefix = name => {
  const m = name.match(/^(\d+)/);
  return m ? +m[1] : Number.MAX_SAFE_INTEGER;
};
const byName = (a, b) => numPrefix(a) - numPrefix(b) || a.localeCompare(b, 'ru');

async function build() {
  const entries = await readdir(src, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'Books')
                      .map(e => e.name).sort(byName);

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const books = [];
  let chapterCount = 0, bytes = 0;

  for (const dir of dirs) {
    const files = (await readdir(join(src, dir))).filter(f => f.endsWith('.md')).sort(byName);
    const bookId = slug(dir);
    const chapters = [];
    let title = dir, author = '';

    for (const file of files) {
      const raw = await readFile(join(src, dir, file), 'utf8');
      const { meta, body, h1, sections } = parseChapter(raw);

      title  = meta['книга'] || title;
      author = meta['автор'] || author;
      if (meta['тип'] === 'оглавление') continue;   // служебный файл, оглавление строим сами

      const chapTitle = meta['глава'] || h1 || file.replace(/\.md$/, '');
      const id = `${numPrefix(file)}`.padStart(2, '0') + '-' + slug(chapTitle);
      await mkdir(join(out, bookId), { recursive: true });
      await writeFile(join(out, bookId, id + '.md'), body);

      chapters.push({
        id,
        title: chapTitle,
        pages: meta['страницы'] || null,
        // Титул и оглавление самой книги — есть, но в списке глав им место в хвосте
        aux: /^(Оглавление|Титул|Начало)/i.test(chapTitle) || undefined,
        sections,
      });
      chapterCount++;
      bytes += Buffer.byteLength(body);
    }

    if (chapters.length) books.push({ id: bookId, title, author, chapters });
  }

  const index = { version: 1, generatedAt: new Date().toISOString().slice(0, 10), books };
  await writeFile(join(out, 'index.json'), JSON.stringify(index, null, 1));

  const sections = books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.sections.length, 0), 0);
  console.log(`Книг: ${books.length}, глав: ${chapterCount}, разделов: ${sections}, текста: ${(bytes / 1048576).toFixed(1)} МБ`);
  console.log(`Готово: ${out}`);
}

build().catch(e => { console.error(e); process.exit(1); });
