// js/timeline-calc.js — расчёты таймлайна (фаза 1+ распила).
// Чистые вычисления без DOM: транзитные периоды (медленные и быстрые),
// возвращения, события прогрессий и дирекций, раскладка дорожек (computeTlLayout).
// Разделяемое состояние (swe, tlYearScale, expandedRows, hiddenTPlants,
// moonBandCollapsed) читается из леджера js/state.js. Оркестрация и рендер
// (computeAndRenderTimeline, renderTimeline) остаются в index.html.

import { PLANETS, SIGNS, ROMAN, COLORS, T_ASPECTS, TL,
         SLOW_IDS, FAST_IDS, TL_ANGLE_ID, getTransitOrb } from './constants.js?v=3';
import { safeCalcUt, findHouse, angDiff } from './astro-core.js?v=1';
import { getSetting } from './settings.js?v=3';

// Профиль орбисов транзитов (тот же словарь, что в index.html для натала)
const ORB_PROFILES = { tight: 0.75, std: 1, wide: 1.25 };
function transitOrbFactor() { return ORB_PROFILES[getSetting('orbProfileTransit')] ?? 1; }

// Псевдо-аспект «возвращение» (☌ к собственной натальной позиции)
const RETURN_ASP = { angle: 0, color: '#cc7700', symbol: '↩', type: 'return' };

function computeProgressedEvents(natalPlanets, cusps, birthJD, jdStart, jdEnd) {
  if (!birthJD) return [];
  const flags = (swe.SEFLG_SWIEPH ?? 2) | (swe.SEFLG_SPEED ?? 256);
  const DAYS  = Math.ceil(jdEnd - jdStart) + 2;

  // Precompute progressed longitudes for every real-time day
  const progLons = new Map();
  for (const p of PLANETS) progLons.set(p.id, new Float64Array(DAYS));
  for (let i = 0; i < DAYS; i++) {
    const ageInYears   = (jdStart + i - birthJD) / 365.25;
    const progressedJD = birthJD + ageInYears;
    for (const p of PLANETS) {
      if (!progLons.has(p.id)) continue;
      const r = safeCalcUt(progressedJD, p.id, flags);
      if (!r) { progLons.delete(p.id); continue; }   // тело недоступно на эту эпоху (Хирон < 1800)
      progLons.get(p.id)[i] = ((r[0] % 360) + 360) % 360;
    }
  }

  const events = []; // { planetId, type, jd, exactJD, label, color }
  const plById = new Map(PLANETS.map(p => [p.id, p]));

  // Extrapolate the true exact date when the minimum is at the window boundary.
  // orbFn(i) returns the orb in degrees at day i.
  // bestI is the index with minimum orb found in the scan.
  const orbExact = (orbFn, bestI) => {
    if (bestI >= DAYS - 2) {
      // Orb still decreasing at end → exact date is after window
      const d1 = orbFn(DAYS - 2), d2 = orbFn(DAYS - 1);
      const rate = d2 - d1; // negative = decreasing
      if (rate < -1e-9) return jdStart + (DAYS - 1) + d2 / (-rate);
    } else if (bestI <= 1) {
      // Orb was decreasing before window → exact date is before window
      const d0 = orbFn(0), d1 = orbFn(1);
      const rate = d1 - d0; // positive = now increasing = was exact before window
      if (rate > 1e-9) return jdStart - d0 / rate;
    }
    return jdStart + bestI; // minimum inside window — no extrapolation needed
  };

  // 1. Sign changes — all planets; label: plGlyph + → + signGlyph
  for (const p of PLANETS) {
    const lons = progLons.get(p.id);
    if (!lons) continue;
    for (let i = 1; i < DAYS; i++) {
      if (Math.floor(lons[i-1] / 30) !== Math.floor(lons[i] / 30)) {
        const newSign = Math.floor(lons[i] / 30);
        events.push({ planetId: p.id, type: 'sign', jd: jdStart + i,
          label: p.glyph + '→' + SIGNS[newSign], color: '#777' });
      }
    }
  }

  // 2. House changes — all planets; label: plGlyph + → + romanNumeral
  for (const p of PLANETS) {
    const lons = progLons.get(p.id);
    if (!lons) continue;
    for (let i = 1; i < DAYS; i++) {
      const h0 = findHouse(lons[i-1], cusps);
      const h1 = findHouse(lons[i],   cusps);
      if (h0 !== h1) {
        events.push({ planetId: p.id, type: 'house', jd: jdStart + i,
          label: p.glyph + '→' + ROMAN[h1-1], color: '#2244bb' });
      }
    }
  }

  // 3. Exact aspects — Sun, Mercury, Venus, Mars only (Moon excluded)
  // State-machine scan: shows bar whenever orb < limit, even if exact date is outside window.
  // Orb: 2° if Sun (id=0) or Moon (id=1) is involved, else 1°
  const PROG_ASPECTS = [
    { angle: 0,   color: '#2244bb', symbol: '☌' },
    { angle: 60,  color: COLORS.tlSoft, symbol: '✶' },
    { angle: 90,  color: COLORS.tlHard, symbol: '□' },
    { angle: 120, color: COLORS.tlSoft, symbol: '△' },
    { angle: 180, color: COLORS.tlHard, symbol: '☍' },
  ];
  for (const pid of [0, 2, 3, 4]) {
    const pl   = plById.get(pid);
    const lons = progLons.get(pid);
    for (const na of natalPlanets) {
      const progOrb = (pid === 0 || na.id === 0 || na.id === 1) ? 2.0 : 1.0;
      for (const asp of PROG_ASPECTS) {
        let inPeriod = false, iS = 0, bestI = 0, bestD = Infinity;
        const flushPN = iE => {
          const exactJD = orbExact(j => Math.abs(angDiff(lons[j], na.longitude) - asp.angle), bestI);
          events.push({ planetId: pid, type: 'aspect', jd: jdStart + bestI, exactJD,
            startJD: jdStart + iS, endJD: jdStart + iE,
            label: pl.glyph + asp.symbol + na.glyph, color: asp.color });
          inPeriod = false; bestI = 0; bestD = Infinity;
        };
        for (let i = 0; i < DAYS; i++) {
          const d = Math.abs(angDiff(lons[i], na.longitude) - asp.angle);
          if (d < progOrb) {
            if (!inPeriod) { inPeriod = true; iS = i; }
            if (d < bestD) { bestD = d; bestI = i; }
          } else if (inPeriod) { flushPN(i - 1); }
        }
        if (inPeriod) flushPN(DAYS - 1);
      }
    }
  }

  // 4. Progressed → progressed aspects (at least one planet id ≤ 4 = fast)
  // Same state-machine: bar shown as soon as orb < 1°, even if exact date is outside window.
  const PROG_ORB_PP = 1.0;
  for (let pi = 0; pi < PLANETS.length; pi++) {
    for (let pj = pi + 1; pj < PLANETS.length; pj++) {
      const p1 = PLANETS[pi], p2 = PLANETS[pj];
      // Moon is handled separately in the moon band — exclude from here entirely
      if (p1.id === 1 || p2.id === 1) continue;
      // At least one must be a fast non-Moon planet (Sun/Mercury/Venus/Mars)
      const FAST_NO_MOON = [0, 2, 3, 4];
      if (!FAST_NO_MOON.includes(p1.id) && !FAST_NO_MOON.includes(p2.id)) continue;
      const l1 = progLons.get(p1.id), l2 = progLons.get(p2.id);
      if (!l1 || !l2) continue;
      for (const asp of PROG_ASPECTS) {
        let inPeriod = false, iS = 0, bestI = 0, bestD = Infinity;
        const flushPP = iE => {
          const exactJD = orbExact(j => Math.abs(angDiff(l1[j], l2[j]) - asp.angle), bestI);
          events.push({ type: 'aspect', jd: jdStart + bestI, exactJD,
            startJD: jdStart + iS, endJD: jdStart + iE,
            label: 'p' + p1.glyph + asp.symbol + 'p' + p2.glyph, color: asp.color });
          inPeriod = false; bestI = 0; bestD = Infinity;
        };
        for (let i = 0; i < DAYS; i++) {
          const d = Math.abs(angDiff(l1[i], l2[i]) - asp.angle);
          if (d < PROG_ORB_PP) {
            if (!inPeriod) { inPeriod = true; iS = i; }
            if (d < bestD) { bestD = d; bestI = i; }
          } else if (inPeriod) { flushPP(i - 1); }
        }
        if (inPeriod) flushPP(DAYS - 1);
      }
    }
  }

  // 5. Progressed Moon → natal planets + progressed planets (Moon band, orb 1°)
  const moonLons = progLons.get(1);
  if (moonLons) {
    // 5a. Moon → natal
    for (const na of natalPlanets) {
      for (const asp of PROG_ASPECTS) {
        let inPeriod = false, iS = 0, bestI = 0, bestD = Infinity;
        const flushMoon = iE => {
          const exactJD = orbExact(j => Math.abs(angDiff(moonLons[j], na.longitude) - asp.angle), bestI);
          events.push({ type: 'moon_aspect', jd: jdStart + bestI, exactJD,
            startJD: jdStart + iS, endJD: jdStart + iE,
            label: '☽\uFE0E' + asp.symbol + na.glyph, color: asp.color });
          inPeriod = false; bestI = 0; bestD = Infinity;
        };
        for (let i = 0; i < DAYS; i++) {
          const d = Math.abs(angDiff(moonLons[i], na.longitude) - asp.angle);
          if (d < 1.0) {
            if (!inPeriod) { inPeriod = true; iS = i; }
            if (d < bestD) { bestD = d; bestI = i; }
          } else if (inPeriod) { flushMoon(i - 1); }
        }
        if (inPeriod) flushMoon(DAYS - 1);
      }
    }

    // 5b. Moon → progressed planets (skip Moon↔Moon)
    for (const p2 of PLANETS) {
      if (p2.id === 1) continue; // skip self
      const l2 = progLons.get(p2.id);
      if (!l2) continue;
      for (const asp of PROG_ASPECTS) {
        let inPeriod = false, iS = 0, bestI = 0, bestD = Infinity;
        const flushMoonP = iE => {
          const exactJD = orbExact(j => Math.abs(angDiff(moonLons[j], l2[j]) - asp.angle), bestI);
          events.push({ type: 'moon_aspect', jd: jdStart + bestI, exactJD,
            startJD: jdStart + iS, endJD: jdStart + iE,
            label: 'p☽\uFE0E' + asp.symbol + 'p' + p2.glyph, color: asp.color });
          inPeriod = false; bestI = 0; bestD = Infinity;
        };
        for (let i = 0; i < DAYS; i++) {
          const d = Math.abs(angDiff(moonLons[i], l2[i]) - asp.angle);
          if (d < 1.0) {
            if (!inPeriod) { inPeriod = true; iS = i; }
            if (d < bestD) { bestD = d; bestI = i; }
          } else if (inPeriod) { flushMoonP(i - 1); }
        }
        if (inPeriod) flushMoonP(DAYS - 1);
      }
    }

  }

  // 6. Progressed Moon / Sun phases — every 45°; label: ☽ phaseSymbol ☉
  const moonL = progLons.get(1);
  const sunL  = progLons.get(0);
  const PHASES = [
    { angle:   0, symbol: '☌', color: '#2244bb' },
    { angle:  45, symbol: '∠', color: '#997700' },
    { angle:  90, symbol: '□', color: COLORS.tlHard },
    { angle: 135, symbol: '∠', color: '#997700' },
    { angle: 180, symbol: '☍', color: COLORS.tlHard },
    { angle: 225, symbol: '∠', color: '#997700' },
    { angle: 270, symbol: '□', color: COLORS.tlHard },
    { angle: 315, symbol: '∠', color: '#997700' },
  ];
  for (const ph of PHASES) {
    for (let i = 1; i < DAYS - 1; i++) {
      const elong = j => ((moonL[j] - sunL[j]) % 360 + 360) % 360;
      const dist  = (e, a) => { const d = Math.abs(e - a); return Math.min(d, 360 - d); };
      const d0 = dist(elong(i-1), ph.angle);
      const d1 = dist(elong(i),   ph.angle);
      const d2 = dist(elong(i+1), ph.angle);
      if (d1 < d0 && d1 < d2 && d1 < 0.6) {
        events.push({ planetId: 1, type: 'phase', jd: jdStart + i,
          label: '☽\uFE0E' + ph.symbol + '☉\uFE0E', color: ph.color });
      }
    }
  }

  return events;
}

function computeDirectionEvents(natalPlanets, natalCusps, birthJD, jdStart, jdEnd) {
  if (!birthJD || !natalCusps) return [];
  const DAYS   = Math.ceil(jdEnd - jdStart) + 2;
  const plById = new Map(PLANETS.map(p => [p.id, p]));

  const arcAt  = i => (jdStart + i - birthJD) / 365.25;
  const dirLon = (natalLon, i) => ((natalLon + arcAt(i)) % 360 + 360) % 360;

  const events = [];

  const DIR_ASP = [
    { angle: 0,   color: '#2244bb', symbol: '☌\uFE0E' },
    { angle: 60,  color: COLORS.tlSoft, symbol: '✶' },
    { angle: 90,  color: COLORS.tlHard, symbol: '□' },
    { angle: 120, color: COLORS.tlSoft, symbol: '△' },
    { angle: 180, color: COLORS.tlHard, symbol: '☍\uFE0E' },
  ];

  // 1. Aspects: all directed planets → all natal planets
  for (const dirPl of PLANETS) {
    const natalDirLon = natalPlanets.find(p => p.id === dirPl.id)?.longitude;
    if (natalDirLon == null) continue;
    for (const na of natalPlanets) {
      const natPl = plById.get(na.id);
      if (!natPl) continue;
      const orbLimit = (dirPl.id === 0 || dirPl.id === 1 || na.id === 0 || na.id === 1) ? 2.0 : 1.0;
      for (const asp of DIR_ASP) {
        for (let i = 1; i < DAYS - 1; i++) {
          const orb = j => Math.abs(angDiff(dirLon(natalDirLon, j), na.longitude) - asp.angle);
          const d0 = orb(i-1), d1 = orb(i), d2 = orb(i+1);
          if (d1 < d0 && d1 < d2 && d1 < orbLimit) {
            events.push({ type: 'dir_aspect', jd: jdStart + i,
              label: dirPl.glyph + asp.symbol + natPl.glyph, color: asp.color });
          }
        }
      }
    }
  }

  // 2. Sign changes of directed planets
  for (const p of PLANETS) {
    const natalLon = natalPlanets.find(pl => pl.id === p.id)?.longitude;
    if (natalLon == null) continue;
    for (let i = 1; i < DAYS; i++) {
      const s0 = Math.floor(dirLon(natalLon, i-1) / 30);
      const s1 = Math.floor(dirLon(natalLon, i)   / 30);
      if (s0 !== s1)
        events.push({ type: 'dir_sign', jd: jdStart + i,
          label: p.glyph + '→' + SIGNS[s1 % 12], color: '#777' });
    }
  }

  // 3. Sign changes of directed cusps — emit pairs (1/7, 2/8, … 6/12) as one event
  for (let ci = 0; ci < 6; ci++) {
    const natalCusp = natalCusps[ci];
    for (let i = 1; i < DAYS; i++) {
      const s0 = Math.floor(dirLon(natalCusp, i-1) / 30);
      const s1 = Math.floor(dirLon(natalCusp, i)   / 30);
      if (s0 !== s1) {
        const s1opp = (s1 + 6) % 12;
        events.push({ type: 'dir_cusp_sign', jd: jdStart + i,
          label: ROMAN[ci] + '/' + ROMAN[ci+6] + '→' + SIGNS[s1 % 12] + SIGNS[s1opp], color: '#555' });
      }
    }
  }

  // 4. Directed cusps ☌ natal planets
  for (let ci = 0; ci < 12; ci++) {
    const natalCusp = natalCusps[ci];
    for (const na of natalPlanets) {
      const natPl = plById.get(na.id);
      if (!natPl) continue;
      const orbLimit = (na.id === 0 || na.id === 1) ? 2.0 : 1.0;
      for (let i = 1; i < DAYS - 1; i++) {
        const orb = j => Math.abs(angDiff(dirLon(natalCusp, j), na.longitude));
        const d0 = orb(i-1), d1 = orb(i), d2 = orb(i+1);
        if (d1 < d0 && d1 < d2 && d1 < orbLimit)
          events.push({ type: 'dir_cusp_planet', jd: jdStart + i,
            label: ROMAN[ci] + '☌\uFE0E' + natPl.glyph, color: '#2244bb' });
      }
    }
  }

  // 5. Directed planets ☌ natal cusps
  for (const dirPl of PLANETS) {
    const natalDirLon = natalPlanets.find(p => p.id === dirPl.id)?.longitude;
    if (natalDirLon == null) continue;
    const orbLimit = (dirPl.id === 0 || dirPl.id === 1) ? 2.0 : 1.0;
    for (let ci = 0; ci < 12; ci++) {
      const natCusp = natalCusps[ci];
      for (let i = 1; i < DAYS - 1; i++) {
        const orb = j => Math.abs(angDiff(dirLon(natalDirLon, j), natCusp));
        const d0 = orb(i-1), d1 = orb(i), d2 = orb(i+1);
        if (d1 < d0 && d1 < d2 && d1 < orbLimit)
          events.push({ type: 'dir_planet_cusp', jd: jdStart + i,
            label: dirPl.glyph + '☌\uFE0E' + ROMAN[ci], color: '#8833bb' });
      }
    }
  }

  return events;
}

function computeTransits(natalPlanets, jdWindowStart, jdWindowEnd, angleTargets = []) {
  const now     = new Date();
  const jdToday = swe.julday(now.getUTCFullYear(), now.getUTCMonth() + 1,
    now.getUTCDate(), now.getUTCHours() + now.getUTCMinutes() / 60);
  const jdStart = jdWindowStart ?? jdToday - 182;
  const jdEnd   = jdWindowEnd   ?? jdToday + 183;
  const flags   = (swe.SEFLG_SWIEPH ?? 2) | (swe.SEFLG_SPEED ?? 256);
  const DAYS    = Math.ceil(jdEnd - jdStart) + 2;

  // Mars is timeline-worthy only against angular cusps (fast elsewhere)
  // Тела, недоступные на эту эпоху (Хирон < 1800), отбрасываем целиком.
  const transitIds = (angleTargets.length ? [...SLOW_IDS, 4] : SLOW_IDS)
    .filter(id => safeCalcUt(jdStart, id, flags));

  // Precompute slow planet longitudes for every day
  const slowLons = {};
  for (const id of transitIds) {
    slowLons[id] = new Float64Array(DAYS);
    for (let i = 0; i < DAYS; i++) {
      const r = safeCalcUt(jdStart + i, id, flags);
      slowLons[id][i] = r ? (((r[0] % 360) + 360) % 360) : slowLons[id][i - 1] ?? 0;
    }
  }

  // Find retrograde/direct station days between two exact aspect dates
  const stationsBetween = (lons, jd1, jd2) => {
    const d1 = Math.max(1, Math.round(jd1 - jdStart));
    const d2 = Math.min(DAYS - 2, Math.round(jd2 - jdStart));
    const result = [];
    for (let d = d1 + 1; d < d2; d++) {
      const sp = ((lons[d]   - lons[d-1] + 540) % 360) - 180;
      const sn = ((lons[d+1] - lons[d]   + 540) % 360) - 180;
      if (sp !== 0 && sn !== 0 && sp * sn < 0)
        result.push({ jd: jdStart + d, type: sn > 0 ? 'D' : 'R' });
    }
    return result;
  };

  const periods = [];

  for (const id of transitIds) {
    const tPlanet  = PLANETS.find(p => p.id === id);
    const lons     = slowLons[id];
    const orbLimit = getTransitOrb(id) * transitOrbFactor();
    const targets  = id === 4 ? angleTargets : [...natalPlanets, ...angleTargets];

    for (const na of targets) {
      // Angular cusps and Node / Lilith (transiting OR natal) → only conjunctions
      const aspects = (na.isAngle || id === 10 || id === 12 || na.id === 10 || na.id === 12)
        ? T_ASPECTS.filter(a => a.angle === 0)
        : T_ASPECTS;
      for (const asp of aspects) {
        let inPeriod = false, pStart = 0;
        let prevDiff = Infinity, wasDecreasing = false;
        let curMinDay = -1, curMinDiff = Infinity;
        let localMinima = [];   // { day, diff } collected within current period

        const closePeriod = (endIdx) => {
          // flush last pending local minimum
          if (wasDecreasing && curMinDay >= 0)
            localMinima.push({ day: curMinDay, diff: curMinDiff });
          const exactJDs = refineExactAspects(localMinima, id, na.longitude, asp.angle, jdStart, flags);
          const stations = [];
          if (exactJDs.length > 1)
            for (let ei = 0; ei < exactJDs.length - 1; ei++)
              stations.push(...stationsBetween(lons, exactJDs[ei], exactJDs[ei + 1]));
          periods.push({ tPlanet, na, asp,
            startJD: jdStart + pStart, endJD: jdStart + endIdx, exactJDs, stations });
          inPeriod = false; prevDiff = Infinity; wasDecreasing = false;
          curMinDay = -1; curMinDiff = Infinity; localMinima = [];
        };

        for (let i = 0; i < DAYS; i++) {
          const diff = Math.abs(angDiff(lons[i], na.longitude) - asp.angle);
          if (diff <= orbLimit) {
            if (!inPeriod) {
              inPeriod = true; pStart = i;
              prevDiff = diff; wasDecreasing = false;
              curMinDay = i; curMinDiff = diff;
            } else {
              if (diff < prevDiff) {
                wasDecreasing = true;
                curMinDay = i; curMinDiff = diff;
              } else if (diff > prevDiff + 0.005 && wasDecreasing) {
                // local minimum was at curMinDay
                localMinima.push({ day: curMinDay, diff: curMinDiff });
                wasDecreasing = false;
              }
              prevDiff = diff;
            }
          } else if (inPeriod) {
            closePeriod(i - 1);
          }
        }
        if (inPeriod) closePeriod(DAYS - 1);
      }
    }
  }

  return { periods, jdStart, jdEnd, jdToday };
}

// Refine each daily local minimum to sub-day precision and filter non-perfecting aspects.
// Returns array of Julian Dates where the aspect truly perfects (diff < EXACT_THRESH).
function refineExactAspects(localMinima, planetId, natalLon, aspAngle, jdStart, flags) {
  const EXACT_THRESH = 0.1;  // 6 arc-minutes — aspect must reach within this to be "exact"
  // Pre-filter: daily step is 1 day; Jupiter moves ~0.3°/day so the daily minimum can
  // be up to ~0.15° away from the true closest approach. Use 0.5° as a loose gate so we
  // always run the hourly refinement scan for anything that got close, and rely on the
  // post-scan EXACT_THRESH check to reject truly non-perfecting aspects.
  const REFINE_GATE = 0.5;
  const exactJDs = [];
  for (const { day, diff } of localMinima) {
    if (diff > REFINE_GATE) continue;  // too far even after hourly refinement
    // Hourly scan ±1 day around the minimum to find true closest approach
    const jdCenter = jdStart + day;
    let minD = Infinity, minJD = jdCenter;
    for (let h = -24; h <= 24; h++) {
      const jd  = jdCenter + h / 24;
      const r   = swe.calc_ut(jd, planetId, flags);
      const lon = ((r[0] % 360) + 360) % 360;
      const d   = Math.abs(angDiff(lon, natalLon) - aspAngle);
      if (d < minD) { minD = d; minJD = jd; }
    }
    if (minD < EXACT_THRESH) exactJDs.push(minJD);
  }
  return exactJDs;
}

// Compute transits of fast planets (Sun/Mercury/Venus/Mars) to one natal planet.
// Uses same algorithm as computeTransits but for FAST_IDS and a single natal planet.
function computeFastTransits(natalPlanet, jdStart, jdEnd) {
  const flags  = (swe.SEFLG_SWIEPH ?? 2) | (swe.SEFLG_SPEED ?? 256);
  const DAYS   = Math.ceil(jdEnd - jdStart) + 2;
  const periods = [];

  // Node/Lilith natal → conjunctions only; otherwise all T_ASPECTS
  const aspects = (natalPlanet.id === 10 || natalPlanet.id === 12)
    ? T_ASPECTS.filter(a => a.angle === 0)
    : T_ASPECTS;

  for (const id of FAST_IDS) {
    const tPlanet  = PLANETS.find(p => p.id === id);
    const orbLimit = getTransitOrb(id) * transitOrbFactor();
    const lons     = new Float64Array(DAYS);
    for (let i = 0; i < DAYS; i++) {
      const r = swe.calc_ut(jdStart + i, id, flags);
      lons[i] = ((r[0] % 360) + 360) % 360;
    }

    for (const asp of aspects) {
      let inPeriod = false, pStart = 0;
      let prevDiff = Infinity, wasDecreasing = false;
      let curMinDay = -1, curMinDiff = Infinity;
      let localMinima = [];

      const closePeriod = (endIdx) => {
        if (wasDecreasing && curMinDay >= 0)
          localMinima.push({ day: curMinDay, diff: curMinDiff });
        const exactJDs = refineExactAspects(localMinima, id, natalPlanet.longitude, asp.angle, jdStart, flags);
        periods.push({ tPlanet, na: natalPlanet, asp,
          startJD: jdStart + pStart, endJD: jdStart + endIdx, exactJDs });
        inPeriod = false; prevDiff = Infinity; wasDecreasing = false;
        curMinDay = -1; curMinDiff = Infinity; localMinima = [];
      };

      for (let i = 0; i < DAYS; i++) {
        const diff = Math.abs(angDiff(lons[i], natalPlanet.longitude) - asp.angle);
        if (diff <= orbLimit) {
          if (!inPeriod) {
            inPeriod = true; pStart = i;
            prevDiff = diff; wasDecreasing = false;
            curMinDay = i; curMinDiff = diff;
          } else {
            if (diff < prevDiff) {
              wasDecreasing = true; curMinDay = i; curMinDiff = diff;
            } else if (diff > prevDiff + 0.005 && wasDecreasing) {
              localMinima.push({ day: curMinDay, diff: curMinDiff });
              wasDecreasing = false;
            }
            prevDiff = diff;
          }
        } else if (inPeriod) {
          closePeriod(i - 1);
        }
      }
      if (inPeriod) closePeriod(DAYS - 1);
    }
  }
  return periods;
}

function computeReturnPeriods(natalPlanets, jdStart, jdEnd) {
  const flags  = (swe.SEFLG_SWIEPH ?? 2) | (swe.SEFLG_SPEED ?? 256);
  const DAYS   = Math.ceil(jdEnd - jdStart) + 2;
  const ORB    = 1.0;
  const periods = [];

  for (const id of FAST_IDS) {
    const natalPl = natalPlanets.find(p => p.id === id);
    if (!natalPl) continue;
    const tPlanet = PLANETS.find(p => p.id === id);
    const lons    = new Float64Array(DAYS);
    for (let i = 0; i < DAYS; i++) {
      const r = swe.calc_ut(jdStart + i, id, flags);
      lons[i] = ((r[0] % 360) + 360) % 360;
    }

    let inPeriod = false, pStart = 0;
    let prevDiff = Infinity, wasDecreasing = false;
    let curMinDay = -1, curMinDiff = Infinity;
    let localMinima = [];

    const closePeriod = endIdx => {
      if (wasDecreasing && curMinDay >= 0)
        localMinima.push({ day: curMinDay, diff: curMinDiff });
      if (localMinima.length) {
        // Fast planets move ~1°/day so daily minimum may be 0.3-0.7° — too large for
        // refineExactAspects (EXACT_THRESH=0.1°). Use our own hourly scan instead.
        const best = localMinima.reduce((a, b) => a.diff < b.diff ? a : b);
        let minD = Infinity, minJD = jdStart + best.day;
        for (let h = -24; h <= 24; h++) {
          const jd  = jdStart + best.day + h / 24;
          const r   = swe.calc_ut(jd, id, flags);
          const lon = ((r[0] % 360) + 360) % 360;
          const d   = Math.abs(angDiff(lon, natalPl.longitude));
          if (d < minD) { minD = d; minJD = jd; }
        }
        if (minD < 0.5) // planet genuinely returns to within 0.5° of natal
          periods.push({ tPlanet, na: natalPl, asp: RETURN_ASP,
            startJD: jdStart + pStart, endJD: jdStart + endIdx, exactJDs: [minJD] });
      }
      inPeriod = false; prevDiff = Infinity; wasDecreasing = false;
      curMinDay = -1; curMinDiff = Infinity; localMinima = [];
    };

    for (let i = 0; i < DAYS; i++) {
      const diff = Math.abs(angDiff(lons[i], natalPl.longitude));
      if (diff <= ORB) {
        if (!inPeriod) {
          inPeriod = true; pStart = i;
          prevDiff = diff; wasDecreasing = false;
          curMinDay = i; curMinDiff = diff;
        } else {
          if (diff < prevDiff) { wasDecreasing = true; curMinDay = i; curMinDiff = diff; }
          else if (diff > prevDiff + 0.005 && wasDecreasing) {
            localMinima.push({ day: curMinDay, diff: curMinDiff });
            wasDecreasing = false;
          }
          prevDiff = diff;
        }
      } else if (inPeriod) { closePeriod(i - 1); }
    }
    if (inPeriod) closePeriod(DAYS - 1);
  }
  return periods;
}

// ── computeTlLayout ───────────────────────────────────────────────────────────
// Pure layout computation: distributes periods into rows/lanes and calculates
// section heights. Returns layout data used by renderTimeline.
function computeTlLayout(periods, progEvents, dirEvents) {
  const { HDR_H, SUB_H } = TL;

  // ── Filter and group transit periods by natal planet ────────────────────
  const byNatal = {};
  for (const p of periods) {
    if (!p.exactJDs?.length) continue;
    if (hiddenTPlants.has(p.tPlanet.id)) continue;
    if (tlYearScale && p.asp.type === 'return' && [0,2,3,4].includes(p.tPlanet.id)) continue;
    if (tlYearScale && p.na.isAngle && p.tPlanet.id === 4) continue;
    (byNatal[p.na.id] ??= []).push(p);
  }

  // Series-aware bin packing: all periods of same (planet+aspect) stay on same lane,
  // but different series share a lane when their intervals don't overlap.
  const packSeries = (ps, gap = 1) => {
    const seriesMap = new Map();
    for (const p of ps) {
      const key = `${p.tPlanet.id}-${p.asp.angle}`;
      if (!seriesMap.has(key)) seriesMap.set(key, []);
      seriesMap.get(key).push(p);
    }
    const seriesList = [...seriesMap.values()]
      .sort((a, b) => Math.min(...a.map(p => p.startJD)) - Math.min(...b.map(p => p.startJD)));
    // laneIntervals[lane] = [{start, end}, ...]
    const laneIntervals = [];
    for (const seriesPs of seriesList) {
      let placed = false;
      for (let lane = 0; lane < laneIntervals.length; lane++) {
        const hasConflict = seriesPs.some(p =>
          laneIntervals[lane].some(iv => p.startJD <= iv.end + gap && p.endJD >= iv.start - gap)
        );
        if (!hasConflict) {
          for (const p of seriesPs) { p.sub = lane; }
          for (const p of seriesPs) laneIntervals[lane].push({ start: p.startJD, end: p.endJD });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const lane = laneIntervals.length;
        laneIntervals.push(seriesPs.map(p => ({ start: p.startJD, end: p.endJD })));
        for (const p of seriesPs) p.sub = lane;
      }
    }
    return { ps, nSubs: Math.max(laneIntervals.length, 1) };
  };

  // Greedy lane packing: reuse a lane as soon as the previous transit ended + gap days
  const packRows = (ps, gap = 1) => {
    const sorted = [...ps].sort((a, b) => a.startJD - b.startJD);
    const laneEnds = [];
    for (const p of sorted) {
      let placed = false;
      for (let s = 0; s < laneEnds.length; s++) {
        if (p.startJD > laneEnds[s] + gap) { p.sub = s; laneEnds[s] = p.endJD; placed = true; break; }
      }
      if (!placed) { p.sub = laneEnds.length; laneEnds.push(p.endJD); }
    }
    return { ps: sorted, nSubs: Math.max(laneEnds.length, 1) };
  };

  // ── Transit rows (one section per natal planet that has transits) ────────
  // Angular cusp row (As/Ic/Ds/Mc conjunctions) goes last
  const rowSrc = byNatal[TL_ANGLE_ID]?.length
    ? [...PLANETS, { id: TL_ANGLE_ID, glyph: 'As' }]
    : PLANETS;
  const rows = rowSrc
    .filter(pl => byNatal[pl.id]?.length)
    .map(pl => {
      const { ps, nSubs } = packSeries(byNatal[pl.id], tlYearScale ? 7 : 1);
      const slowH = nSubs * SUB_H + 20;
      const isExpanded = pl.id !== TL_ANGLE_ID && expandedRows.has(pl.id);
      let fastPs = [], fastNSubs = 0, fastH = 0;
      if (isExpanded) {
        const cached = fastCache[pl.id];
        if (cached) {
          const fp = packRows(cached);
          fastPs = fp.ps; fastNSubs = fp.nSubs;
          fastH = fastNSubs * SUB_H + 20;
        } else {
          fastH = 22;
        }
      }
      return { pl, natalPl: byNatal[pl.id][0].na,
               ps, nSubs, slowH, fastPs, fastNSubs, fastH, isExpanded,
               h: slowH + fastH };
    });

  // ── Progressed events layout ─────────────────────────────────────────────
  const progAspects  = progEvents.filter(e => e.type === 'aspect');
  const progMoonAsps = progEvents.filter(e => e.type === 'moon_aspect');
  const progPoints   = progEvents.filter(e => e.type !== 'aspect' && e.type !== 'moon_aspect');

  const greedyPack = arr => {
    const sorted = [...arr].sort((a, b) => a.startJD - b.startJD);
    const ends = [];
    for (const p of sorted) {
      let placed = false;
      for (let s = 0; s < ends.length; s++) {
        if (p.startJD > ends[s] + 1) { p.sub = s; ends[s] = p.endJD; placed = true; break; }
      }
      if (!placed) { p.sub = ends.length; ends.push(p.endJD); }
    }
    return sorted.length ? Math.max(...sorted.map(p => p.sub + 1)) : 0;
  };

  const nProgAspSubs     = greedyPack(progAspects);
  const nMoonAspSubs     = greedyPack(progMoonAsps);
  const PROG_ASP_H       = nProgAspSubs > 0 ? nProgAspSubs * SUB_H + 10 : 0;
  const PROG_MOON_FULL_H = nMoonAspSubs > 0 ? nMoonAspSubs * SUB_H + 10 : 0;
  const PROG_MOON_H      = PROG_MOON_FULL_H > 0 ? (moonBandCollapsed ? 16 : PROG_MOON_FULL_H) : 0;
  const PROG_TICK_H      = progPoints.length > 0 ? 28 : 0;
  const PROG_SECTION_H   = PROG_ASP_H + PROG_MOON_H + PROG_TICK_H;
  const DIR_TICK_H       = dirEvents.length > 0 ? 48 : 0;

  // Assign y-positions to each transit row
  let y = HDR_H + PROG_SECTION_H + DIR_TICK_H;
  for (const r of rows) { r.y = y; y += r.h; }
  const TL_H = y + 4;

  return {
    rows, TL_H,
    progAspects, progMoonAsps, progPoints,
    PROG_ASP_H, PROG_MOON_H, PROG_TICK_H, PROG_SECTION_H,
    DIR_TICK_H,
    moonBandY: HDR_H + PROG_ASP_H,
  };
}

export { computeTransits, computeFastTransits, computeReturnPeriods,
         computeProgressedEvents, computeDirectionEvents, computeTlLayout,
         transitOrbFactor };
