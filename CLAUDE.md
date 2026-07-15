# CLAUDE.md — Астрологическое приложение

> **ВАЖНО: прежде чем проектировать или менять что-либо существенное, прочитай
> [`WORKSPACE_CONCEPT.md`](WORKSPACE_CONCEPT.md)** — целевая архитектура приложения
> (кейсы/слои/контекст/окна/пресеты, инварианты §10, физический UI §13). Все
> архитектурные решения сверяются с ней. Продуктовая стратегия — в `PRODUCT.md`.

## Обзор проекта

Одностраничное веб-приложение для построения натальных карт и просмотра транзитов.

**Структура файлов** (идёт инкрементальный распил монолита; фазы 0–1 выполнены):
- **`index.html`** (~9500 строк) — разметка + основной module-скрипт (UI, рендеринг, вкладки)
- **`styles.css`** — весь CSS (палитра UI-цветов `:root` — в начале файла)
- **`js/state.js`** — **леджер разделяемого мутабельного состояния** (фаза 1): все ключевые глобалы (`swe`, `natalData`, `tabs`, `currentTransitJD`, `currentMode`, sky-группа и т.д.) объявлены свойствами `globalThis` — bare-идентификаторы во всех модулях резолвятся в них, call-sites не меняются, новые модули видят то же состояние. Новое разделяемое состояние объявлять ЗДЕСЬ (не `let` в index.html — модульный `let` невидим другим модулям и затенит леджер). UI-приватное (`_`-префиксы) остаётся в своих модулях
- **`js/astro-core.js`** — чистое расчётное ядро без DOM: `computeChartData`, `safeCalcUt`, `findHouse`, `lonToRad`/`polar`/`angDiff`; читает `swe` из леджера
- **`js/timeline-calc.js`** — расчёты таймлайна без DOM: `computeTransits` (+ `refineExactAspects`), `computeFastTransits`, `computeReturnPeriods` (`RETURN_ASP`), `computeProgressedEvents`, `computeDirectionEvents`, `computeTlLayout`, `transitOrbFactor`. Оркестрация и рендер (`computeAndRenderTimeline`, `renderTimeline`) — в index.html
- **`js/constants.js`** — чистые константы: `PLANETS`, `SIGNS`, `COLORS`, `ASPECTS`/`MAJOR_ASPECTS`, `T_ASPECTS`, `D_ASPECTS`, `CHART` (+ производные `CX`/`CY`/`R_*`), `TL`, `HOUSE_SYSTEMS`, `SLOW_IDS`/`FAST_IDS`, орбисы (`getNatalOrb`, `getTransitOrb`), рулерство. Мутабельного состояния здесь нет и быть не должно
- **`js/strings.js`** — словарь i18n `STRINGS` (ru/en); `tr()` — в index.html, `currentLang` — в леджере
- **`js/settings.js`** — каркас настроек: реестр (`defineSettings`), `get/setSetting`, персистенс (localStorage + Supabase `user_metadata.settings`, remote при логине побеждает), модалка (Obsidian-стиль: разделы, поиск, мгновенное применение). Записи регистрирует index.html (блок «Реестр настроек»)
- `sw.js`, `manifest.json` — PWA (сервис-воркер перехватывает только navigation-запросы)

**Правила распила:** новые чистые константы — в `js/constants.js`, новые строки перевода — в `js/strings.js`. **Импорты локальных модулей версионируются** (`./js/foo.js?v=N`): при изменении состава экспортов модуля бампните `?v=` в index.html, иначе свежий index.html слинкуется с закэшированным старым модулем (GitHub Pages кэширует ~10 мин, локальный python-сервер — эвристически) и приложение умрёт с «does not provide an export». Выносить код в новые модули — только отдельным механическим коммитом без изменения поведения (следующие кандидаты — svg-хелперы, markdown, geo, timeline-calc; благодаря леджеру функции, читающие разделяемое состояние, выносимы без проброса параметров). Запуск — только по HTTP (ES-модули), локально: `.claude/launch.json` → Static HTTP Server.

**Стек:**
- Vanilla JS (ES modules, `<script type="module">`)
- [swisseph-wasm](https://github.com/prolaxu/swisseph-wasm) — расчёты эфемерид через WebAssembly
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) — аутентификация и хранение карт
- SVG рендеринг вручную через DOM API (без canvas, без библиотек)

---

## Структура приложения

### Страница Home (дашборд)
- `#home-main` — две колонки:
  - `#home-left`: живой виджет «Небо сейчас» (`#home-sky` — мини-карта с домами по месту астролога из `localStorage.skyPlace`, обновление раз в 60с, Луна/фаза/VoC/ретрограды, клик → `enterSkyMode()`) + виджет «События» (`#home-events`: дни рождения ≤14 дней, сходящиеся транзиты ♃–♇ к наталам, орбис ≤1°)
  - `#home-right` (только залогиненным): поиск `#home-search`, кнопка `#newChartBtn` (открывает `#form-wrap` модалкой, класс `.modal`), чипы групп `#home-groups` (из колонки `folder`), список карт `#home-charts` с закреплением (`pinned`), «большой тройкой» (☉/☽/As) и сортировкой по `last_opened_at`
- Форма `#form-wrap`: незалогиненным — инлайн по центру; залогиненным — модалка
- Видимость главной — классы на body: `home-off` (открыта карта/небо, ставится в `hideHome()`/`showHome()`), `home-dash` (залогинен)
- Хедер (`#app-header`) с кнопкой настроек — всегда виден. ⚙ открывает дропдаун (кнопка «Настройки» → модалка `#settings-modal-overlay` + auth-зона)
- **Настройки** — реестр в `js/settings.js` + записи в index.html. Каждая запись: `{id, section, type: toggle|segment|action, default, lsKey/lsKind (прежние localStorage-ключи), labelKey, onChange}`. Область действия реестра — глобальная («метод астролога»); per-case состояние — `context.ui`/workspace_state, НЕ реестр. Новая настройка = запись в реестре + `getSetting()` в месте чтения; тумблеры панельных ☰-меню зовут `setSetting` (одно хранилище, две точки доступа). Классы событий таймлайна (`tlProgIngress`/`tlProgHouses`/`tlReturns`/`tlAngles` + `showProgLunarPhases`) гейтятся в `computeAndRenderTimeline`; ☰ в шапке натального таймлайна (`openTlSettingsMenu`, секция «Все карты», у sky-таймлайна его нет) — вторая точка доступа; смена → `refreshTimelineFromSettings()` (сброс `cachedTimeline`)
- Колонки Supabase `charts.pinned` (boolean) и `charts.last_opened_at` (timestamptz); код толерантен к их отсутствию до миграции

### Страница карты (`#layout-v2`)
Единственный макет. Открывается автоматически после расчёта через `activateLayout2()`.

```
┌──────────────────────────────────────────────────────────┐
│  #v2-top                                                 │
│  ┌─────────────┬───────────────────┬───────────────────┐ │
│  │ #v2-control │   #v2-chart-area  │ #v2-aspect-panel  │ │
│  │ -panel      │   #chart-block    │ #right-info-      │ │
│  │             │   (SVG карты)     │ content           │ │
│  │ Логотип     │                   │ #info-table       │ │
│  │ Имя / дата  │   #v2-chart-      │ #aspect-grid      │ │
│  │ ✎ 💾        │   expand-btn      │                   │ │
│  │             │                   │                   │ │
│  │ [Натал]     │                   │                   │ │
│  │ [Транзит]   │                   │                   │ │
│  │ [Прогр.]    │                   │                   │ │
│  │ [Дирекц.]   │                   │                   │ │
│  │             │                   │                   │ │
│  │ ◀◀◀ ▶▶▶    │                   │                   │ │
│  │ ◀◀  ▶▶     │                   │                   │ │
│  │ ◀   ▶      │                   │                   │ │
│  │ ↺           │                   │                   │ │
│  │ ⚙ ↩        │                   │                   │ │
│  └─────────────┴───────────────────┴───────────────────┘ │
├──────────────────────────────────────────────────────────┤
│  #v2-bottom                                              │
│  #v2-tl-tab (▲/▼ toggle)                                │
│  #v2-timeline-wrap → #right-timeline-content            │
└──────────────────────────────────────────────────────────┘
```

**V2 CSS states на `#layout-v2`:**
- `.tl-normal` — таймлайн занимает нижнюю часть (по умолчанию)
- `.tl-expanded` — таймлайн развёрнут
- `.tl-hidden` — таймлайн скрыт, карта на всю высоту

### Палитра (`#palette-view`)
Кнопка `+` таб-бара открывает пустую вкладку с палитрой (создать/открыть кейс, WORKSPACE_CONCEPT §8).
У вкладки поле `kind: 'palette' | undefined`; выбор карты или расчёт формы превращает её во вкладку
кейса в том же слоте (`choosePaletteChart` / `computeIntoPaletteTab`). Snapshot и hash для палитры
не пишутся. Список карт — из `_homeCharts` (pinned → `last_opened_at`).

### Хорар (`case_type = 'horary'`)
- Конструктор в палитре: вопрос + момент (по умолчанию сейчас) + место (по умолчанию `skyPlace`), всё редактируемо.
- Дома — **Региомонтан** (`'R'` в `swe.houses`; остальные типы — Плацидус).
- Пресет: класс `case-horary` на `#layout-v2` скрывает таймлайн, табы режимов и контроллер времени.
- Автосохранение в папку «Хорары» (`caseExtraColumns` → `case_type`/`question`/`folder`); миграция — `supabase_horary.sql`; код толерантен к отсутствию колонок.
- Исход: чипы Сбылся/Нет/Частично (`#v2-outcome` → `charts.outcome`, хранится и на вкладке).
- Градусная линейка 0–30° (`buildDegreeRuler`) — в нижней зоне на месте таймлайна (`#horary-bottom`,
  `renderHoraryBlock`). Панель Карты — только карта.
- Панель режимов и таймлайн выключены; правая группа предзагружает все виджеты,
  активен «События» (`applyHoraryRpPreset`).

### Синастрия (`case_type = 'synastry'`)
- **Композитный** кейс (WORKSPACE_CONCEPT §3/§9): своей сердцевины нет, ядро строки `charts`
  пустое; субъекты хранятся в jsonb-колонке `refs = { a, b }`, где каждый субъект — snapshot
  полей (`chartId`, `name`, `birth_date`, `birth_time`, `city`, `lat`, `lon`, `utc_offset`, `timezone`).
  `chartId` — ссылка на библиотечную карту (при выборе из сохранённых), `null` при ручном вводе.
- Конструктор — отдельная модалка `#syn-form` (два слота A/B), запускается из палитры
  (`openSynForm`). Каждый слот: поиск по `_homeCharts` (`synPickFiltered`, только `case_type='natal'`)
  **или** ручной ввод; место — автокомплит `geoSearch` + timeapi → utc (`synApplyGeo`). Wiring — `wireSynForm`.
- **Табы панели карты** (`#chart-mode-tabs`, синастрия-ветка `applyChartModeTabs`): «Карта А /
  Карта Б / Синастрия». Вид — глобал `synView` (`'a'|'b'|'both'`, дефолт `both`), персист в
  `context.ui`/view. Переключение — `switchSynView` → `renderSynastry` (диспетчер): `both` —
  совмещённое биколесо (`renderSynastryBiwheel`), `a`/`b` — одиночное натальное колесо субъекта
  (`renderSynastrySingle`).
- Совмещённое биколесо: A внутри (дом-каркас), B снаружи (куспиды короткими линиями, синие точки),
  кросс-аспекты A↔B. `renderSynastryBiwheel` — зеркало `renderBiwheelDirected`, переиспользует
  `drawDirectedCusps`/`drawTransitAspects`/`drawBiwheelPlanets`. Инфо-таблица — `biwheel-houses`
  (обе колонки планет и домов); правая сетка — кросс-аспекты `buildAspectGrid(A, B, 'natal')`.
- **Панель данных** — две карточки субъектов (`#v2-syn-subjects`), визуально как обычная карточка
  кейса: имя + ✎ (правка) + 💾 (сохранить), дата+GMT, место, чип типа. Правка субъекта — через
  общий `#form-wrap` в режиме editing (`editSynSubject` → `_synEditSlot`; `finishSynSubjectEdit`
  пишет `t.refs[slot]`, `recomputeSynastry` + перерисовка + `updateSynastryRefs` если сохранён).
- Данные `A` — в `natalData`, данные `B` — в глобале `synastryB`. Обе карты считает чистая
  `computeChartData(fields, houseSys)` (вынесена из `computeAndRenderNatal`). Пересчёт из `refs` —
  `paintSynastryFromRefs` (общая точка для создания, загрузки `openSynastryTab`, восстановления
  `rebuildTabFromFields`). `captureState`/`applyState` несут `synastryB`; `paintActiveChart` при
  `synastry` рисует биколесо.
- Пресет: класс `case-synastry` скрывает таймлайн и контроллер времени (как хорар), но табы
  панели карты остаются (переключатель вида A/Б/синастрия, см. выше). Правая группа — `grades` +
  `aspects` (`applySynastryRpPreset`).
- Автосохранение в папку «Синастрии» при логине (`saveSynastryToDb`, `caseExtraColumns` → пустое ядро
  + `name='A × B'`/`folder`/`refs`); миграция — `supabase_synastry.sql` (`refs jsonb`); код толерантен
  к отсутствию колонки (retry без `refs`).
- Follow-up: перечитывание субъектов по `chartId`, тонкие синастрические орбисы,
  композит/мидпойнт-виджеты.

### Правая группа виджетов (`#v2-aspect-panel`)
Группа переключаемых виджетов-табов (см. WORKSPACE_CONCEPT.md §6, §13):
- Реестр `RP_WIDGETS`: `grades` (таблица планет) / `aspects` (сетка) / `dignities` (достоинства:
  транспонированная таблица `buildDignityTable`, планеты — колонки) / `aspflow` («События»:
  прошлые/будущие события септенера — ингрессы, станции R/D, точные аспекты в окнах текущих
  знаков; `computeHoraryEvents` + `renderAspFlow`, кэш `_evCache`).
- В дефолтном составе: grades/aspects; dignities и aspflow — через `+` (у хорара — все).
- Табы группы сжимаются с многоточием при нехватке ширины; ☰ и `+` всегда видимы.
- Состав группы `rightPanelTabs` + активный `rightPanelTab` — в `context.ui`, персист per-case.
- Табы `#rp-tabs` рендерятся динамически (`applyRightPanelTab`). Шапка: `+` (добавить виджет)
  и `☰` (чеклист состава, последний не убирается), дропдаун `#rp-dropdown`.
- Контроллер времени — `#v2-panel-nav` в левой панели, под карточкой данных.

### Заметки (`#v2-notes-view`)
- Отдельная **выдвижная панель**, а не таб правой группы. Иконка-переключатель
  `#notesToggleBtn` — в хедере рядом с настройками (видна при `body.home-off`).
- `position:absolute` внутри `#v2-aspect-panel`; слайдится из-за правого края по классу
  `notes-open` на панели, шириной 100% панели — занимает место правой панели, карту не
  перекрывает. Шапка `#notes-panel-head` с заголовком и `#notes-panel-close` (✕).
- `openNotesPanel` / `closeNotesPanel` / `toggleNotesPanel`, флаг `notesPanelOpen`.
  Панель закрывается при выходе на дашборд; при смене вкладки перегружает заметки
  текущей карты (`openNotesTab`). Список + markdown-редактор — как раньше.

### Скрытый код (`#forecast-layout`)
Вкладка «Прогноз» скрыта (`display:none !important`), код сохранён для будущего использования.

---

## URL-роутинг

Hash-based роутинг для карт:
- Главная: `index.html`
- Карта: `index.html#chart/<supabase-id>`

При загрузке с хэшем — карта автоматически загружается из Supabase (требует авторизации).
Браузерная кнопка «Назад» корректно возвращает на главную.

---

## Ключевые константы (layout)

Все размеры карты — в объекте `CHART` (единая точка редактирования):

```js
CHART.W = 740, CHART.H = 740          // размер SVG
CHART.R_RING = 273, CHART.RING_W = 26 // зодиакальное кольцо
CHART.R_INNER = 196                    // внутренний круг натальной карты
CHART.R_LABEL = 304                    // подписи домов (снаружи кольца)

// Биколесо
CHART.BW_R_INNER   = 128              // внутренний круг биколеса
CHART.BW_R_DIVIDER = 196              // разделитель натал / внешнее кольцо
```

Геометрия таймлайна — в объекте `TL`:

```js
TL.PX_PER_DAY_MONTH = 3               // пикселей на день (масштаб по месяцам)
TL.PX_PER_DAY_YEAR  = 70 / 365.25     // пикселей на день (масштаб по годам)
TL.LABEL_W = 44                        // ширина левой панели с планетами
TL.HDR_H   = 28                        // высота заголовка (месяцы/годы)
TL.BAR_H   = 4                         // высота полосы транзита
TL.SUB_H   = 18                        // высота одной дорожки в строке
```

---

## Ключевые функции

### Координаты и геометрия
- `lonToRad(lon, asc)` — эклиптическая долгота → угол SVG (ASC на 9 часов, против часовой)
- `polar(angle, r)` — угол+радиус → `{x, y}` на SVG
- `angDiff(a, b)` — кратчайшая разница углов (0–180)

### Рендеринг натальной карты (`renderChart`)
Порядок слоёв (важно!):
1. Белый фон
2. Оси домов (за кольцом)
3. Зодиакальное кольцо (серое)
4. Разделители знаков (белые линии)
5. Глифы знаков зодиака
6. Внутренний круг (белый, перекрывает центр)
7. Аспекты
8. Планеты (`drawPlanets`)
9. Подписи домов

### `drawPlanets(g, planets, asc)`
- Точки (dots) — на `R_INNER` по точной позиции
- Глифы — на радиусе `GLYPH_R = 230`
- Кластеризация: если планеты ближе `THR_RAD = 0.18 рад (~10°)` — разводятся с шагом `STEP_PX = 22`
- Лидер-линии рисуются только для кластеров
- Ретроградность: маленькая «R» справа от глифа

### `drawBiwheelPlanets(g, planets, asc, rDot, rGlyph)`
- Универсальная функция для обоих колец биколеса
- Натальные: `rDot=R_BW_INNER (128)`, `rGlyph=R_N_PLANET (160)`
- Транзитные: `rDot=R_DIVIDER (196)`, `rGlyph=R_T_PLANET (230)`

### Таблица планет (`renderTable`)
Заполняет `#tableBody` внутри `#right-info-content`. Показывает натальные планеты: знак, градус, дом.

### `switchToMode(mode)`
Главная функция переключения режима карты: `'natal' | 'transit' | 'progressed' | 'direction'`.
Обновляет `currentMode`, вызывает `syncV2ModeButtons()` и рендерит нужный вид.

### `syncV2ModeButtons()`
Синхронизирует классы `.active` на кнопках `#v2-control-panel .v2-mode-btn`.

### `enterChartMode(name, date, time)`
Скрывает `#form-wrap`, показывает V2 через `activateLayout2()`.

### `exitChartMode(updateHistory)`
Скрывает V2 (`classList.remove('v2-visible', ...)`), показывает `#form-wrap`, сбрасывает состояние.

### `activateLayout2()`
Показывает `#layout-v2`, инициализирует рендер биколеса и таймлайна. DOM элементы уже в нужных местах (не перемещаются).

### `computeTlLayout(periods, progEvents, dirEvents)`
Чистая функция, вызывается из `renderTimeline`. Возвращает объект:
`{ rows, TL_H, progAspects, progMoonAsps, progPoints, PROG_ASP_H, PROG_MOON_H, PROG_TICK_H, PROG_SECTION_H, DIR_TICK_H, moonBandY }`
Содержит всю логику распределения дорожек по строкам и расчёт высот секций таймлайна.

---

## Цветовая палитра

### CSS `:root` — цвета UI (фон, текст, границы)
Определены в блоке `:root {}` в начале `styles.css`. Используются в CSS правилах через `var(--name)`.

```css
--bg-page, --bg, --bg-input, --bg-hover, --bg-active, --bg-row-alt  /* фоны */
--bd, --bd-light, --bd-input                                          /* границы */
--tx, --tx-2 … --tx-9                                                 /* текст (от тёмного к светлому) */
--accent, --accent-hv                                                  /* акцентный цвет */
--link, --link-bg                                                      /* ссылки */
--danger, --danger-bg, --ok, --retro, --err                           /* статусные цвета */
--tl-scale-act                                                         /* активная кнопка масштаба таймлайна */
```

### JS `COLORS` — цвета SVG-рендеринга
Объект-константа, единая точка редактирования для всех SVG-цветов. Используется в `ASPECTS`, `T_ASPECTS`, `D_ASPECTS`, `SIGN_ELEM_COLORS` и функциях рендеринга.

```js
COLORS = {
  // Аспекты на карте
  conj: '#2244bb',         // соединение (синий)
  chartSoft: '#FF0000',    // мягкие аспекты натала (секстиль, трин)
  chartHard: '#000000',    // жёсткие аспекты натала (квадрат, оппозиция)
  tlSoft: '#228833',       // мягкие транзитные аспекты
  tlHard: '#cc1111',       // жёсткие транзитные аспекты
  tlNeutral: '#000000',    // нейтральные транзитные аспекты

  // Элементы зодиака
  fire, earth, air, water,

  // Кольцо зодиака
  ring: '#808080',

  // Фоны строк таймлайна
  tlProg, tlMoon, tlDir, tlMoonLine, tlMoonGlyph,
  tlRowAlt, tlFastBg, tlSepLine, tlGrid,

  // UI таймлайна
  tlCursor, tlPlusBg, tlPlusStr, tlGlyph, tlMuted, tlLabel, tlRowBd, tlSectionBd,
}
```

---

## Аспекты

Натальные аспекты (`ASPECTS`): цвета берутся из `COLORS.*`
- Соединение (0°, orb 8°) — `COLORS.conj`, эллипс
- Секстиль (60°, orb 5°) — `COLORS.chartSoft`
- Квадрат (90°, orb 7°) — `COLORS.chartHard`
- Трин (120°, orb 7°) — `COLORS.chartSoft`
- Оппозиция (180°, orb 8°) — `COLORS.chartHard`

Транзитные аспекты (`T_ASPECTS`, orb 3°): используют `COLORS.tlSoft`, `COLORS.tlHard`, `COLORS.tlNeutral`.

**Состав и орбисы настраиваются** (раздел «Аспекты» модалки): `ASPECTS` содержит мажоры (`major:true`) + минорные (полусекстиль 30°, квиконс 150°, по умолчанию выключены). Активный состав — `activeNatalAspects()` (фильтр `natalAspectFilter`, ls-ключ `natalAspectFilter`) — действует ТОЛЬКО на натальное отображение (линии карты `drawAspects`, сетка `findGridAspect` в режиме natal). Прогрессии/транзиты/поиск/события — всегда `MAJOR_ASPECTS`. Орбисы: профили-множители ×0.75/1/1.25 (`natalOrbFactor()` / `transitOrbFactor()`, настройки `orbProfileNatal`/`orbProfileTransit`); транзитный фактор действует на биколесо и таймлайн (смена сбрасывает `fastCache` + `cachedTimeline`), sky-расчёты не трогает.

---

## Данные планет

```js
PLANETS = [
  { id: 0,  name: 'Солнце',   glyph: '☉' },
  { id: 1,  name: 'Луна' },
  { id: 2,  name: 'Меркурий' },
  { id: 3,  name: 'Венера' },
  { id: 4,  name: 'Марс' },
  { id: 5,  name: 'Юпитер' },
  { id: 6,  name: 'Сатурн' },
  { id: 7,  name: 'Уран' },
  { id: 8,  name: 'Нептун' },
  { id: 9,  name: 'Плутон' },
  { id: 10, name: 'С. Узел' },
  { id: 12, name: 'Лилит' },
  { id: 15, name: 'Хирон' },
]
```

Медленные планеты (для timeline): ids 5,6,7,8,9,10,12,15
Быстрые планеты: ids 0,2,3,4 (Солнце, Меркурий, Венера, Марс)

Строка «Углы» в таймлайне: соединения медленных планет + Марса с угловыми куспидами (As/Ic/Ds/Mc).
Псевдо-цель `TL_ANGLE_ID = 100`, флаг `na.isAngle`, только ☌; Марс к углам скрыт на масштабе 10Y;
строка не раскрывается (нет быстрых транзитов). Режим по умолчанию после расчёта карты — `natal`.

---

## Зодиак и система домов

- `SIGNS` — 12 глифов знаков (Unicode + `︎` чтобы не рендерились как эмодзи)
- **Система домов — каскад** (см. память/обсуждение): оверрайд кейса (`t.houseSystem` ↔ `charts.house_system`, селектор-чип `#v2-house-sys` на карточке) → дефолт типа кейса из настроек (`houseSysNatal`='P', `houseSysHorary`='R', `houseSysElection`='P', раздел «Расчёты»). Резолверы: `houseSysFor(t)` / `houseSysForType(type)`. Фактическая система пишется в кейс при сохранении (`caseExtraColumns`); миграция — `supabase_house_system.sql`, код толерантен к отсутствию колонки. Список систем — `HOUSE_SYSTEMS` (P/K/R/C/O/E/W/B). ВАЖНО: только `swe.houses_ex()` учитывает hsys (`swe.houses()` игнорирует — баг swisseph-wasm)
- Угловые точки: `ANGULAR = { 0: 'As', 3: 'Ic', 6: 'Ds', 9: 'Mc' }`

---

## SVG вспомогательные функции

```js
el(tag, attrs, text)   // создать SVG элемент
circ(cx, cy, r, attrs) // circle
ln(x1,y1,x2,y2,attrs)  // line
txt(x, y, s, attrs)    // text
lblSup(x,y,main,deg)   // текст с суперскриптом градусов
```

---

## Глобальное состояние

**Источник истины — `js/state.js` (леджер на `globalThis`, фаза 1 распила).** Полный
инвентарь с комментариями — там; ниже ключевые поля. `_`-префиксные приватные
переменные остаются `let`-декларациями в index.html.

```js
swe              // инстанс SwissEph (null до инициализации)
natalData        // { planets, cusps, asc, mc, birthJD, lat, lon } после расчёта
currentChartId   // Supabase id открытой карты (null если не сохранена)
currentMode      // 'natal' | 'transit' | 'progressed' | 'direction'
currentTransitJD // текущий JD для отображения (null = сегодня)
cachedTimeline   // кэш транзитного timeline
tlPastYears      // дополнительные годы в прошлом
tlFutureYears    // дополнительные годы в будущем
expandedRows     // Set<planetId> — раскрытые строки (быстрые транзиты)
fastCache        // planetId → periods[] (кэш быстрых транзитов)
detectedTimezone // IANA timezone после геокодинга
_pendingChartLoad // chart row из Supabase, ожидающий инициализации swe
layout2Active    // bool — V2 layout активен
layout2TlState   // 0|1 — индекс в V2_TL_STATES
chartExpanded    // bool — карта развёрнута на всю высоту
```

---

## Backend (Supabase)

- URL и KEY прямо в коде (anon key — это нормально)
- Таблица `charts`: `id, user_id, name, birth_date, birth_time, city, lat, lon, utc_offset, timezone, created_at`
- Auth: email+password, Google OAuth, Apple OAuth
- RLS должен быть настроен на Supabase стороне

---

## Геокодинг

- Nominatim (OpenStreetMap) для поиска мест
- timeapi.io для определения часового пояса по координатам
- Debounce 380ms на input

---

## Важные соглашения

1. **Зодиак всегда фиксирован** (0° Овна в начале) — `asc` передаётся как `0` во всех `draw*` функциях, несмотря на параметр
2. **Планеты в кластере**: точки на точной позиции, глифы разводятся равномерно, лидер-линии — только при кластере
3. **Биколесо**: натал внутри (ближе к центру), транзиты снаружи (между разделителем и зодиаком)
4. **Глифы**: все Unicode символы с суффиксом `︎` чтобы не отображались как эмодзи на мобильных
5. **Коммит и пуш** — только по явной просьбе пользователя
6. **DOM-элементы карты** (`#chart-block`, `#right-info-content`, `#right-timeline-content`) живут в HTML статично внутри V2 — не перемещаются через JS
