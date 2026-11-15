import './style.css';
import { ChartRegistry } from './shared/charts/ChartRegistry.js';
import { gallerySpace } from './shared/charts/gallery.js';
import { ChartManager } from './shared/charts/ChartManager.js';
import { DataClient } from './shared/data/DataClient.js';
import { FilterStore } from './shared/filters/FilterStore.js';
import { GridManager } from './layout/GridManager.js';
import {
  WorkspaceStore,
  WORKSPACE_KEY,
  createWorkspace,
  loadWorkspace,
  validateWorkspace,
} from './layout/WorkspaceStore.js';
import { validateLayout } from './layout/LayoutStorage.js';
import { datasets } from './shared/data/datasets.js';
import { initTheme } from './shared/ui/theme.js';
import { initPeriodPicker } from './shared/ui/PeriodPicker.js';
import { createIcon } from './shared/ui/icons.js';
const byId = (id) => document.getElementById(id);
const known = (id) => ChartRegistry.get(id);
const filters = new FilterStore();
const data = new DataClient();
const charts = new ChartManager(data, filters);
initTheme(document.getElementById('theme-toggle'), () => charts.applyTheme());
let storage;
try {
  storage = window.localStorage;
} catch {
  /* blocked storage remains explicit in UI */
}
// Keep the existing starter layout lightweight; newly added charts enter via the catalogue.
const starter = ChartRegistry.list().filter((chart) => ['C03', 'C18'].includes(chart.id));
const loaded = loadWorkspace(createWorkspace(starter), known, storage);
const store = new WorkspaceStore(loaded.state, known);
let recovery = Boolean(loaded.recovery);
let editing = false;
let galleryActive = new URL(location.href).searchParams.get('gallery') === '1';
let naming = 'create';
let headingEditingId = null;
let confirmAction;
let saveTimer;
let saved = false;
const grid = new GridManager(
  byId('dashboard-grid'),
  charts,
  (layout) => {
    if (galleryActive) return;
    try {
      store.changeActive({ widgets: layout.widgets });
      persist();
      syncControls();
    } catch (error) {
      message(error.message);
      render();
    }
  },
  (id, title) => openHeading(id, title),
);
function message(text) {
  byId('message').textContent = text;
  byId('message').hidden = !text;
}
function persist() {
  clearTimeout(saveTimer);
  saved = false;
  byId('save-state').textContent = 'Сохранение…';
  saveTimer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(saveTimer);
  try {
    if (recovery) {
      const original = storage.getItem(WORKSPACE_KEY);
      if (original) storage.setItem(WORKSPACE_KEY + '.recovery.' + Date.now(), original);
      recovery = false;
    }
    storage.setItem(WORKSPACE_KEY, JSON.stringify(store.current()));
    saved = true;
    byId('save-state').textContent = 'Сохранено в браузере';
  } catch {
    byId('save-state').textContent = 'Не сохранено';
    message(
      'Сохранение в браузере недоступно. Экспортируйте пространства через меню действий, чтобы не потерять изменения.',
    );
  }
}
function syncControls() {
  byId('undo-btn').disabled = !store.past.length;
  byId('redo-btn').disabled = !store.future.length;
  const active = store.active();
  byId('empty-layout').hidden = galleryActive || Boolean(active?.widgets.length);
  byId('gallery-note').hidden = !galleryActive;
  byId('period-picker').parentElement.hidden = galleryActive;
  byId('edit-btn').hidden = galleryActive;
  byId('empty-title').textContent = active
    ? 'Пространство для ваших данных'
    : 'Создайте первое пространство';
  byId('empty-description').textContent = active
    ? 'Добавьте графики из каталога. Макет можно менять в любой момент.'
    : 'Разделяйте аналитику по задачам, темам или командам.';
  byId('empty-action').textContent = active ? 'Добавить график' : 'Создать пространство';
  byId('add-btn').disabled = !active;
  byId('add-heading-btn').disabled = !active;
  byId('rename-space').disabled = galleryActive || !active;
  byId('delete-space').disabled = galleryActive || !active;
}
function selectGallery(active) {
  if (galleryActive === active) return;
  galleryActive = active;
  if (active) setEditing(false);
  const url = new URL(location.href);
  if (active) url.searchParams.set('gallery', '1');
  else url.searchParams.delete('gallery');
  history.replaceState(null, '', url);
}
function renderTabs() {
  const tabs = byId('space-tabs');
  const panel = byId('workspace-panel');
  const active = galleryActive ? gallerySpace : store.active();
  tabs.replaceChildren();
  for (const space of [...store.state.spaces, gallerySpace]) {
    const gallery = space === gallerySpace;
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.id = gallery ? 'chart-gallery-tab' : 'tab-' + space.id;
    button.textContent = space.title;
    button.title = space.title;
    button.setAttribute('aria-selected', String(space === active));
    button.setAttribute('aria-controls', 'workspace-panel');
    button.tabIndex = space === active || (!active && gallery) ? 0 : -1;
    button.addEventListener('click', () => {
      selectGallery(gallery);
      if (!gallery && space.id !== store.state.activeId) {
        store.select(space.id);
        persist();
      }
      render();
      byId(button.id)?.focus();
    });
    tabs.append(button);
  }
  const selected = tabs.querySelector('[aria-selected="true"]');
  if (selected) {
    panel.setAttribute('aria-labelledby', selected.id);
    panel.removeAttribute('aria-label');
  } else {
    panel.removeAttribute('aria-labelledby');
    panel.setAttribute('aria-label', 'Пустой дашборд');
  }
}
byId('space-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...byId('space-tabs').children];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  // Manual activation: arrows move focus, Enter/Space loads the selected space.
  tabs.forEach((tab, i) => {
    tab.tabIndex = i === next ? 0 : -1;
  });
  tabs[next].focus();
});
function render() {
  renderTabs();
  grid.replace({
    version: 1,
    dashboardId: 'current',
    widgets: (galleryActive ? gallerySpace : store.active())?.widgets || [],
  });
  syncControls();
}
function setEditing(value) {
  editing = value;
  grid.setEditing(editing);
  byId('editor-bar').hidden = !editing;
  byId('edit-btn').textContent = editing ? 'Готово' : 'Настроить';
  byId('edit-btn').setAttribute('aria-pressed', String(editing));
}
byId('edit-btn').addEventListener('click', () => setEditing(!editing));
for (const [id, name] of [
  ['undo-btn', 'undo'],
  ['redo-btn', 'redo'],
]) {
  byId(id).append(createIcon(name));
}
function openHeading(id = null, title = '') {
  headingEditingId = id;
  byId('heading-dialog-title').textContent = id ? 'Изменить заголовок' : 'Добавить заголовок';
  byId('heading-text').value = title;
  byId('heading-dialog').showModal();
  byId('heading-text').focus();
}
byId('add-heading-btn').addEventListener('click', () => openHeading());
byId('cancel-heading').addEventListener('click', () => byId('heading-dialog').close());
byId('heading-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = byId('heading-text').value.trim();
  if (!title || title.length > 100) {
    byId('heading-text').setCustomValidity('Заголовок: от 1 до 100 символов');
    byId('heading-text').reportValidity();
    return;
  }
  try {
    if (headingEditingId) grid.updateHeading(headingEditingId, title);
    else {
      if (grid.count() >= 100) throw new Error('В пространстве допускается до 100 блоков');
      grid.addOne({
        type: 'heading',
        title,
        instanceId: crypto.randomUUID(),
        x: 0,
        y: grid.getNextRow(),
        w: 12,
        h: 1,
      });
    }
    byId('heading-dialog').close();
  } catch (error) {
    message(error.message);
  }
});
byId('heading-text').addEventListener('input', (event) => event.target.setCustomValidity(''));

function openName(mode) {
  naming = mode;
  byId('space-dialog-title').textContent =
    mode === 'create' ? 'Новое пространство' : 'Переименовать пространство';
  byId('space-name').value = mode === 'create' ? '' : store.active().title;
  byId('space-dialog').showModal();
  byId('space-name').focus();
}
byId('create-space').addEventListener('click', () => openName('create'));
byId('rename-space').addEventListener('click', () => openName('rename'));
byId('cancel-space').addEventListener('click', () => byId('space-dialog').close());
byId('space-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const name = byId('space-name').value.trim();
    if (naming === 'create') store.create(name, crypto.randomUUID());
    else store.changeActive({ title: name });
    selectGallery(false);
    byId('space-dialog').close();
    persist();
    render();
    byId('tab-' + store.state.activeId)?.focus();
  } catch (error) {
    byId('space-name').setCustomValidity(error.message);
    byId('space-name').reportValidity();
  }
});
byId('space-name').addEventListener('input', (event) => event.target.setCustomValidity(''));
function confirm(title, text, action) {
  confirmAction = action;
  byId('confirm-title').textContent = title;
  byId('confirm-text').textContent = text;
  byId('confirm-dialog').returnValue = '';
  byId('confirm-dialog').showModal();
}
byId('confirm-dialog').addEventListener('close', () => {
  if (byId('confirm-dialog').returnValue === 'confirm') confirmAction?.();
  confirmAction = null;
});
byId('delete-space').addEventListener('click', () =>
  confirm(
    'Удалить «' + store.active().title + '»?',
    'Графики останутся в каталоге. Удаление пространства можно отменить в настройке макета.',
    () => {
      store.removeActive();
      persist();
      render();
    },
  ),
);
function workspaceHistory(direction) {
  store[direction]();
  persist();
  render();
}
byId('undo-btn').addEventListener('click', () => workspaceHistory('undo'));
byId('redo-btn').addEventListener('click', () => workspaceHistory('redo'));
document.addEventListener('keydown', (event) => {
  if (
    !editing ||
    document.querySelector('dialog[open]') ||
    !(event.ctrlKey || event.metaKey) ||
    event.target.closest('input,select,textarea,[contenteditable]') ||
    event.key.toLowerCase() !== 'z'
  )
    return;
  event.preventDefault();
  workspaceHistory(event.shiftKey ? 'redo' : 'undo');
});
function openCatalog() {
  byId('catalog-search').value = '';
  updateCatalogStatus();
  filterCatalog('');
  byId('catalog').showModal();
  byId('catalog-search').focus();
}
byId('add-btn').addEventListener('click', openCatalog);
byId('empty-action').addEventListener('click', () =>
  store.active() ? openCatalog() : openName('create'),
);
for (const chart of ChartRegistry.list()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'catalog-option';
  const title = document.createElement('strong');
  title.textContent = chart.title;
  const label = document.createElement('span');
  label.textContent = chart.id + ' · ' + datasets[chart.dataset].label;
  const status = document.createElement('span');
  status.className = 'catalog-status';
  button.dataset.chartId = chart.id;
  button.append(title, label, status);
  button.dataset.search = (chart.id + ' ' + chart.title).toLocaleLowerCase('ru-RU');
  button.addEventListener('click', () => {
    if (grid.count() >= 100) {
      message('В пространстве допускается до 100 карточек. Создайте другое пространство.');
      byId('catalog').close();
      return;
    }
    grid.addOne({
      chartId: chart.id,
      instanceId: crypto.randomUUID(),
      x: 0,
      y: grid.getNextRow(),
      ...chart.defaultSize,
    });
    byId('catalog').close();
  });
  byId('catalog-items').append(button);
}
function updateCatalogStatus() {
  const current = store.active()?.widgets || [];
  const activeCounts = new Map();
  for (const widget of current) {
    if (!widget.chartId) continue;
    activeCounts.set(widget.chartId, (activeCounts.get(widget.chartId) || 0) + 1);
  }
  for (const button of byId('catalog-items').children) {
    const count = activeCounts.get(button.dataset.chartId) || 0;
    const elsewhere = store.state.spaces.some(
      (space) =>
        space.id !== store.state.activeId &&
        space.widgets.some((widget) => widget.chartId === button.dataset.chartId),
    );
    button.classList.toggle('is-added', count > 0);
    const status = button.querySelector('.catalog-status');
    status.textContent = count
      ? 'На дашборде · ' + count
      : elsewhere
        ? 'В другом пространстве'
        : 'Не добавлен';
  }
}
function filterCatalog(value) {
  const query = value.trim().toLocaleLowerCase('ru-RU');
  const buttons = [...byId('catalog-items').children];
  buttons.forEach((button) => {
    button.hidden = !button.dataset.search.includes(query);
  });
  byId('catalog-empty').hidden = buttons.some((button) => !button.hidden);
}
byId('catalog-search').addEventListener('input', (event) => filterCatalog(event.target.value));
initPeriodPicker(byId('period-picker').parentElement, filters, message);
byId('export-btn').addEventListener('click', () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(store.current(), null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zetflix-workspaces.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
byId('import-btn').addEventListener('click', () => byId('import-file').click());
byId('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Файл больше 1 МБ');
    let incoming = JSON.parse(await file.text());
    if (incoming.version === 1) {
      const old = validateLayout(incoming, known);
      incoming = {
        version: 2,
        activeId: 'imported',
        spaces: [{ id: 'imported', title: old.title, widgets: old.widgets }],
      };
    }
    const state = validateWorkspace(incoming, known);
    confirm(
      'Импортировать пространства?',
      'Текущие пространства будут заменены. Это действие можно отменить в настройке макета.',
      () => {
        store.commit(state);
        selectGallery(false);
        persist();
        render();
      },
    );
  } catch (error) {
    message('Ошибка импорта: ' + error.message);
  } finally {
    event.target.value = '';
  }
});
window.addEventListener('storage', (event) => {
  if (event.key === WORKSPACE_KEY)
    message(
      'Пространства изменены в другой вкладке. Экспортируйте текущую версию перед перезагрузкой, если хотите её сохранить.',
    );
});
window.addEventListener('beforeunload', (event) => {
  if (!saved && store.past.length) {
    flush();
    if (!saved) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    if (store.past.length) flush();
    charts.dispose();
    grid.dispose();
    void data.dispose();
  }
});
render();
byId('save-state').textContent = 'Макет в этом браузере';
if (loaded.warning) message(loaded.warning);
