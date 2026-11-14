import './style.css';
import initialLayout from './dashboards/overview.json';
import { ChartRegistry } from './shared/charts/ChartRegistry.js';
import { ChartManager } from './shared/charts/ChartManager.js';
import { DataClient } from './shared/data/DataClient.js';
import { FilterStore, MIN_MONTH, MAX_MONTH } from './shared/filters/FilterStore.js';
import { GridManager } from './layout/GridManager.js';
import { addNewCharts, readSeenCharts, writeSeenCharts } from './layout/AutoCharts.js';
import { LayoutHistory, validateLayout, readLocalLayout, writeLocalLayout, downloadLayout } from './layout/LayoutStorage.js';

const byId = (id) => document.getElementById(id);
const knownChart = (id) => ChartRegistry.has(id);
const defaults = validateLayout(initialLayout, knownChart);
const filters = new FilterStore();

const data = new DataClient((status, label) => {
  byId('engine-status').textContent = label;
  byId('engine-status-dot').className = 'status-dot' + (status === 'ready' ? ' ready' : status === 'error' ? ' error' : '');
});
const charts = new ChartManager(data, filters);
const registeredCharts = ChartRegistry.list();
const factoryIds = defaults.widgets.map(w => w.chartId);
const storedLayout = readLocalLayout(defaults, knownChart);
// New modules appear without a commit to overview.json; dismissed cards remain dismissed after Save.
const seenChartIds = readSeenCharts([...factoryIds, ...storedLayout.widgets.map(w => w.chartId)]);
const starting = addNewCharts(storedLayout, registeredCharts, seenChartIds);
const factoryLayout = addNewCharts(defaults, registeredCharts, factoryIds);
const history = new LayoutHistory(starting);
let lastSaved = JSON.stringify(starting);
let editing = false;
let messageTimer;

function message(text) {
  byId('message').textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { byId('message').textContent = ''; }, 6500);
}

const grid = new GridManager(byId('dashboard-grid'), charts, (layout) => {
  history.push(layout);
  syncControls();
});

function syncControls() {
  const current = grid.getLayout();
  byId('widget-count').textContent = grid.count() + ' видж.';
  byId('empty-layout').classList.toggle('hidden', grid.count() > 0);
  byId('undo-btn').disabled = !history.canUndo;
  byId('redo-btn').disabled = !history.canRedo;
  const dirty = JSON.stringify(current) !== lastSaved;
  byId('layout-state').textContent = dirty ? 'Несохранённые изменения' : 'Все изменения сохранены';
}

grid.replace(starting);
syncControls();

function months() {
  const result = [];
  for (let year = 2024; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      const id = String(year) + '-' + String(month).padStart(2, '0');
      const label = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1));
      result.push({ id, label });
    }
  }
  return result;
}
for (const name of ['period-from', 'period-to']) {
  const select = byId(name);
  for (const month of months()) {
    const option = document.createElement('option');
    option.value = month.id;
    option.textContent = month.label;
    select.append(option);
  }
}
function syncPeriod() {
  byId('period-from').value = filters.get().periodFrom;
  byId('period-to').value = filters.get().periodTo;
}
function applyPeriod() {
  try {
    filters.set({ periodFrom: byId('period-from').value, periodTo: byId('period-to').value });
  } catch (error) {
    message(error.message);
    syncPeriod();
  }
}
syncPeriod();
byId('period-from').addEventListener('change', applyPeriod);
byId('period-to').addEventListener('change', applyPeriod);
byId('filters-reset').addEventListener('click', () => {
  filters.reset();
  syncPeriod();
});
byId('edit-btn').addEventListener('click', () => {
  editing = !editing;
  grid.setEditing(editing);
  byId('editor-bar').classList.toggle('hidden', !editing);
  byId('edit-btn').textContent = editing ? '✓ Завершить настройку' : '✎ Настроить макет';
  byId('edit-btn').setAttribute('aria-pressed', String(editing));
  if (!editing) byId('catalog').classList.add('hidden');
  syncControls();
});

function applyHistoryLayout(layout) {
  grid.replace(validateLayout(layout, knownChart));
  syncControls();
}
byId('undo-btn').addEventListener('click', () => { if (history.canUndo) applyHistoryLayout(history.undo()); });
byId('redo-btn').addEventListener('click', () => { if (history.canRedo) applyHistoryLayout(history.redo()); });
byId('save-btn').addEventListener('click', () => {
  try {
    const layout = validateLayout(grid.getLayout(), knownChart);
    writeLocalLayout(layout, knownChart);
    writeSeenCharts(registeredCharts.map(chart => chart.id));
    lastSaved = JSON.stringify(layout);
    syncControls();
    message('Макет сохранён в этом браузере');
  } catch (error) {
    message('Сохранение не удалось: ' + error.message);
  }
});
byId('reset-layout-btn').addEventListener('click', () => {
  grid.replace(factoryLayout);
  history.push(grid.getLayout());
  syncControls();
  message('Стандартный макет восстановлен. Нажмите «Сохранить» для закрепления.');
});
byId('export-btn').addEventListener('click', () => {
  try { downloadLayout(validateLayout(grid.getLayout(), knownChart)); }
  catch (error) { message(error.message); }
});
byId('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 100000) throw new Error('Макет слишком большой');
    const incoming = validateLayout(JSON.parse(await file.text()), knownChart);
    grid.replace(incoming);
    history.push(grid.getLayout());
    syncControls();
    message('Макет загружен. Сохраните его при необходимости.');
  } catch (error) {
    message('Ошибка импорта: ' + error.message);
  } finally {
    event.target.value = '';
  }
});

function addChart(chartId) {
  const definition = ChartRegistry.get(chartId);
  if (!definition) return;
  const stamp = Math.random().toString(36).slice(2, 9);
  const instanceId = chartId.toLowerCase() + '-' + stamp;
  grid.addOne({
    chartId, instanceId, x: 0, y: grid.getNextRow(),
    w: definition.defaultSize.w, h: definition.defaultSize.h
  });
  byId('catalog').classList.add('hidden');
}
for (const chart of ChartRegistry.list()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'catalog-option';
  const title = document.createElement('strong');
  title.textContent = chart.id + ' · ' + chart.title;
  const subtitle = document.createElement('span');
  subtitle.textContent = chart.subtitle;
  button.append(title, subtitle);
  button.addEventListener('click', () => addChart(chart.id));
  byId('catalog-items').append(button);
}
byId('add-btn').addEventListener('click', () => byId('catalog').classList.toggle('hidden'));
byId('close-catalog').addEventListener('click', () => byId('catalog').classList.add('hidden'));

// Keyboard shortcuts only when editing; avoid intercepting inputs/selectors.
document.addEventListener('keydown', (event) => {
  if (!editing || !(event.ctrlKey || event.metaKey) || event.target.closest('input,select,textarea')) return;
  if (event.key.toLowerCase() !== 'z') return;
  event.preventDefault();
  if (event.shiftKey && history.canRedo) applyHistoryLayout(history.redo());
  else if (!event.shiftKey && history.canUndo) applyHistoryLayout(history.undo());
});

window.addEventListener('pagehide', () => {
  charts.dispose();
  grid.dispose();
  void data.dispose();
});
