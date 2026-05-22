# Chart Rendering Code

## Одиночная натальная карта — `renderChart`

`index.html:1364`

```js
function renderChart(planets, cusps, asc, mc) {
  const svg = el('svg', { viewBox: VIEWBOX, width: '100%', style: 'display:block' });

  // Clip group
  const clipRect = el('rect', { width: W, height: H });
  const clipPath = el('clipPath', { id: 'canvasClip' });
  clipPath.appendChild(clipRect);
  const defs = el('defs');
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const g = el('g', { 'clip-path': 'url(#canvasClip)' });
  svg.appendChild(g);

  // 1. Background
  g.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));

  // 2. House axes — drawn behind ring, extend beyond it
  drawHouseAxes(g, cusps, 0);

  // 3. Zodiac ring
  g.appendChild(circ(CX, CY, R_RING, {
    fill: 'none', stroke: '#808080', 'stroke-width': RING_W,
  }));

  // 4. Sign dividers fixed from 0° Aries
  drawSignDividers(g, 0);

  // 5. Sign glyphs
  drawZodiacGlyphs(g, 0);

  // 6. Inner circle
  g.appendChild(circ(CX, CY, R_INNER, {
    fill: '#fff', stroke: '#000', 'stroke-width': 1.5,
  }));

  // 7. Aspects (include South Node)
  const planetsWithSN = addSouthNode(planets, cusps);
  drawAspects(g, planetsWithSN, 0);

  // 8. Planets (include South Node)
  drawPlanets(g, planetsWithSN, 0);

  // 10. Cusp labels
  drawHouseLabels(g, cusps, 0);

  document.getElementById('chart-wrap').replaceChildren(svg);
}
```

---

## Вспомогательные функции рисования

### `drawHouseAxes` — оси домов

`index.html:1419`

```js
function drawHouseAxes(g, cusps, asc, biwheel = false) {
  for (let i = 0; i < 6; i++) {
    const isAng = (i === 0 || i === 3);
    const a1 = lonToRad(cusps[i],     asc);
    const a2 = lonToRad(cusps[i + 6], asc);
    const attrs = { stroke: '#000', 'stroke-width': isAng ? 2 : 1 };
    if (biwheel) {
      // Inner segment: from R_DIVIDER through center to R_DIVIDER (center covered by white fill)
      const i1 = polar(a1, R_DIVIDER), i2 = polar(a2, R_DIVIDER);
      g.appendChild(ln(i1.x, i1.y, i2.x, i2.y, attrs));
      // Outer segments: short stubs outside zodiac ring (for label area only)
      const o1a = polar(a1, R_ZOD_OUT), o1b = polar(a1, R_LABEL);
      const o2a = polar(a2, R_ZOD_OUT), o2b = polar(a2, R_LABEL);
      g.appendChild(ln(o1a.x, o1a.y, o1b.x, o1b.y, attrs));
      g.appendChild(ln(o2a.x, o2a.y, o2b.x, o2b.y, attrs));
    } else {
      const p1 = polar(a1, R_LABEL), p2 = polar(a2, R_LABEL);
      g.appendChild(ln(p1.x, p1.y, p2.x, p2.y, attrs));
    }
  }
}
```

### `drawSignDividers` — разделители знаков

`index.html:1445`

```js
function drawSignDividers(g, asc) {
  for (let i = 0; i < 12; i++) {
    const a  = lonToRad(i * 30, asc);
    const p1 = polar(a, 390);
    const p2 = { x: 2 * CX - p1.x, y: 2 * CY - p1.y }; // diametrically opposite
    g.appendChild(ln(p1.x, p1.y, p2.x, p2.y, {
      stroke: '#fff', 'stroke-width': 1.5,
    }));
  }
}
```

### `drawZodiacGlyphs` — глифы знаков

`index.html:1458`

```js
function drawZodiacGlyphs(g, asc) {
  for (let i = 0; i < 12; i++) {
    const a = lonToRad(i * 30 + 15, asc);
    const p = polar(a, R_RING); // centre of ring strip
    g.appendChild(txt(p.x, p.y, SIGNS[i], {
      'font-size': 14, fill: '#fff',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
    }));
  }
}
```

### `drawHouseLabels` — подписи домов

`index.html:1475`

```js
function drawHouseLabels(g, cusps, asc) {
  cusps.forEach((cusp, i) => {
    const a    = lonToRad(cusp + 5, asc);   // +5 degrees offset past cusp line
    const p    = polar(a, R_LABEL);
    const deg  = Math.floor(cusp % 30);
    const name = ANGULAR[i] ?? ROMAN[i];
    const isAng = ANGULAR[i] !== undefined;
    const tipText = `${ROMAN[i]} дом${isAng ? `  ${ANGULAR_NAMES[i]}` : ''}  ${fmtLon(cusp)}`;

    const labelEl = lblSup(p.x, p.y, name, deg, {
      'font-size': isAng ? 13 : 11,
      fill: isAng ? '#111' : '#555',
      'font-weight': isAng ? 'bold' : 'normal',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      style: 'cursor:default',
    });
    labelEl.addEventListener('mouseover', e => showChartTip(tipText, e));
    labelEl.addEventListener('mousemove', moveChartTip);
    labelEl.addEventListener('mouseout', hideChartTip);
    g.appendChild(labelEl);
  });
}
```

### `drawAspects` — аспекты натальной карты

`index.html:1502`

```js
function drawAspects(g, planets, asc) {
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      // Skip trivial N.Node ↔ S.Node opposition (always exact by definition)
      const ids = [planets[i].id, planets[j].id];
      if (ids.includes(10) && ids.includes(-10)) continue;
      const diff = angDiff(planets[i].longitude, planets[j].longitude);
      for (const asp of ASPECTS) {
        const orb = getNatalOrb(asp, planets[i].id, planets[j].id);
        const actualOrb = Math.abs(diff - asp.angle);
        if (actualOrb <= orb) {
          const tipText = `${planets[i].glyph} ${asp.name} ${planets[j].glyph}  ${fmtOrb(actualOrb)}`;
          if (asp.type === 'conj') {
            // Small ellipse on the inner circle boundary, under the planets
            let l1 = planets[i].longitude, l2 = planets[j].longitude;
            if (Math.abs(l1 - l2) > 180) { if (l1 < l2) l1 += 360; else l2 += 360; }
            const midLon = ((l1 + l2) / 2) % 360;
            const midA = lonToRad(midLon, asc);
            const center = polar(midA, R_INNER);
            const spanRad = diff * Math.PI / 180;
            const rx = Math.max(10, spanRad * R_INNER / 2 + 8);
            const rotDeg = midA * 180 / Math.PI + 90;
            const ellipseEl = el('ellipse', {
              cx: center.x, cy: center.y, rx, ry: 6,
              transform: `rotate(${rotDeg}, ${center.x}, ${center.y})`,
              fill: 'none', stroke: asp.color, 'stroke-width': 1.5, style: 'cursor:default',
            });
            ellipseEl.addEventListener('mouseover', e => showChartTip(tipText, e));
            ellipseEl.addEventListener('mousemove', moveChartTip);
            ellipseEl.addEventListener('mouseout', hideChartTip);
            g.appendChild(ellipseEl);
          } else {
            const pi = polar(lonToRad(planets[i].longitude, asc), R_INNER);
            const pj = polar(lonToRad(planets[j].longitude, asc), R_INNER);
            const attrs = { stroke: asp.color, 'stroke-width': asp.width, opacity: '1' };
            if (asp.dash) attrs['stroke-dasharray'] = asp.dash;
            g.appendChild(ln(pi.x, pi.y, pj.x, pj.y, attrs));
            // Invisible wider hit area for easier hover
            const hitLine = ln(pi.x, pi.y, pj.x, pj.y, { stroke: 'transparent', 'stroke-width': 8, style: 'cursor:default' });
            hitLine.addEventListener('mouseover', e => showChartTip(tipText, e));
            hitLine.addEventListener('mousemove', moveChartTip);
            hitLine.addEventListener('mouseout', hideChartTip);
            g.appendChild(hitLine);
            const mid = { x: (pi.x + pj.x) / 2, y: (pi.y + pj.y) / 2 };
            g.appendChild(txt(mid.x, mid.y, asp.symbol, {
              'font-size': 9, fill: asp.color,
              'text-anchor': 'middle', 'dominant-baseline': 'central',
            }));
          }
          break;
        }
      }
    }
  }
}
```

---

## Планеты — `drawPlanets`

`index.html:1560`

```js
function drawPlanets(g, planets, asc) {
  const GLYPH_R  = 230;
  const THR_RAD  = 0.18;  // ~10° cluster threshold
  const STEP_PX  = 22;

  const items = planets
    .map(p => ({ ...p, dotAngle: lonToRad(p.longitude, asc) }))
    .sort((a, b) => a.dotAngle - b.dotAngle);

  // Кластеризация: если две планеты ближе ~10° — в один кластер
  const clusters = [];
  let current = [items[0]];
  for (let i = 1; i < items.length; i++) {
    let da = Math.abs(items[i].dotAngle - items[i - 1].dotAngle);
    da = Math.min(da, Math.PI * 2 - da);
    if (da < THR_RAD) current.push(items[i]);
    else { clusters.push(current); current = [items[i]]; }
  }
  clusters.push(current);

  // Разводим глифы кластера равномерно вокруг центра
  const stepRad = STEP_PX / GLYPH_R;
  const labeled = [];
  for (const cluster of clusters) {
    const centerAngle = cluster.reduce((s, p) => s + p.dotAngle, 0) / cluster.length;
    const startAngle  = centerAngle - stepRad * (cluster.length - 1) / 2;
    cluster.forEach((p, i) => labeled.push({
      ...p,
      labelAngle: startAngle + i * stepRad,
      inCluster: cluster.length > 1,
    }));
  }

  // 1. Dots at exact positions on R_INNER
  labeled.forEach(p => {
    const dot = polar(p.dotAngle, R_INNER);
    g.appendChild(circ(dot.x, dot.y, 2.5, {
      fill: '#c6c300', stroke: '#000', 'stroke-width': 0.6,
    }));
  });

  // 2. Leader lines for clusters only
  labeled.forEach(p => {
    if (!p.inCluster) return;
    const dot = polar(p.dotAngle,   R_INNER + 3);
    const lbl = polar(p.labelAngle, GLYPH_R - 14);
    g.appendChild(ln(dot.x, dot.y, lbl.x, lbl.y, {
      stroke: '#aaa', 'stroke-width': 0.6, 'stroke-dasharray': '2,2.5',
    }));
  });

  // 3. Glyphs at spread positions
  labeled.forEach(p => {
    const pos = polar(p.labelAngle, GLYPH_R);
    const deg = Math.floor(p.longitude % 30);
    const tipText = `${p.glyph} ${p.name}  ${fmtLon(p.longitude)}${p.house ? `  Дом ${ROMAN[p.house - 1]}` : ''}${p.retrograde ? '  R' : ''}`;
    const t = el('text', {
      x: pos.x, y: pos.y,
      'font-size': 24, fill: '#111',
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      style: 'cursor:default',
    });
    t.appendChild(el('tspan', {}, p.glyph));
    t.appendChild(el('tspan', { dy: '-7', 'font-size': '10', fill: '#555' }, String(deg)));
    t.addEventListener('mouseover', e => showChartTip(tipText, e));
    t.addEventListener('mousemove', moveChartTip);
    t.addEventListener('mouseout', hideChartTip);
    g.appendChild(t);
    if (p.retrograde) {
      g.appendChild(txt(pos.x + 11, pos.y + 4, 'R', {
        'font-size': 8, fill: '#bb1111', 'font-style': 'italic',
      }));
    }
  });
}
```

---

## Двойная карта (биколесо) — `renderBiwheel`

`index.html:2199`

```js
function renderBiwheel(natal, transit, cusps, asc) {
  const svg = el('svg', { viewBox: VIEWBOX, width: '100%', style: 'display:block' });

  const clipRect = el('rect', { width: W, height: H });
  const clipPath = el('clipPath', { id: 'canvasClip' });
  clipPath.appendChild(clipRect);
  const defs = el('defs');
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const g = el('g', { 'clip-path': 'url(#canvasClip)' });
  svg.appendChild(g);

  // 1. Background
  g.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));

  // 2. House axes — clipped to natal ring + outer label area
  drawHouseAxes(g, cusps, 0, true);

  // 3. Zodiac ring
  g.appendChild(circ(CX, CY, R_RING, {
    fill: 'none', stroke: '#808080', 'stroke-width': RING_W,
  }));

  // 4. Sign dividers + glyphs — fixed from 0° Aries
  drawSignDividers(g, 0);
  drawZodiacGlyphs(g, 0);

  // 5. Divider circle between transit / natal rings (r=196)
  g.appendChild(circ(CX, CY, R_DIVIDER, {
    fill: 'none', stroke: '#aaa', 'stroke-width': 0.8,
  }));

  // 6. Inner circle — smaller in biwheel (r=128)
  g.appendChild(circ(CX, CY, R_BW_INNER, {
    fill: '#fff', stroke: '#000', 'stroke-width': 1.5,
  }));

  // 7. Transit → natal aspect lines (include South Nodes)
  drawTransitAspects(g, addSouthNode(natal, cusps), addSouthNode(transit), 0);

  // 8. Natal planets (inner ring): rDot=R_BW_INNER(128), rGlyph=R_N_PLANET(160)
  drawBiwheelPlanets(g, addSouthNode(natal, cusps), 0, R_BW_INNER, R_N_PLANET);

  // 9. Transit planets (outer ring): rDot=R_DIVIDER(196), rGlyph=R_T_PLANET(230)
  drawBiwheelPlanets(g, addSouthNode(transit),      0, R_DIVIDER,  R_T_PLANET);

  // 10. House labels outside ring
  drawHouseLabels(g, cusps, 0);

  document.getElementById('chart-wrap').replaceChildren(svg);
}
```

---

## Планеты биколеса — `drawBiwheelPlanets`

`index.html:2252`

Универсальная функция для обоих колец. Натальные: `rDot=128, rGlyph=160`. Транзитные: `rDot=196, rGlyph=230`.

```js
function drawBiwheelPlanets(g, planets, asc, rDot, rGlyph, dotColor = '#9aaa00', glyphColor = '#111') {
  const THR_RAD = 0.18;   // ~10° cluster threshold
  const STEP_PX = 18;

  const items = planets
    .map(p => ({ ...p, dotAngle: lonToRad(p.longitude, asc) }))
    .sort((a, b) => a.dotAngle - b.dotAngle);

  const clusters = [];
  let current = [items[0]];
  for (let i = 1; i < items.length; i++) {
    let da = Math.abs(items[i].dotAngle - items[i - 1].dotAngle);
    da = Math.min(da, Math.PI * 2 - da);
    if (da < THR_RAD) current.push(items[i]);
    else { clusters.push(current); current = [items[i]]; }
  }
  clusters.push(current);

  const stepRad = STEP_PX / rGlyph;
  const labeled = [];
  for (const cluster of clusters) {
    const centerAngle = cluster.reduce((s, p) => s + p.dotAngle, 0) / cluster.length;
    const startAngle  = centerAngle - stepRad * (cluster.length - 1) / 2;
    cluster.forEach((p, i) => labeled.push({
      ...p,
      labelAngle: startAngle + i * stepRad,
      inCluster: cluster.length > 1,
    }));
  }

  // Direction: outward if glyph radius > dot radius, inward otherwise
  const outward = rGlyph > rDot;

  // 1. Dots at exact positions on rDot
  labeled.forEach(p => {
    const dot = polar(p.dotAngle, rDot);
    g.appendChild(circ(dot.x, dot.y, 2, {
      fill: dotColor, stroke: 'none',
    }));
  });

  // 2. Leader lines for clusters only
  labeled.forEach(p => {
    if (!p.inCluster) return;
    const dot = polar(p.dotAngle,   rDot   + (outward ? 3 : -3));
    const lbl = polar(p.labelAngle, rGlyph + (outward ? -11 : 11));
    g.appendChild(ln(dot.x, dot.y, lbl.x, lbl.y, {
      stroke: '#aaa', 'stroke-width': 0.5, 'stroke-dasharray': '2,2.5',
    }));
  });

  // 3. Glyphs at spread positions
  labeled.forEach(p => {
    const pos = polar(p.labelAngle, rGlyph);
    const deg = Math.floor(p.longitude % 30);
    const tipText = `${p.glyph} ${p.name}  ${fmtLon(p.longitude)}${p.house ? `  Дом ${ROMAN[p.house - 1]}` : ''}${p.retrograde ? '  R' : ''}`;
    const t = el('text', {
      x: pos.x, y: pos.y,
      'font-size': 19, fill: glyphColor,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      style: 'cursor:default',
    });
    t.appendChild(el('tspan', {}, p.glyph));
    t.appendChild(el('tspan', { dy: '-6', 'font-size': '9', fill: glyphColor === '#111' ? '#555' : glyphColor }, String(deg)));
    t.addEventListener('mouseover', e => showChartTip(tipText, e));
    t.addEventListener('mousemove', moveChartTip);
    t.addEventListener('mouseout', hideChartTip);
    g.appendChild(t);
    if (p.retrograde) {
      g.appendChild(txt(pos.x + 9, pos.y + 3, 'R', {
        'font-size': 7, fill: '#bb1111', 'font-style': 'italic',
      }));
    }
  });
}
```

---

## Аспекты биколеса — `drawTransitAspects`

`index.html:2328`

```js
function drawTransitAspects(g, natal, transit, asc) {
  for (const tr of transit) {
    const orb = getTransitOrb(tr.id);   // per-planet transit orb
    for (const na of natal) {
      // Skip trivial N.Node ↔ S.Node opposition
      if ((tr.id === 10 && na.id === -10) || (tr.id === -10 && na.id === 10)) continue;
      const diff = angDiff(tr.longitude, na.longitude);
      for (const asp of ASPECTS) {
        if (Math.abs(diff - asp.angle) <= orb) {
          const actualOrb = Math.abs(diff - asp.angle);
          const tipText = `тр${tr.glyph} ${asp.name} нат${na.glyph}  ${fmtOrb(actualOrb)}`;
          if (asp.type === 'conj') {
            let l1 = tr.longitude, l2 = na.longitude;
            if (Math.abs(l1 - l2) > 180) { if (l1 < l2) l1 += 360; else l2 += 360; }
            const midLon = ((l1 + l2) / 2) % 360;
            const midA = lonToRad(midLon, asc);
            const center = polar(midA, R_DIVIDER);
            const spanRad = diff * Math.PI / 180;
            const rx = Math.max(8, spanRad * R_DIVIDER / 2 + 6);
            const rotDeg = midA * 180 / Math.PI + 90;
            const ellipseEl = el('ellipse', {
              cx: center.x, cy: center.y, rx, ry: 5,
              transform: `rotate(${rotDeg}, ${center.x}, ${center.y})`,
              fill: 'none', stroke: asp.color, 'stroke-width': 1.5, style: 'cursor:default',
            });
            ellipseEl.addEventListener('mouseover', e => showChartTip(tipText, e));
            ellipseEl.addEventListener('mousemove', moveChartTip);
            ellipseEl.addEventListener('mouseout', hideChartTip);
            g.appendChild(ellipseEl);
          } else {
            const pt  = polar(lonToRad(tr.longitude, asc), R_BW_INNER);
            const pn  = polar(lonToRad(na.longitude, asc), R_BW_INNER);
            const mid = { x: (pt.x + pn.x) / 2, y: (pt.y + pn.y) / 2 };
            const attrs = { stroke: asp.color, 'stroke-width': asp.width, opacity: '0.6' };
            if (asp.dash) attrs['stroke-dasharray'] = asp.dash;
            g.appendChild(ln(pt.x, pt.y, pn.x, pn.y, attrs));
            const hitLine = ln(pt.x, pt.y, pn.x, pn.y, { stroke: 'transparent', 'stroke-width': 8, style: 'cursor:default' });
            hitLine.addEventListener('mouseover', e => showChartTip(tipText, e));
            hitLine.addEventListener('mousemove', moveChartTip);
            hitLine.addEventListener('mouseout', hideChartTip);
            g.appendChild(hitLine);
            g.appendChild(txt(mid.x, mid.y, asp.symbol, {
              'font-size': 9, fill: asp.color,
              'text-anchor': 'middle', 'dominant-baseline': 'central',
            }));
          }
          break;
        }
      }
    }
  }
}
```
