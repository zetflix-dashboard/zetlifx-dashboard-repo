// Keeps new graph modules discoverable without changing shared JSON/engine per graph PR.
// Remembering a catalog separately prevents removed cards from returning after reload.
export const SEEN_CHARTS_KEY = 'zetflix.layout.known-charts.v1';
const isId = value => typeof value === 'string' && /^C\d{2}$/.test(value);

export function readSeenCharts(defaultIds, storage = localStorage) {
  try {
    const raw = storage.getItem(SEEN_CHARTS_KEY);
    if (!raw) return [...new Set(defaultIds.filter(isId))];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...new Set(defaultIds.filter(isId))];
    return [...new Set([...defaultIds, ...arr].filter(isId))];
  } catch {
    return [...new Set(defaultIds.filter(isId))];
  }
}

export function writeSeenCharts(ids, storage = localStorage) {
  storage.setItem(SEEN_CHARTS_KEY, JSON.stringify([...new Set(ids.filter(isId))]));
}

export function addNewCharts(layout, definitions, seenIds = []) {
  const known = new Set(seenIds);
  const widgets = layout.widgets.map(w => ({ ...w }));
  const instanceIds = new Set(widgets.map(w => w.instanceId));
  let row = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
  for (const chart of definitions) {
    if (!isId(chart.id) || known.has(chart.id) || widgets.some(w => w.chartId === chart.id)) continue;
    const w = Math.min(12, Math.max(1, chart.defaultSize?.w || 6));
    const h = Math.min(20, Math.max(1, chart.defaultSize?.h || 4));
    if (row > 1000) break;
    let instanceId = 'auto-' + chart.id;
    let count = 2;
    while (instanceIds.has(instanceId)) instanceId = 'auto-' + chart.id + '-' + count++;
    widgets.push({ chartId: chart.id, instanceId, x: 0, y: row, w, h });
    instanceIds.add(instanceId);
    row += h;
  }
  return { ...layout, widgets };
}
