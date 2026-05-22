# Задача: реализовать fan-out размещение глифов планет в натальной карте

## Контекст

В `index.html` есть функция `drawPlanets(g, planets, asc)` (~строка 1001).
Текущая реализация пытается решать коллизии радиальным смещением — это не работает.
Нужно заменить её целиком на алгоритм angular fan-out, описанный ниже.

---

## Параметры (зафиксированы, не менять)

```js
const THRESH_DEG     = 8;   // порог кластеризации в градусах
const STEP_PX        = 18;  // желаемый шаг между глифами в пикселях
const OFFSET_PX      = 14;  // отступ центра глифа от R_INNER
const GLYPH_FONT     = 26;  // font-size глифа (как было в оригинале)
const GLYPH_MIN_STEP = GLYPH_FONT + 2; // минимальный шаг — глифы не слипаются
```

---

## Алгоритм

### Шаг 1 — кластеризация

Отсортировать планеты по `longitude`. Пройти по ним и группировать соседей,
у которых разница `longitude` ≤ `THRESH_DEG`. Результат — массив групп (кластеров).

```js
const sorted = [...planets].sort((a, b) => a.longitude - b.longitude);
const groups = [];
let cur = [sorted[0]];
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i].longitude - sorted[i-1].longitude <= THRESH_DEG)
    cur.push(sorted[i]);
  else { groups.push(cur); cur = [sorted[i]]; }
}
groups.push(cur);
```

### Шаг 2 — вычисление угла глифа (lblA)

Для каждого кластера:
- Найти центральный угол кластера (среднее по `lonToRad(p.longitude, asc)`)
- Вычислить шаг в радианах: `stepRad = safeStep / R_GLYPH`
  где `safeStep = Math.max(STEP_PX, GLYPH_MIN_STEP)`
- Разложить глифы симметрично вокруг центра

```js
const R_GLYPH = R_INNER + OFFSET_PX; // радиус размещения глифов

const safeStep = Math.max(STEP_PX, GLYPH_MIN_STEP);
const stepRad  = safeStep / R_GLYPH;

const items = [];
for (const g of groups) {
  const center = g.reduce((s, p) => s + lonToRad(p.longitude, asc), 0) / g.length;
  const total  = stepRad * (g.length - 1);
  const start  = center - total / 2;
  g.forEach((p, i) => items.push({
    ...p,
    dotA:  lonToRad(p.longitude, asc), // точная позиция (для dot)
    lblA:  start + i * stepRad,         // позиция глифа (со сдвигом)
  }));
}
```

### Шаг 3 — рендер

Для каждой планеты из `items`:

1. **Dot** на `R_INNER` по `dotA` — жёлтый кружок (уже есть в коде отдельным циклом, не трогать)

2. **Глиф** на `R_GLYPH` по `lblA`:

```js
items.forEach(p => {
  const pos = polar(p.lblA, R_GLYPH);
  const deg = Math.floor(p.longitude % 30);

  const t = el('text', {
    x: pos.x, y: pos.y,
    'font-size': GLYPH_FONT,
    fill: '#111',                      // чёрный цвет глифов
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  t.appendChild(el('tspan', {}, p.glyph));
  t.appendChild(el('tspan', { dy: '-7', 'font-size': '10', fill: '#333' }, String(deg)));
  g.appendChild(t);

  if (p.retrograde) {
    g.appendChild(txt(pos.x + 12, pos.y + 4, 'R', {
      'font-size': 8, fill: '#bb1111', 'font-style': 'italic',
    }));
  }
});
```

---

## Что удалить из старой drawPlanets

Убрать весь блок радиального смещения:

```js
// УДАЛИТЬ этот блок целиком:
for (let i = 1; i < items.length; i++) {
  for (let j = 0; j < i; j++) {
    let da = Math.abs(items[i].a - items[j].a);
    da = Math.min(da, Math.PI * 2 - da);
    if (da < 0.10) {
      items[i].r = Math.max(R_INNER + 6, items[j].r - 14);
    }
  }
}
```

---

## Что НЕ трогать

- Отдельный цикл с жёлтыми dots (он стоит перед вызовом `drawPlanets` в `renderChart`) — оставить как есть
- `drawClusters` — не вызывать (оставить закомментированным)
- Все остальные функции рендера (`drawAspects`, `drawHouseAxes` и т.д.) — не трогать

---

## Итоговая функция целиком

```js
function drawPlanets(g, planets, asc) {
  const THRESH_DEG     = 8;
  const STEP_PX        = 18;
  const OFFSET_PX      = 14;
  const GLYPH_FONT     = 26;
  const GLYPH_MIN_STEP = GLYPH_FONT + 2;
  const R_GLYPH        = R_INNER + OFFSET_PX;
  const safeStep       = Math.max(STEP_PX, GLYPH_MIN_STEP);
  const stepRad        = safeStep / R_GLYPH;

  // 1. Кластеризация
  const sorted = [...planets].sort((a, b) => a.longitude - b.longitude);
  const groups = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].longitude - sorted[i-1].longitude <= THRESH_DEG)
      cur.push(sorted[i]);
    else { groups.push(cur); cur = [sorted[i]]; }
  }
  groups.push(cur);

  // 2. Вычисляем угол глифа для каждой планеты
  const items = [];
  for (const group of groups) {
    const center = group.reduce((s, p) => s + lonToRad(p.longitude, asc), 0) / group.length;
    const total  = stepRad * (group.length - 1);
    const start  = center - total / 2;
    group.forEach((p, i) => items.push({
      ...p,
      lblA: start + i * stepRad,
    }));
  }

  // 3. Рендер глифов
  items.forEach(p => {
    const pos = polar(p.lblA, R_GLYPH);
    const deg = Math.floor(p.longitude % 30);

    const t = el('text', {
      x: pos.x, y: pos.y,
      'font-size': GLYPH_FONT,
      fill: '#111',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    t.appendChild(el('tspan', {}, p.glyph));
    t.appendChild(el('tspan', { dy: '-7', 'font-size': '10', fill: '#333' }, String(deg)));
    g.appendChild(t);

    if (p.retrograde) {
      g.appendChild(txt(pos.x + 12, pos.y + 4, 'R', {
        'font-size': 8, fill: '#bb1111', 'font-style': 'italic',
      }));
    }
  });
}
```
