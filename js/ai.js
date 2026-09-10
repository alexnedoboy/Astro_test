// js/ai.js — вызов языковой модели для чат-ассистента.
//
// Режим BYOK: ключ — личный, лежит ТОЛЬКО в localStorage этого браузера и
// никуда не синхронизируется (в частности, не уезжает в Supabase user_metadata
// вместе с настройками — поэтому ключ намеренно не запись реестра настроек).
//
// Модуль ничего не знает о приложении: получает готовые схемы инструментов и
// системный промпт, возвращает { calls, reply } — ту же форму, что отдаёт
// локальный разбор в чате. Провайдер сменный: запись в AI_PROVIDERS описывает
// url, сборку тела и разбор ответа.

const LS_KEY      = 'aiApiKey';
const LS_PROVIDER = 'aiProvider';
const LS_MODEL    = 'aiModel';

// ── Провайдеры ───────────────────────────────────────────────────────────────

// Gemini принимает подмножество OpenAPI: additionalProperties он не понимает,
// а пустой properties у команды без аргументов лучше не слать вовсе.
function toGeminiSchema(input) {
  const { additionalProperties, ...rest } = input ?? {};
  if (!rest.properties || !Object.keys(rest.properties).length) return undefined;
  if (Array.isArray(rest.required) && !rest.required.length) delete rest.required;
  return rest;
}

export const AI_PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    // Free tier: flash-lite — самый щедрый по дневному лимиту
    models: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    keyUrl: 'https://aistudio.google.com/apikey',
    url: model => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    headers: key => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key }),

    buildBody({ system, tools, turns }) {
      const body = {
        contents: turns,
        generationConfig: { temperature: 0 },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const decls = tools.map(t => {
        const parameters = toGeminiSchema(t.input_schema);
        return { name: t.name, description: t.description, ...(parameters ? { parameters } : {}) };
      });
      if (decls.length) body.tools = [{ functionDeclarations: decls }];
      return body;
    },

    // Ответ → { calls, reply, raw } (raw кладётся обратно в историю как ход модели)
    parseReply(json) {
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const calls = [], texts = [];
      for (const p of parts) {
        if (p.functionCall) calls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
        else if (p.text) texts.push(p.text);
      }
      return { calls, reply: texts.join('\n').trim(), raw: json?.candidates?.[0]?.content ?? null };
    },

    // Ходы диалога в формате провайдера
    userTurn:  text  => ({ role: 'user',  parts: [{ text }] }),
    modelTurn: raw   => raw,
    resultTurn: results => ({
      role: 'user',
      parts: results.map(r => ({ functionResponse: { name: r.name, response: r.response } })),
    }),
  },
};

// ── Ключ и выбор провайдера (только localStorage) ────────────────────────────

export const getAiKey      = () => localStorage.getItem(LS_KEY) || '';
export const setAiKey      = v => v ? localStorage.setItem(LS_KEY, v) : localStorage.removeItem(LS_KEY);
export const getAiProvider = () => localStorage.getItem(LS_PROVIDER) || 'gemini';
export const setAiProvider = v => localStorage.setItem(LS_PROVIDER, v);
export const getAiModel    = () => localStorage.getItem(LS_MODEL) || AI_PROVIDERS[getAiProvider()].models[0];
export const setAiModel    = v => localStorage.setItem(LS_MODEL, v);
export const aiConfigured  = () => !!getAiKey();

// ── Вызов ────────────────────────────────────────────────────────────────────

async function callProvider(prov, { system, tools, turns }) {
  const res = await fetch(prov.url(getAiModel()), {
    method: 'POST',
    headers: prov.headers(getAiKey()),
    body: JSON.stringify(prov.buildBody({ system, tools, turns })),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || json?.[0]?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return prov.parseReply(json);
}

/* Один обмен с моделью с исполнением инструментов.
   execute(name, args) — выполняет команду и возвращает { ok, result|error };
   его результат уходит модели, чтобы она сформулировала ответ по фактам.
   Циклов не больше maxRounds: агент не должен уходить в бесконечный перебор. */
export async function askModel({ text, system, tools, history = [], execute, maxRounds = 3 }) {
  const prov = AI_PROVIDERS[getAiProvider()];
  if (!prov) throw new Error('неизвестный провайдер');
  if (!aiConfigured()) throw new Error('не задан ключ API');

  const turns = [...history, prov.userTurn(text)];
  const done = [];   // выполненные вызовы — чат показывает их результаты сам

  for (let round = 0; round < maxRounds; round++) {
    const out = await callProvider(prov, { system, tools, turns });
    if (!out.calls.length) return { calls: done, reply: out.reply, turns };

    if (out.raw) turns.push(prov.modelTurn(out.raw));
    const results = [];
    for (const c of out.calls) {
      const r = execute ? await execute(c.name, c.args) : { ok: false, error: 'нечем выполнить' };
      done.push({ ...c, outcome: r });
      // Модели уходит компактная сводка, а не сырые строки: полный список
      // рисует сам чат, а тратить контекст на сотни дат незачем.
      results.push({ name: c.name, response: summarize(r) });
    }
    turns.push(prov.resultTurn(results));
  }
  return { calls: done, reply: '', turns, truncated: true };
}

// Сводка результата команды для модели: факт выполнения + масштаб находки.
function summarize(r) {
  if (!r?.ok) return { ok: false, error: String(r?.error ?? 'ошибка') };
  const rows = r.result?.rows;
  if (!rows) return { ok: true };
  return {
    ok: true,
    found: rows.length,
    first: rows.slice(0, 8).map(x => x.jd),
    note: 'Полный список уже показан пользователю. Не перечисляй даты — кратко скажи, что найдено.',
  };
}
