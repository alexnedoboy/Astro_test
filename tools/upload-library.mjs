#!/usr/bin/env node
// Заливка library-dist/ в приватный бакет Storage «library».
//
//   SUPABASE_SERVICE_KEY=<service_role key> node tools/upload-library.mjs [--out library-dist]
//
// Ключ берётся только из окружения и никуда не пишется. Service-роль нужна потому,
// что бакет приватный и на запись политик для клиентов нет (см. supabase_library.sql).
// Сначала выполни supabase_library.sql — бакет и политика чтения создаются там.
// Повторный запуск перезаписывает файлы (upsert), удалять ничего не нужно.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://zhvwugfbalygzplkolwb.supabase.co';
const BUCKET = 'library';

const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.error('Нет SUPABASE_SERVICE_KEY в окружении.');
  console.error('Dashboard → Project Settings → API → service_role, затем:');
  console.error('  SUPABASE_SERVICE_KEY=… node tools/upload-library.mjs');
  process.exit(1);
}

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const dist = resolve(ROOT, outIdx >= 0 ? argv[outIdx + 1] : 'library-dist');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (!e.name.startsWith('.')) yield p;
  }
}

const mime = p => p.endsWith('.json') ? 'application/json' : 'text/markdown; charset=utf-8';

async function upload(path, body, type) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      // новые ключи (sb_secret_…) Storage принимает в apikey; легаси service_role — в Bearer
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': type,
      'cache-control': 'max-age=3600',
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}

try { await stat(dist); }
catch { console.error(`Нет ${dist} — сначала node tools/build-library.mjs`); process.exit(1); }

let n = 0, bytes = 0;
for await (const file of walk(dist)) {
  const path = relative(dist, file).split(/[\\/]/).join('/');
  const body = await readFile(file);
  await upload(path, body, mime(path));
  n++; bytes += body.length;
  process.stdout.write(`\r${n} файлов…`);
}
console.log(`\rЗалито ${n} файлов, ${(bytes / 1048576).toFixed(1)} МБ → ${BUCKET}/`);
