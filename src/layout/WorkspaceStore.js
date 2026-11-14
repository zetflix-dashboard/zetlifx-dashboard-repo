import { validateLayout, STORAGE_KEY as LEGACY_KEY } from './LayoutStorage.js';
export const WORKSPACE_KEY = 'zetflix.workspaces.v2';
export const MAX_SPACES = 40;
const copy = value => structuredClone(value);
export function validateWorkspace(raw, known) {
  if (!raw || raw.version !== 2 || !Array.isArray(raw.spaces) || raw.spaces.length > MAX_SPACES) throw new Error('Неподдерживаемый файл пространств');
  const ids = new Set();
  const spaces = raw.spaces.map(space => {
    if (!space || typeof space.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(space.id) || ids.has(space.id)) throw new Error('Некорректный или повторяющийся ID пространства');
    ids.add(space.id);
    if (typeof space.title !== 'string' || !space.title.trim() || space.title.length > 80) throw new Error('Название: от 1 до 80 символов');
    const layout = validateLayout({ version: 1, dashboardId: space.id, widgets: space.widgets }, known);
    return { id: space.id, title: space.title.trim(), widgets: layout.widgets };
  });
  if (spaces.length ? !ids.has(raw.activeId) : raw.activeId !== null) throw new Error('Активное пространство не найдено');
  return { version: 2, activeId: raw.activeId, spaces };
}
export function createWorkspace(charts, id = 'initial') {
  return { version: 2, activeId: id, spaces: [{ id, title: 'Мой дашборд', widgets: charts.map((chart, i) => ({
    instanceId: chart.id.toLowerCase() + '-initial', chartId: chart.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 5, w: 6, h: 5
  })) }] };
}
export function loadWorkspace(fallback, known, storage) {
  try {
    const raw = storage.getItem(WORKSPACE_KEY);
    if (raw) return { state: validateWorkspace(JSON.parse(raw), known), warning: '' };
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const layout = validateLayout(JSON.parse(legacy), known);
      return { state: { version: 2, activeId: 'imported', spaces: [{ id: 'imported', title: layout.title, widgets: layout.widgets }] }, warning: 'Прежний макет перенесён. Исходная копия сохранена.' };
    }
    return { state: copy(fallback), warning: '' };
  } catch {
    return { state: copy(fallback), warning: 'Не удалось прочитать сохранённый макет. Исходная запись не изменена.', recovery: true };
  }
}
export class WorkspaceStore {
  constructor(initial, known) { this.known = known; this.state = validateWorkspace(initial, known); this.past = []; this.future = []; }
  current() { return copy(this.state); }
  active() { return this.state.spaces.find(s => s.id === this.state.activeId); }
  commit(next) {
    const validated = validateWorkspace(next, this.known);
    if (JSON.stringify(this.state) === JSON.stringify(validated)) return false;
    this.past.push(copy(this.state)); if (this.past.length > 40) this.past.shift();
    this.state = validated; this.future = []; return true;
  }
  changeActive(patch) {
    const state = this.current(); const space = state.spaces.find(s => s.id === state.activeId);
    if (!space) throw new Error('Сначала создайте пространство');
    Object.assign(space, patch); return this.commit(state);
  }
  select(id) {
    if (!this.state.spaces.some(s => s.id === id)) throw new Error('Пространство не найдено');
    this.state.activeId = id;
  }
  create(title, id) {
    const next = this.current(); next.spaces.push({ id, title, widgets: [] }); next.activeId = id; this.commit(next);
  }
  removeActive() {
    const next = this.current(); next.spaces = next.spaces.filter(s => s.id !== next.activeId); next.activeId = next.spaces[0]?.id ?? null; this.commit(next);
  }
  undo() { if (this.past.length) { this.future.push(copy(this.state)); this.state = this.past.pop(); } }
  redo() { if (this.future.length) { this.past.push(copy(this.state)); this.state = this.future.pop(); } }
}
