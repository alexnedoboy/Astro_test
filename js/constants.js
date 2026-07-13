// Чистые константы приложения: планеты, цвета, аспекты, геометрия карты и таймлайна.
// Вынесено из index.html (фаза 0 распила). Мутабельного состояния здесь НЕТ.

// ── Constants ─────────────────────────────────────────────────────────────────

const PLANETS = [
  { id: 0,  name: 'Солнце',   glyph: '☉\uFE0E', hamburgGlyph: 'Q', degOffset: 9 },
  { id: 1,  name: 'Луна',     glyph: '☽\uFE0E', hamburgGlyph: 'W', degOffset: 9 },
  { id: 2,  name: 'Меркурий', glyph: '☿\uFE0E', hamburgGlyph: 'E', degOffset: 7 },
  { id: 3,  name: 'Венера',   glyph: '♀\uFE0E', hamburgGlyph: 'R', degOffset: 7 },
  { id: 4,  name: 'Марс',     glyph: '♂\uFE0E', hamburgGlyph: 'T', degOffset: 9 },
  { id: 5,  name: 'Юпитер',   glyph: '♃\uFE0E', hamburgGlyph: 'Y', degOffset: 7 },
  { id: 6,  name: 'Сатурн',   glyph: '♄\uFE0E', hamburgGlyph: 'U', degOffset: 6 },
  { id: 7,  name: 'Уран',     glyph: '♅\uFE0E', hamburgGlyph: 'I', degOffset: 9 },
  { id: 8,  name: 'Нептун',   glyph: '♆\uFE0E', hamburgGlyph: 'O', degOffset: 9 },
  { id: 9,  name: 'Плутон',   glyph: '♇\uFE0E', hamburgGlyph: 'P', degOffset: 11 },
  { id: 10, name: 'С. Узел',  glyph: '☊\uFE0E', hamburgGlyph: '{', degOffset: 8 },
  { id: 12, name: 'Лилит',    glyph: '⚸\uFE0E', hamburgGlyph: '`', degOffset: 9 },
  { id: 15, name: 'Хирон',    glyph: '⚷\uFE0E', hamburgGlyph: 'M', degOffset: 8 },
];

const SIGNS      = ['♈\uFE0E','♉\uFE0E','♊\uFE0E','♋\uFE0E','♌\uFE0E','♍\uFE0E','♎\uFE0E','♏\uFE0E','♐\uFE0E','♑\uFE0E','♒\uFE0E','♓\uFE0E'];
const SIGN_NAMES = ['Овен','Телец','Близнецы','Рак','Лев','Дева',
                    'Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'];
const ROMAN      = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
const ANGULAR    = { 0: 'As', 3: 'Ic', 6: 'Ds', 9: 'Mc' };

// ── Color palette ─────────────────────────────────────────────────────────────
// Single source of truth for all SVG rendering colors.
// CSS UI colors live in :root {} at the top of <style>.
const COLORS = {
  // ── Aspects in natal / progressed / direction chart SVG ──────────────────
  conj:        '#2244bb',  // conjunction — blue
  chartSoft:   '#FF0000',  // sextile / trine — red
  chartHard:   '#000000',  // square / opposition — black

  // ── Aspects in timeline bars ─────────────────────────────────────────────
  tlSoft:      '#228833',  // sextile / trine — green
  tlHard:      '#cc1111',  // square / opposition — red
  tlNeutral:   '#000000',  // ingress, station, sign change — black

  // ── Zodiac element ring fills ────────────────────────────────────────────
  fire:        '#FD4948',
  earth:       '#A9DA31',
  air:         '#F9E255',
  water:       '#6FCCF8',

  // ── Chart SVG structure ──────────────────────────────────────────────────
  ring:        '#757575',  // zodiac ring band (thick)
  ringLine:    '#B8AEA9',  // thin structural circles and house axes

  // ── Timeline section backgrounds ─────────────────────────────────────────
  tlProg:      'transparent',  // progressed events section fill
  tlMoon:      'transparent',  // progressed moon sub-band fill
  tlDir:       'transparent',  // solar arc direction section fill
  tlMoonLine:  '#E4DAD5',  // moon band border
  tlMoonGlyph: '#A69990',  // moon glyph / collapse chevron

  // ── Timeline general ─────────────────────────────────────────────────────
  tlRowAlt:    'transparent',  // alternating natal-row background
  tlFastBg:    'transparent',  // fast-transits sub-section tint
  tlSepLine:   '#DDD5D0',  // dashed separator: slow / fast rows
  tlGrid:      '#E8E2DE',  // month / year grid lines
  tlCursor:    '#C0392B',  // today / selected-date cursor line
  tlPlusBg:    '#F5F0ED',  // extend-range (+) button fill
  tlPlusStr:   '#D4CBC6',  // extend-range (+) button stroke
  tlGlyph:     '#2D2420',  // planet glyph text in left panel
  tlMuted:     '#B0A8A4',  // gear icon, expand arrows, italic labels
  tlLabel:     '#B0A8A4',  // month / year header labels
  tlRowBd:     '#ECE6E2',  // row separator line
  tlSectionBd: '#D4CBC6',  // section bottom border
};

// ── Element color arrays (derived from COLORS) ────────────────────────────────
// Fire/Earth/Air/Water repeating for signs 0(Aries)–11(Pisces)
const SIGN_ELEM_COLORS = [
  COLORS.fire, COLORS.earth, COLORS.air, COLORS.water,
  COLORS.fire, COLORS.earth, COLORS.air, COLORS.water,
  COLORS.fire, COLORS.earth, COLORS.air, COLORS.water,
];

// Angular cusp colors for element colors mode
const ANGULAR_COLORS = { 0: '#ED0004', 3: '#72EF6D', 6: '#4248AA', 9: '#F84CD6' };

// Natal aspects — dynamic orbs via getNatalOrb()
const ASPECTS = [
  { angle: 0,   color: COLORS.conj,      width: 1, dash: '', symbol: '☌\uFE0E', hg: 'q', type: 'conj', name: 'Соединение' },
  { angle: 60,  color: COLORS.chartSoft, width: 1, dash: '', symbol: '✶',        hg: 't',               name: 'Секстиль' },
  { angle: 90,  color: COLORS.chartHard, width: 1, dash: '', symbol: '□',        hg: 'r',               name: 'Квадрат' },
  { angle: 120, color: COLORS.chartSoft, width: 1, dash: '', symbol: '△',        hg: 'e',               name: 'Трин' },
  { angle: 180, color: COLORS.chartHard, width: 1, dash: '', symbol: '☍\uFE0E', hg: 'w',               name: 'Оппозиция' },
];

// Dynamic natal orb: conjunction 8°/6°, trine & opposition 7°/6°, square & sextile 6°
// +1° if Sun (0) or Moon (1) is involved
function getNatalOrb(asp, id1, id2) {
  const hasSunMoon = (id1 === 0 || id1 === 1 || id2 === 0 || id2 === 1);
  if (asp.angle === 0)   return hasSunMoon ? 8 : 6;
  if (asp.angle === 180 || asp.angle === 120) return hasSunMoon ? 7 : 6;
  return 6;
}

// ── House rulership (classical + modern outer planets) ────────────────────────
// Index = sign 0=Aries…11=Pisces. Scorpio: Mars+Pluto, Aquarius: Uranus+Saturn, Pisces: Neptune+Jupiter
const SIGN_RULERS = [
  [4],      // Aries → Mars
  [3],      // Taurus → Venus
  [2],      // Gemini → Mercury
  [1],      // Cancer → Moon
  [0],      // Leo → Sun
  [2],      // Virgo → Mercury
  [3],      // Libra → Venus
  [4, 9],   // Scorpio → Mars, Pluto
  [5],      // Sagittarius → Jupiter
  [6],      // Capricorn → Saturn
  [7, 6],   // Aquarius → Uranus, Saturn
  [8, 5],   // Pisces → Neptune, Jupiter
];

function getHouseRulerPlanets(houseIdx, cusps) {
  const signIdx = Math.floor(((cusps[houseIdx] % 360) + 360) % 360 / 30);
  return (SIGN_RULERS[signIdx] ?? []).map(id => PLANETS.find(p => p.id === id)).filter(Boolean);
}

// ── Chart configuration (единая точка для всех параметров рендеринга) ─────────

const CHART = {
  // Холст
  W: 740, H: 740,
  VB_CROP: 58,

  // Зодиакальное кольцо — общее для всех типов карт
  R_RING:  273,   // центральная линия кольца
  RING_W:   26,   // толщина кольца

  // Одиночная карта
  R_INNER:        196,  // граница внутреннего круга
  R_LABEL:        304,  // подписи домов (снаружи кольца)
  R_CONJ_ELLIPSE: 208,  // центр эллипса соединений (drawClusters)

  // Одиночная карта — радиальные уровни глифов (196 → 260 — доступное пространство)
  R_TICK:        196,   // точка истинной позиции (на границе внутреннего круга)
  R_GLYPH_L0:    214,   // уровень 0: основная дорожка глифов
  R_GLYPH_L1:    236,   // уровень 1: внешняя дорожка (кластеры 3+ планет)
  GLYPH_MIN_GAP: 0.105, // ~6° — минимальный угловой зазор между глифами на одном уровне

  // Биколесо (транзиты / дирекции / прогрессии)
  BW_R_INNER:   128,  // внутренняя граница
  BW_R_DIVIDER: 196,  // разделитель натал / внешнее кольцо

  // Биколесо — уровни глифов, натальное кольцо (128 → 196)
  BW_R_NATAL_GLYPH:    150,  // уровень 0
  BW_R_NATAL_GLYPH_L1: 170,  // уровень 1

  // Биколесо — уровни глифов, внешнее кольцо (196 → 260)
  BW_R_TRANSIT_GLYPH:    218,  // уровень 0
  BW_R_TRANSIT_GLYPH_L1: 240, // уровень 1

  BW_GLYPH_MIN_GAP: 0.105,  // ~6° — тот же порог для биколеса

  // Градусное кольцо — одиночная карта (на R_INNER)
  DEG_RING_W:       4,   // ширина кольца (R_INNER - DEG_RING_W = внутренний край)
  DEG_SIGN_EXT:     4,   // на сколько px знаковая черточка выходит за R_INNER

  // Градусное кольцо — биколесо (на R_BW_INNER)
  BW_DEG_RING_W:    3,   // ширина кольца
  BW_DEG_SIGN_EXT:  3,   // выход знаковой черточки за R_BW_INNER
};

// Производные значения (вычисляются из CHART, не редактировать напрямую)
const W         = CHART.W;
const H         = CHART.H;
const CX        = W / 2;
const CY        = H / 2;
const VB_CROP   = CHART.VB_CROP;
const VIEWBOX   = `${VB_CROP} ${VB_CROP} ${W - VB_CROP * 2} ${H - VB_CROP * 2}`;
const R_RING    = CHART.R_RING;
const RING_W    = CHART.RING_W;
const R_ZOD_OUT = R_RING + RING_W / 2;   // 286 – внешний край кольца
const R_ZOD_IN  = R_RING - RING_W / 2;   // 260 – внутренний край кольца
const R_INNER   = CHART.R_INNER;
const R_PLANET  = CHART.R_CONJ_ELLIPSE;  // используется в drawClusters
const R_LABEL   = CHART.R_LABEL;
const R_BW_INNER = CHART.BW_R_INNER;
const R_DIVIDER  = CHART.BW_R_DIVIDER;
const R_T_PLANET = CHART.BW_R_TRANSIT_GLYPH;
const R_N_PLANET = CHART.BW_R_NATAL_GLYPH;

const SLOW_IDS = [5, 6, 7, 8, 9, 10, 12, 15]; // Jupiter, Saturn, Uranus, Neptune, Pluto, Node, Lilith, Chiron
const FAST_IDS = [0, 2, 3, 4];            // Sun, Mercury, Venus, Mars
const TL_ANGLE_ID = 100;                  // pseudo natal-target id: angular cusp row (As/Ic/Ds/Mc)

// Orb per transiting planet (degrees)
function getTransitOrb(planetId) {
  if (planetId === 7 || planetId === 8 || planetId === 9) return 1;              // Uranus, Neptune, Pluto
  if (planetId === 5 || planetId === 6 || planetId === 15) return 3;             // Jupiter, Saturn, Chiron
  if (planetId === 10 || planetId === 12 || planetId === -10) return 3;          // Node, Lilith, S.Node
  return 5;  // Sun, Mercury, Venus, Mars
}

const T_ASPECTS = [
  { angle: 0,   color: COLORS.conj,    symbol: '☌', hg: 'q' },
  { angle: 60,  color: COLORS.tlSoft, symbol: '✶', hg: 't' },
  { angle: 90,  color: COLORS.tlHard, symbol: '□', hg: 'r' },
  { angle: 120, color: COLORS.tlSoft, symbol: '△', hg: 'e' },
  { angle: 180, color: COLORS.tlHard, symbol: '☍', hg: 'w' },
];

const D_ASPECTS = [
  { angle: 0,   color: COLORS.conj,       symbol: '☌', hg: 'q' },
  { angle: 60,  color: COLORS.chartSoft, symbol: '✶', hg: 't' },
  { angle: 90,  color: COLORS.chartHard, symbol: '□', hg: 'r' },
  { angle: 120, color: COLORS.chartSoft, symbol: '△', hg: 'e' },
  { angle: 180, color: COLORS.chartHard, symbol: '☍', hg: 'w' },
];

// ── Timeline layout constants ─────────────────────────────────────────────────
// Change these to adjust the timeline's geometry globally.
const TL = {
  PX_PER_DAY_1M:    22,          // pixels per day (1-month scale)
  PX_PER_DAY_MONTH: 3,           // pixels per day (year scale)
  PX_PER_DAY_YEAR:  70 / 365.25, // pixels per day (year scale — 70px per year)
  LABEL_W:          44,           // left panel width (planet label column)
  HDR_H:            28,           // sticky header row height
  BAR_H:            4,            // transit bar height
  SUB_H:            18,           // lane height within a row
};

export { PLANETS, SIGNS, SIGN_NAMES, ROMAN, ANGULAR, COLORS, SIGN_ELEM_COLORS, ANGULAR_COLORS, ASPECTS, getNatalOrb, SIGN_RULERS, getHouseRulerPlanets, CHART, W, H, CX, CY, VB_CROP, VIEWBOX, R_RING, RING_W, R_ZOD_OUT, R_ZOD_IN, R_INNER, R_PLANET, R_LABEL, R_BW_INNER, R_DIVIDER, R_T_PLANET, R_N_PLANET, SLOW_IDS, FAST_IDS, TL_ANGLE_ID, getTransitOrb, T_ASPECTS, D_ASPECTS, TL };
