export const LAYOUT_VERSION = 1;
export const STORAGE_KEY = 'zetflix.layout.overview.v1';

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function inRange(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }

export function validateLayout(raw, isKnownChart) {
  if (!raw || raw.version !== LAYOUT_VERSION || raw.dashboardId !== 'overview' || !Array.isArray(raw.widgets)) {
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
  return { version: LAYOUT_VERSION, dashboardId: 'overview', title: 'Общий обзор', widgets };
}

export function readLocalLayout(fallback, isKnownChart, storage = localStorage) {
  try {
    const value = storage.getItem(STORAGE_KEY);
    return value ? validateLayout(JSON.parse(value), isKnownChart) : copy(fallback);
  } catch {
    return copy(fallback);
  }
}
export function writeLocalLayout(layout, isKnownChart, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(validateLayout(layout, isKnownChart)));
}
export function downloadLayout(layout) {
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zetflix-overview-layout.json';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export class LayoutHistory {
  constructor(initial) {
    this.stack = [copy(initial)];
    this.index = 0;
  }
  current() { return copy(this.stack[this.index]); }
  push(layout) {
    if (JSON.stringify(layout) === JSON.stringify(this.stack[this.index])) return false;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(copy(layout));
    if (this.stack.length > 30) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }
  undo() { if (this.index > 0) this.index--; return this.current(); }
  redo() { if (this.index < this.stack.length - 1) this.index++; return this.current(); }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
}
