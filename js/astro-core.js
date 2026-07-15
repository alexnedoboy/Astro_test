// js/astro-core.js — чистое расчётное ядро (фаза 1 распила).
// Без DOM и без UI-состояния; swe читается из леджера (js/state.js).

import { PLANETS, CX, CY } from './constants.js?v=3';

// Ecliptic longitude → SVG angle (ASC at 9 o'clock, CCW = increasing lon)
function lonToRad(lon, asc) { return (180 - (lon - asc)) * Math.PI / 180; }
function polar(a, r)         { return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }; }
function angDiff(a, b)       { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

function findHouse(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    const s = cusps[i], e = cusps[(i + 1) % 12];
    if (s <= e ? (lon >= s && lon < e) : (lon >= s || lon < e)) return i + 1;
  }
  return 1;
}

function safeCalcUt(jd, id, flags) {
  try { return swe.calc_ut(jd, id, flags); }
  catch (e) { return null; }
}

// Чистый расчёт карты из набора полей (без DOM). Возвращает объект данных карты
// либо null, если полей не хватает. fields = { birthDate, birthTime, lat, lon, utcOff }.
// houseSys — система домов ('P' Плацидус по умолчанию, 'R' Региомонтан у хорара).
function computeChartData(fields, houseSys = 'P') {
  if (!swe || !fields) return null;
  const lat    = parseFloat(fields.lat);
  const lon    = parseFloat(fields.lon);
  const utcOff = parseFloat(fields.utcOff) || 0;
  if (!fields.birthDate || !fields.birthTime || isNaN(lat) || isNaN(lon)) return null;

  const [y, m, d] = fields.birthDate.split('-').map(Number);
  const [hr, mn]  = fields.birthTime.split(':').map(Number);
  const jd        = swe.julday(y, m, d, hr + mn / 60 - utcOff);
  const flags     = (swe.SEFLG_SWIEPH ?? 2) | (swe.SEFLG_SPEED ?? 256);

  const planets = PLANETS.map(p => {
    const r = safeCalcUt(jd, p.id, flags);   // вне диапазона астероидных файлов (Хирон < 1800) — пропуск
    if (!r) return null;
    return { ...p, longitude: ((r[0] % 360) + 360) % 360, speed: r[3], retrograde: r[3] < 0 && p.id !== 10 && p.id !== 12 };
  }).filter(Boolean);

  // ВАЖНО: swe.houses() (4 аргумента) в swisseph-wasm игнорирует параметр системы
  // домов и всегда считает Плацидус — используем houses_ex(), которая учитывает hsys.
  const hRes  = swe.houses_ex(jd, flags, lat, lon, houseSys);
  const cusps = Array.from(hRes.cusps).slice(1, 13);
  const ascmc = Array.from(hRes.ascmc);
  const asc   = ((ascmc[0] % 360) + 360) % 360;
  const mc    = ((ascmc[1] % 360) + 360) % 360;

  planets.forEach(p => { p.house = findHouse(p.longitude, cusps); });
  return { planets, cusps, asc, mc, birthJD: jd, lat, lon, originalBirthJD: jd, utcOff };
}

export { safeCalcUt, computeChartData, findHouse, lonToRad, polar, angDiff };
