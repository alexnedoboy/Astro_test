// js/astro-core.js — чистое расчётное ядро (фаза 1 распила).
// Без DOM и без UI-состояния; swe читается из леджера (js/state.js).

import { PLANETS, CX, CY } from './constants.js?v=7';

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
// либо null, если полей не хватает. fields = { birthDate, birthTime, lat, lon, utcOff, noHouses }.
// houseSys — система домов ('P' Плацидус по умолчанию, 'R' Региомонтан у хорара).
// noHouses (или пустое birthTime) → космограмма: планеты на полдень местного
// времени, без домов/ASC/MC (cusps=null, asc=mc=0), house у планет не проставляется.
function computeChartData(fields, houseSys = 'P') {
  if (!swe || !fields) return null;
  const lat    = parseFloat(fields.lat);
  const lon    = parseFloat(fields.lon);
  const utcOff = parseFloat(fields.utcOff) || 0;
  const noHouses = !!fields.noHouses || !fields.birthTime;
  if (!fields.birthDate || isNaN(lat) || isNaN(lon)) return null;

  const [y, m, d] = fields.birthDate.split('-').map(Number);
  const [hr, mn]  = (fields.birthTime || '12:00').split(':').map(Number);
  const jd        = swe.julday(y, m, d, hr + mn / 60 - utcOff);
  return computeChartAt(jd, lat, lon, houseSys, noHouses, utcOff);
}

// Карта на момент jd (UT) и место — общее ядро computeChartData и карты Дэвисона.
function computeChartAt(jd, lat, lon, houseSys = 'P', noHouses = false, utcOff = 0) {
  const flags = (swe.SEFLG_SWIEPH ?? 2) | (swe.SEFLG_SPEED ?? 256);

  const planets = PLANETS.map(p => {
    const r = safeCalcUt(jd, p.id, flags);   // вне диапазона астероидных файлов (Хирон < 1800) — пропуск
    if (!r) return null;
    return { ...p, longitude: ((r[0] % 360) + 360) % 360, speed: r[3], retrograde: r[3] < 0 && p.id !== 10 && p.id !== 12 };
  }).filter(Boolean);

  if (noHouses) {
    return { planets, cusps: null, asc: 0, mc: 0, birthJD: jd, lat, lon, originalBirthJD: jd, utcOff, noHouses: true };
  }

  // ВАЖНО: swe.houses() (4 аргумента) в swisseph-wasm игнорирует параметр системы
  // домов и всегда считает Плацидус — используем houses_ex(), которая учитывает hsys.
  const hRes  = swe.houses_ex(jd, flags, lat, lon, houseSys);
  const cusps = Array.from(hRes.cusps).slice(1, 13);
  const ascmc = Array.from(hRes.ascmc);
  const asc   = ((ascmc[0] % 360) + 360) % 360;
  const mc    = ((ascmc[1] % 360) + 360) % 360;

  planets.forEach(p => { p.house = findHouse(p.longitude, cusps); });
  return { planets, cusps, asc, mc, birthJD: jd, lat, lon, originalBirthJD: jd, utcOff, noHouses: false };
}

const norm360 = x => ((x % 360) + 360) % 360;
const D2R = Math.PI / 180;

// Середина двух долгот по короткой дуге (350° и 10° → 0°, а не 180°).
// При почти точной оппозиции выбор стороны условен — особенность метода, не баг.
function midLon(a, b) {
  const d = ((b - a) % 360 + 540) % 360 - 180;   // (−180, 180]
  return norm360(a + d / 2);
}

// Географическая середина (по большому кругу, через 3D-векторы)
function geoMidpoint(lat1, lon1, lat2, lon2) {
  const v = (la, lo) => [Math.cos(la * D2R) * Math.cos(lo * D2R), Math.cos(la * D2R) * Math.sin(lo * D2R), Math.sin(la * D2R)];
  const a = v(lat1, lon1), b = v(lat2, lon2);
  const x = a[0] + b[0], y = a[1] + b[1], z = a[2] + b[2];
  if (Math.hypot(x, y, z) < 1e-9) return { lat: (lat1 + lat2) / 2, lon: lon1 };   // антиподы
  return { lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: Math.atan2(y, x) / D2R };
}

// Композит по мидпойнтам. Планеты — середины пар по короткой дуге.
// Дома — два метода (opts.method):
//  • 'mc' (опорное место, дефолт): MC = середина MC, остальные дома строятся от него
//    (houses_armc) на широте opts.lat (по умолчанию — средняя широта рождений);
//    As — из расчёта домов, не середина Асцендентов.
//  • 'midpoint': каждый куспид — середина пары. Наивное «каждый по короткой дуге» в
//    ~14% пар ломает порядок домов (соседние куспиды прыгают на 180°), поэтому
//    по короткой дуге берётся только As, а остальные куспиды — согласованно:
//    As_mid + среднее расстояний куспида от своего As у A и B. Порядок гарантирован;
//    MC при этом может отличаться от середины MC по короткой дуге на 180°.
// Скорости у композита нет — speed 0, без ретроградности. Нет времени у кого-то → без домов.
function computeComposite(A, B, houseSys = 'P', opts = {}) {
  if (!A || !B) return null;
  const byId = new Map(B.planets.map(p => [p.id, p]));
  const planets = A.planets.filter(p => byId.has(p.id)).map(p => ({
    ...p, longitude: midLon(p.longitude, byId.get(p.id).longitude), speed: 0, retrograde: false,
  }));
  const jd  = (A.birthJD + B.birthJD) / 2;
  const lat = Number.isFinite(opts.lat) ? opts.lat : (A.lat + B.lat) / 2;
  const lon = geoMidpoint(A.lat, A.lon, B.lat, B.lon).lon;
  const method = opts.method === 'midpoint' ? 'midpoint' : 'mc';
  const base = { planets, birthJD: jd, originalBirthJD: jd, lat, lon, utcOff: 0, composite: true, houseMethod: method };
  if (A.noHouses || B.noHouses) return { ...base, cusps: null, asc: 0, mc: 0, noHouses: true };

  let cusps, asc, mc;
  if (method === 'midpoint') {
    // якорь — 1-й куспид по короткой дуге; всё остальное — согласованно от него
    const anchor = midLon(A.cusps[0], B.cusps[0]);
    // смещение от 1-го куспида вперёд; «−1e-9» (As ≈ куспид с погрешностью float) — это 0, а не 360
    const off = (x, c0) => { const d = norm360(x - c0); return d > 360 - 1e-6 ? d - 360 : d; };
    const mid = (a, b) => norm360(anchor + (off(a, A.cusps[0]) + off(b, B.cusps[0])) / 2);
    cusps = A.cusps.map((c, i) => mid(c, B.cusps[i]));
    asc = mid(A.asc, B.asc);   // у равнодомных/целознаковых систем As и MC — не куспиды
    mc  = mid(A.mc, B.mc);
  } else {
    const mcMid = midLon(A.mc, B.mc);
    const eps = safeCalcUt(jd, swe.SE_ECL_NUT ?? -1, 0)?.[0] ?? 23.4393;   // истинный наклон эклиптики
    const armc = norm360(Math.atan2(Math.sin(mcMid * D2R) * Math.cos(eps * D2R), Math.cos(mcMid * D2R)) / D2R);
    const h = swe.houses_armc(armc, lat, eps, houseSys);
    cusps = Array.from(h.cusps).slice(1, 13).map(norm360);
    asc = norm360(h.ascmc[0]);
    mc  = norm360(h.ascmc[1]);
  }
  planets.forEach(p => { p.house = findHouse(p.longitude, cusps); });
  return { ...base, cusps, asc, mc, noHouses: false };
}

// Карта Дэвисона: реальная карта на середину времени (по UT) и середину места.
function computeDavison(A, B, houseSys = 'P') {
  if (!A || !B) return null;
  const jd = (A.birthJD + B.birthJD) / 2;
  const g  = geoMidpoint(A.lat, A.lon, B.lat, B.lon);
  const D  = computeChartAt(jd, g.lat, g.lon, houseSys, !!(A.noHouses || B.noHouses), 0);
  D.davison = true;
  return D;
}

export { safeCalcUt, computeChartData, computeChartAt, computeComposite, computeDavison,
         midLon, geoMidpoint, findHouse, lonToRad, polar, angDiff };
