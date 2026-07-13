// Каркас настроек: реестр записей, значения, персистенс (localStorage +
// Supabase user metadata) и модалка в стиле Obsidian (навигация по разделам,
// поиск, мгновенное применение).
//
// Здесь НЕТ знаний о конкретных настройках приложения: записи регистрирует
// index.html через defineSettings(). Каждая запись:
//   {
//     id,                  // уникальный ключ (он же ключ в Supabase settings)
//     section,             // id раздела модалки
//     type,                // 'toggle' | 'segment' | 'action'
//     options,             // для segment: [[значение, подпись], …]
//     default,             // значение по умолчанию
//     lsKey, lsKind,       // localStorage: ключ + формат ('bool01' | 'string')
//     labelKey, descKey,   // ключи STRINGS (переводится через tr)
//     onChange(v),         // применение значения (рендер/классы) — БЕЗ записи в хранилища
//     action(),            // для type:'action' — обработчик кнопки
//     render(),            // для type:'custom' — возвращает DOM-элемент контрола;
//                          // wide: true кладёт контрол под подпись на всю ширину
//   }
// Область действия всех записей — глобальная (метод астролога). Per-case
// оверрайды и фокус-фильтры — отдельные механизмы, не этот реестр.

const registry = new Map();   // id → запись
const values   = new Map();   // id → текущее значение
let _tr = k => k;
let _sections = [];           // [[id, labelKey], …]
let _sb = null;
let _activeSection = null;

// ── localStorage (прежние ключи и форматы сохраняются) ────────────────────────

function lsRead(def) {
  const raw = localStorage.getItem(def.lsKey);
  if (raw === null) return def.default;
  return def.lsKind === 'bool01' ? raw === '1' : raw;
}

function lsWrite(def, v) {
  localStorage.setItem(def.lsKey, def.lsKind === 'bool01' ? (v ? '1' : '0') : String(v));
}

// ── Реестр и значения ─────────────────────────────────────────────────────────

export function defineSettings(defs) {
  for (const def of defs) {
    registry.set(def.id, def);
    if (def.type !== 'action') {
      values.set(def.id, def.lsKey ? lsRead(def) : def.default);
    }
  }
}

export function getSetting(id) { return values.get(id); }

export function setSetting(id, v, opts = {}) {
  const def = registry.get(id);
  if (!def || def.type === 'action') return;
  if (values.get(id) === v) return;
  values.set(id, v);
  if (def.lsKey) lsWrite(def, v);
  try { def.onChange?.(v); } catch (e) { console.error(`настройка ${id}: onChange`, e); }
  if (!opts.skipRemote) pushRemote();
  refreshSettingsModal();
}

// ── Синк с Supabase user metadata ─────────────────────────────────────────────
// Хранение: user_metadata.settings = { id: значение, … }. Remote при логине
// побеждает localStorage (как раньше вёл себя elementColors).

export function initSettingsSync(sb) { _sb = sb; }

export function syncSettingsFromUser(user) {
  if (!user) return;
  const meta = user.user_metadata ?? {};
  const remote = { ...(meta.settings ?? {}) };
  // Legacy: elementColors жил в metadata верхнего уровня до появления settings
  if (remote.elementColors === undefined && meta.elementColors !== undefined) {
    remote.elementColors = meta.elementColors;
  }
  for (const [id, v] of Object.entries(remote)) {
    if (registry.has(id)) setSetting(id, v, { skipRemote: true });
  }
}

let _pushT = null;
function pushRemote() {
  if (!_sb) return;
  clearTimeout(_pushT);
  _pushT = setTimeout(async () => {
    try {
      const { data: { user } } = await _sb.auth.getUser();
      if (!user) return;
      const settings = Object.fromEntries(values);
      // elementColors дублируется на верхний уровень для обратной совместимости
      await _sb.auth.updateUser({ data: { settings, elementColors: values.get('elementColors') } });
    } catch (e) { /* оффлайн/сеть — localStorage уже записан */ }
  }, 400);
}

// ── Модалка ───────────────────────────────────────────────────────────────────

export function initSettingsUI({ tr, sections }) {
  _tr = tr;
  _sections = sections;
  const overlay = document.getElementById('settings-modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSettingsModal(); });
  document.getElementById('sm-close').addEventListener('click', closeSettingsModal);
  document.getElementById('sm-search').addEventListener('input', renderModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeSettingsModal();
  });
}

export function openSettingsModal(sectionId) {
  _activeSection = sectionId ?? _activeSection ?? _sections[0]?.[0];
  const search = document.getElementById('sm-search');
  search.value = '';
  document.getElementById('settings-modal-overlay').classList.add('open');
  renderModal();
  search.focus();
}

export function closeSettingsModal() {
  document.getElementById('settings-modal-overlay').classList.remove('open');
}

// Перерисовка открытой модалки (смена значения, смена языка). Закрытая — no-op.
export function refreshSettingsModal() {
  const ov = document.getElementById('settings-modal-overlay');
  if (ov?.classList.contains('open')) renderModal();
}

function renderModal() {
  const q = document.getElementById('sm-search').value.trim().toLowerCase();

  const nav = document.getElementById('sm-sections');
  nav.innerHTML = '';
  for (const [id, labelKey] of _sections) {
    const b = document.createElement('button');
    b.className = 'sm-nav-item' + (!q && id === _activeSection ? ' active' : '');
    b.textContent = _tr(labelKey);
    b.addEventListener('click', () => {
      document.getElementById('sm-search').value = '';
      _activeSection = id;
      renderModal();
    });
    nav.appendChild(b);
  }

  const box = document.getElementById('sm-content');
  box.innerHTML = '';
  const defs = [...registry.values()].filter(d =>
    q ? _tr(d.labelKey).toLowerCase().includes(q) : d.section === _activeSection);
  if (!defs.length) {
    const empty = document.createElement('div');
    empty.className = 'sm-empty';
    empty.textContent = _tr('smNothing');
    box.appendChild(empty);
    return;
  }
  for (const def of defs) box.appendChild(rowFor(def, q));
}

function rowFor(def, q) {
  const row = document.createElement('div');
  row.className = 'sm-row' + (def.wide ? ' sm-row-wide' : '');

  const text = document.createElement('div');
  text.className = 'sm-row-text';
  const lbl = document.createElement('div');
  lbl.className = 'sm-row-label';
  lbl.textContent = _tr(def.labelKey);
  text.appendChild(lbl);
  const descKey = q ? _sections.find(s => s[0] === def.section)?.[1] : def.descKey;
  if (descKey) {
    const d = document.createElement('div');
    d.className = 'sm-row-desc';
    d.textContent = _tr(descKey);
    text.appendChild(d);
  }
  row.appendChild(text);
  row.appendChild(controlFor(def));
  return row;
}

function controlFor(def) {
  if (def.type === 'toggle') {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'sm-toggle';
    cb.checked = !!values.get(def.id);
    cb.addEventListener('change', () => setSetting(def.id, cb.checked));
    return cb;
  }
  if (def.type === 'segment') {
    const wrap = document.createElement('div');
    wrap.className = 'sm-seg';
    for (const [val, label] of def.options) {
      const b = document.createElement('button');
      b.className = 'sm-seg-btn' + (values.get(def.id) === val ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => setSetting(def.id, val));
      wrap.appendChild(b);
    }
    return wrap;
  }
  if (def.type === 'custom') return def.render();
  // action
  const b = document.createElement('button');
  b.className = 'sm-action-btn';
  b.textContent = _tr(def.buttonKey ?? 'smConfigure');
  b.addEventListener('click', () => def.action?.());
  return b;
}
