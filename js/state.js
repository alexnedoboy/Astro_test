// js/state.js — леджер разделяемого мутабельного состояния (фаза 1 распила).
//
// Механика: каждое поле объявляется СВОЙСТВОМ globalThis. Bare-идентификаторы
// (natalData, tabs, currentTransitJD…) во всех модулях резолвятся через
// глобальную область в эти свойства, поэтому:
//   — существующие call-sites index.html не меняются вообще;
//   — новые модули (astro-core и далее) видят то же состояние без пробросов.
// Это переходная форма: инвентарь состояния собран в одном месте, но без
// инкапсуляции. Фаза 2 — явный контекст кейса (WORKSPACE_CONCEPT §5) с
// доступом через объект, эта форма выбрана чтобы не переписывать ~9000 строк
// разом. НЕ добавляйте сюда UI-приватное состояние (_-префиксы остаются в
// своих модулях) — только то, что разделяется между панелями/расчётами.
//
// Инициализаторы, зависящие от кода index.html (rightPanelTabs, chartModeTabs,
// natalPlanetFilter, natalAspectFilter), остаются там — здесь только заглушки.

const APP_STATE = {
  // ── swisseph ────────────────────────────────────────────────────────────────
  swe: null,               // инстанс SwissEph (null до инициализации)
  sweReady: false,         // true после полной инициализации

  // ── Контекст кейса (WORKSPACE_CONCEPT §5: субъекты + роли + ось T) ─────────
  natalData: null,         // { planets, cusps, asc, mc, birthJD… } — субъект A
  synastryB: null,         // субъект B (только в синастрии)
  synView: 'both',         // вид карты синастрии: 'a' | 'b' | 'both'
  currentChartId: null,    // Supabase id открытого кейса
  currentCaseType: 'natal',
  currentMode: 'transit',  // 'natal' | 'transit' | 'progressed' | 'direction'
  currentTransitJD: null,  // ось T (null = сегодня); курсор таймлайна = тот же T
  detectedTimezone: null,  // IANA timezone после геокодинга

  // ── Таймлайн (кэши и вид) ───────────────────────────────────────────────────
  cachedTimeline: null,
  tlPastYears: 0,
  tlFutureYears: 0,
  expandedRows: new Set(),   // id планет с раскрытыми строками
  fastCache: {},             // id → periods[] быстрых транзитов
  hiddenTPlants: new Set(),  // скрытые транзитные планеты
  tlYearScale: false,
  tl2Year: false,
  moonBandCollapsed: false,

  // ── Вкладки ─────────────────────────────────────────────────────────────────
  tabs: [],                // [{ uid, chartId, fields, header, st, type, … }]
  activeTab: -1,
  dashboardOpen: true,

  // ── Воркспейс V2 ────────────────────────────────────────────────────────────
  layout2Active: false,
  layout2TlState: 0,
  chartExpanded: false,
  rightPanelTabs: null,    // init в index.html ([...RP_DEFAULT_TABS])
  rightPanelTab: 'grades',
  chartModeTabs: null,     // init в index.html ([...CHART_MODE_ALL])

  // ── Пользователь и язык ─────────────────────────────────────────────────────
  currentLang: localStorage.getItem('lang') || 'ru',
  currentUser: null,
  elementColorsMode: false,
  showProgLunarPhases: true,

  // ── Режим неба (transient-кейс момента, будущая элекция) ───────────────────
  skyJD: null,
  skyNavMode: 'date',
  skySnapshots: [],
  skySnapActiveId: null,
  skyScale: '1Y',
  skyCachedTimeline: null,
  skyTlHost: null,
  skyLayoutActive: false,
  skyTlHidden: false,
  skyMoonOn: false,
  skyHighlightPlanet: null,
  skyTlVariant: 'A',
};

for (const [k, v] of Object.entries(APP_STATE)) globalThis[k] = v;
