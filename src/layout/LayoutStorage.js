export const LAYOUT_VERSION = 1;
export const STORAGE_KEY = 'zetflix.layout.overview.v1';

function inRange(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }

export function validateLayout(raw, isKnownChart) {
  if (!raw || raw.version !== LAYOUT_VERSION || typeof raw.dashboardId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.dashboardId) || !Array.isArray(raw.widgets)) {
    throw new Error('Неподдерживаемый формат макета');
  }
  if (raw.widgets.length > 100) throw new Error('В макете слишком много графиков');
  const ids = new Set();
  const widgets = raw.widgets.map((item) => {
    if (!item || typeof item.instanceId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.instanceId)) {
      throw new Error('Недопустимый ID экземпляра');
    }
    if (ids.has(item.instanceId)) throw new Error('Повторяющийся ID экземпляра');
    ids.add(item.instanceId);
    if (typeof item.chartId !== 'string' || !isKnownChart(item.chartId)) throw new Error('Неизвестный график: ' + item.chartId);
    if (!inRange(item.x, 0, 11) || !inRange(item.y, 0, 1000) || !inRange(item.w, 1, 12) || !inRange(item.h, 1, 20) || item.x + item.w > 12) {
      throw new Error('Недопустимые координаты или размеры для ' + item.instanceId);
    }
    return { instanceId: item.instanceId, chartId: item.chartId, x: item.x, y: item.y, w: item.w, h: item.h };
  });
  return { version: LAYOUT_VERSION, dashboardId: raw.dashboardId, title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : 'Пространство', widgets };
}
