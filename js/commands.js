// js/commands.js — реестр команд приложения (поверхность действий, WORKSPACE_CONCEPT §8).
//
// Одна запись = одно действие: как выполнить, как назвать человеку, какие
// аргументы принимает. Из ОДНОГО реестра растут три потребителя:
//   — чат-ассистент: JSON-схемы инструментов ГЕНЕРИРУЮТСЯ из args
//     (commandSchemas), а не пишутся руками, поэтому не могут разойтись с кодом;
//   — командная палитра для человека (label/hint);
//   — программные вызовы из кода (runCommand).
//
// Здесь НЕТ знаний о конкретных командах: их регистрирует index.html через
// defineCommands(), ровно как настройки регистрируются через defineSettings().
// Каждая запись:
//   {
//     id,            // 'chart.goto' — точка разделяет область и действие
//     args,          // { имя: {type, required, desc, …} } — см. TYPES ниже
//     label,         // ключ STRINGS: подпись для человека (палитра)
//     desc,          // ключ STRINGS: описание для модели (что делает команда)
//     mutates,       // true → перед выполнением снимается снимок для undo
//     needsChart,    // true → команда бессмысленна без открытого кейса
//     run(args),     // выполнение; возвращает результат (или undefined)
//   }

const registry = new Map();
let _snapshot = null;          // () => void — снимок состояния для undo
let _hasChart = () => true;    // () => boolean — открыт ли кейс
let _tr = k => k;

// ── Типы аргументов ──────────────────────────────────────────────────────────
// Свободных строк намеренно почти нет: строка в аргументе — ровно то место, где
// дешёвая модель начинает выдумывать значения («всю жизнь», «1980-2050»).
// Числа, булевы и закрытые enum'ы; text — только там, где текст и правда
// свободный (поисковый запрос пользователя).

const TYPES = {
  number: {
    json: () => ({ type: 'number' }),
    check: v => (typeof v === 'number' && Number.isFinite(v)) || 'ожидалось число',
  },
  int: {
    json: a => ({ type: 'integer',
      ...(a.min != null ? { minimum: a.min } : {}),
      ...(a.max != null ? { maximum: a.max } : {}) }),
    check: (v, a) =>
      !Number.isInteger(v) ? 'ожидалось целое число'
      : a.min != null && v < a.min ? `минимум ${a.min}`
      : a.max != null && v > a.max ? `максимум ${a.max}`
      : true,
  },
  bool: {
    json: () => ({ type: 'boolean' }),
    check: v => typeof v === 'boolean' || 'ожидалось true или false',
  },
  enum: {
    json: a => ({ type: 'string', enum: a.values }),
    check: (v, a) => a.values.includes(v) || `допустимо: ${a.values.join(', ')}`,
  },
  'enum[]': {
    json: a => ({ type: 'array', items: { type: 'string', enum: a.values } }),
    check: (v, a) => !Array.isArray(v) ? 'ожидался список'
      : v.every(x => a.values.includes(x)) || `допустимо: ${a.values.join(', ')}`,
  },
  'int[]': {
    json: a => ({ type: 'array', items: { type: 'integer' } }),
    check: v => (Array.isArray(v) && v.every(Number.isInteger)) || 'ожидался список целых чисел',
  },
  text: {
    json: () => ({ type: 'string' }),
    check: v => typeof v === 'string' || 'ожидалась строка',
  },
};

// ── Регистрация ──────────────────────────────────────────────────────────────

export function initCommands({ snapshot, hasChart, tr } = {}) {
  if (snapshot) _snapshot = snapshot;
  if (hasChart) _hasChart = hasChart;
  if (tr) _tr = tr;
}

export function defineCommands(defs) {
  for (const def of defs) {
    if (!def.id || typeof def.run !== 'function') {
      console.error('команда без id или run:', def);
      continue;
    }
    for (const [name, spec] of Object.entries(def.args ?? {})) {
      if (!TYPES[spec.type]) console.error(`команда ${def.id}: неизвестный тип аргумента ${name}:${spec.type}`);
    }
    registry.set(def.id, def);
  }
}

export function listCommands() { return [...registry.values()]; }
export function getCommand(id) { return registry.get(id); }

// ── Имена инструментов ───────────────────────────────────────────────────────
// Точка в имени функции ломает часть провайдеров (и Anthropic, и
// OpenAI-совместимые ограничивают имя [a-zA-Z0-9_-]), поэтому наружу команда
// уходит как chart_goto, а внутри остаётся chart.goto.

export const toolName = id => id.replace(/\./g, '_');
export const commandId = name => {
  if (registry.has(name)) return name;
  for (const id of registry.keys()) if (toolName(id) === name) return id;
  return null;
};

// ── Схемы для модели ─────────────────────────────────────────────────────────
// Единственный источник — реестр. Руками схемы не пишутся и потому не устаревают.
// additionalProperties:false + required — то, что нужно для strict-режима:
// модель не сможет придумать лишний аргумент или пропустить обязательный.

export function commandSchemas({ onlyWithChart = false } = {}) {
  const out = [];
  for (const def of registry.values()) {
    if (onlyWithChart && def.needsChart && !_hasChart()) continue;
    const properties = {}, required = [];
    for (const [name, spec] of Object.entries(def.args ?? {})) {
      const t = TYPES[spec.type];
      if (!t) continue;
      properties[name] = { ...t.json(spec), ...(spec.desc ? { description: _tr(spec.desc) } : {}) };
      if (spec.required) required.push(name);
    }
    out.push({
      name: toolName(def.id),
      description: _tr(def.desc ?? def.label ?? def.id),
      input_schema: { type: 'object', properties, required, additionalProperties: false },
    });
  }
  return out;
}

// ── Валидация и выполнение ───────────────────────────────────────────────────

// Проверка аргументов до выполнения. Возвращает { ok, args } или { ok:false, error }.
// Ошибка — читаемая строка: её видит и человек в чате, и модель (чтобы
// исправить вызов на следующем обороте, а не упасть молча).
export function validateArgs(def, raw) {
  const spec = def.args ?? {};
  const args = {};
  const given = raw && typeof raw === 'object' ? raw : {};

  for (const key of Object.keys(given)) {
    if (!spec[key]) return { ok: false, error: `неизвестный аргумент «${key}»` };
  }
  for (const [name, s] of Object.entries(spec)) {
    const v = given[name];
    if (v === undefined || v === null) {
      if (s.required) return { ok: false, error: `не хватает аргумента «${name}»` };
      if (s.default !== undefined) args[name] = s.default;
      continue;
    }
    const verdict = TYPES[s.type].check(v, s);
    if (verdict !== true) return { ok: false, error: `аргумент «${name}»: ${verdict}` };
    args[name] = v;
  }
  return { ok: true, args };
}

// Выполнение команды. Никогда не бросает: возвращает { ok, result } либо
// { ok:false, error }. Модели нужен читаемый отказ, а не исключение.
export async function runCommand(id, raw = {}) {
  const def = registry.get(commandId(id) ?? id);
  if (!def) return { ok: false, error: `нет такой команды: ${id}` };
  if (def.needsChart && !_hasChart()) return { ok: false, error: 'нужен открытый кейс' };

  const v = validateArgs(def, raw);
  if (!v.ok) return v;

  // Снимок ДО изменения — undo дешевле починки. Только для изменяющих команд:
  // поисковые ничего не трогают, засорять историю ими не нужно.
  if (def.mutates && _snapshot) {
    try { _snapshot(); } catch (e) { console.error(`команда ${def.id}: снимок`, e); }
  }
  try {
    return { ok: true, result: await def.run(v.args) };
  } catch (e) {
    console.error(`команда ${def.id}:`, e);
    return { ok: false, error: e?.message || String(e) };
  }
}
