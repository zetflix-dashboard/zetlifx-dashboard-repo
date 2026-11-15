import './style.css';
import { ChartRegistry } from './shared/charts/ChartRegistry.js';
import { ChartManager } from './shared/charts/ChartManager.js';
import { DataClient } from './shared/data/DataClient.js';
import { FilterStore } from './shared/filters/FilterStore.js';
import { GridManager } from './layout/GridManager.js';
import { WorkspaceStore, validateWorkspace } from './layout/WorkspaceStore.js';
import sharedWorkspace from '@initial-workspace?raw';
import {
  ACTIVE_KEY,
  CACHE_KEY,
  PENDING_KEY,
  TOKEN_KEY,
  WorkspaceConflict,
  recoverLegacyWorkspace,
  sameLayout,
  serializeWorkspace,
  validateSharedWorkspace,
} from './layout/SharedWorkspace.js';
import { WorkspaceSync, repository } from './layout/WorkspaceSync.js';
import { validateLocalFilters } from './shared/filters/LocalFilters.js';
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
const reloadCharts = byId('reload-charts');
reloadCharts.append(createIcon('refresh'));
reloadCharts.addEventListener('click', async () => {
  reloadCharts.disabled = true;
  try {
    await charts.reloadAll();
  } finally {
    reloadCharts.disabled = editing;
  }
});
let storage;
try {
  storage = window.localStorage;
} catch {
  /* blocked storage remains explicit in UI */
}
const VIEW_FILTERS_KEY = 'zetflix.view-filters.v1';
let personalFilters = {};
let selected;
try {
  const value = JSON.parse(storage?.getItem(VIEW_FILTERS_KEY) || '{}');
  if (value && typeof value === 'object' && !Array.isArray(value)) personalFilters = value;
  selected = storage?.getItem(ACTIVE_KEY);
} catch {
  // A blocked storage area only affects personal preferences.
}
const initial = validateSharedWorkspace(JSON.parse(sharedWorkspace), known, selected);
const sync = new WorkspaceSync(known);
let confirmed = readStored(CACHE_KEY) ?? initial;
let pending = readPending();
let store = new WorkspaceStore(pending?.state ?? confirmed, known);
let editBase;
let editing = false;
let writing = false;
let reading = false;
let needsAccess = false;
let conflicted = false;
let retryAt = 0;
let naming = 'create';
let headingEditingId = null;
let confirmAction;
let session;
try {
  session = window.sessionStorage;
} catch {
  // An in-memory token is enough for this page.
}
let token = readToken();

function readToken() {
  try {
    return session?.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setToken(value) {
  token = value;
  try {
    if (value) session?.setItem(TOKEN_KEY, value);
    else session?.removeItem(TOKEN_KEY);
  } catch {
    // Keep using the token in memory.
  }
}

function readStored(key) {
  try {
    const raw = JSON.parse(storage?.getItem(key) || 'null');
    return raw && validateSharedWorkspace(raw, known, selected);
  } catch {
    return null;
  }
}

function readPending() {
  try {
    const raw = JSON.parse(storage?.getItem(PENDING_KEY) || 'null');
    if (!raw || typeof raw.id !== 'string') return null;
    return {
      id: raw.id,
      base: validateSharedWorkspace(raw.base, known),
      state: validateSharedWorkspace(raw.state, known, selected),
    };
  } catch {
    return null;
  }
}
const grid = new GridManager(
  byId('dashboard-grid'),
  charts,
  (layout, filter) => {
    if (!editing) {
      if (filter) {
        personalFilters[store.state.activeId + '/' + filter.instanceId] = filter.localFilters;
        try {
          storage?.setItem(VIEW_FILTERS_KEY, JSON.stringify(personalFilters));
        } catch {
          // The filter still applies in this tab.
        }
      }
      return;
    }
    try {
      store.changeActive({ widgets: layout.widgets });
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
function syncControls() {
  for (const id of ['edit-btn', 'create-space', 'empty-action', 'import-btn'])
    byId(id).disabled = Boolean(pending);
  byId('undo-btn').disabled = !store.past.length;
  byId('redo-btn').disabled = !store.future.length;
  const active = store.active();
  byId('empty-layout').hidden = Boolean(active?.widgets.length);
  byId('empty-title').textContent = active
    ? 'Пространство для ваших данных'
    : 'Создайте первое пространство';
  byId('empty-description').textContent = active
    ? 'Добавьте графики из каталога. Макет можно менять в любой момент.'
    : 'Разделяйте аналитику по задачам, темам или командам.';
  byId('empty-action').textContent = active ? 'Добавить график' : 'Создать пространство';
  byId('add-btn').disabled = !active;
  byId('add-heading-btn').disabled = !active;
  byId('rename-space').disabled = !active || Boolean(pending);
  byId('delete-space').disabled = !active || Boolean(pending);
}
function renderTabs() {
  const tabs = byId('space-tabs');
  tabs.replaceChildren();
  for (const space of store.state.spaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.id = 'tab-' + space.id;
    button.textContent = space.title;
    button.title = space.title;
    button.setAttribute('aria-selected', String(space.id === store.state.activeId));
    button.setAttribute('aria-controls', 'workspace-panel');
    button.tabIndex = space.id === store.state.activeId ? 0 : -1;
    button.addEventListener('click', () => {
      store.select(space.id);
      rememberSelection(space.id);
      render();
      byId(button.id)?.focus();
    });
    tabs.append(button);
  }
  if (store.active())
    byId('workspace-panel').setAttribute('aria-labelledby', 'tab-' + store.state.activeId);
  else {
    byId('workspace-panel').removeAttribute('aria-labelledby');
    byId('workspace-panel').setAttribute('aria-label', 'Пустой дашборд');
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
  const space = store.active();
  const widgets = (space?.widgets || []).map((widget) => {
    const local = personalFilters[space.id + '/' + widget.instanceId];
    if (editing || !widget.chartId || !local) return widget;
    try {
      return { ...widget, localFilters: validateLocalFilters(known(widget.chartId), local) };
    } catch {
      return widget;
    }
  });
  grid.replace({ version: 1, dashboardId: 'current', widgets });
  syncControls();
}
function rememberSelection(id) {
  selected = id;
  try {
    if (id) storage?.setItem(ACTIVE_KEY, id);
    else storage?.removeItem(ACTIVE_KEY);
  } catch {
    // The selection still works in this tab.
  }
}

function showWorkspace(state) {
  store = new WorkspaceStore(validateSharedWorkspace(state, known, selected), known);
  render();
}

function confirmWorkspace(state) {
  confirmed = state;
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // The confirmed version is still available in this tab.
  }
}

function setEditing(value) {
  if (editing === value || (value && pending)) return;
  if (value) editBase = store.current();
  editing = value;
  grid.setEditing(editing);
  byId('editor-bar').hidden = !editing;
  byId('edit-btn').hidden = editing;
  byId('save-workspace').hidden = !editing;
  reloadCharts.hidden = editing;
  reloadCharts.disabled = editing;
  render();
  byId(editing ? 'save-workspace' : 'edit-btn').focus();
}

function syncStatus(text = '', action = '') {
  byId('sync-notice').hidden = !text;
  byId('sync-status').textContent = text;
  byId('resolve-sync').hidden = !action;
  byId('resolve-sync').textContent = action;
}

function requestAccess() {
  const dialog = byId('sync-access');
  if (!dialog.open) dialog.showModal();
}

async function refreshWorkspace() {
  if (reading || writing || pending || document.hidden) return;
  reading = true;
  try {
    let latest;
    try {
      latest = await sync.read(token);
    } catch (error) {
      if (token && [401, 403, 404].includes(error.status) && !error.limited) {
        setToken('');
        latest = await sync.read();
      } else throw error;
    }
    if (pending || writing || sameLayout(latest.state, confirmed)) return;
    confirmWorkspace(latest.state);
    if (!editing) showWorkspace(confirmed);
  } catch {
    // Keep the last confirmed view and try again at the next refresh.
  } finally {
    reading = false;
    if (pending) void sendPending();
  }
}

function clearPending() {
  try {
    if (readPending()?.id === pending.id) storage?.removeItem(PENDING_KEY);
  } catch {
    // A replay first checks for the same changes on GitHub.
  }
  pending = null;
  conflicted = false;
  needsAccess = false;
  retryAt = 0;
}

async function sendPending() {
  if (!pending || writing || reading || conflicted || Date.now() < retryAt) return;
  if (!token || needsAccess) {
    syncStatus('Изменения готовы к отправке', 'Подключить GitHub');
    return;
  }
  writing = true;
  syncStatus('Синхронизация…');
  try {
    const state = await sync.save(pending, token);
    confirmWorkspace(state);
    clearPending();
    showWorkspace(state);
    syncStatus();
  } catch (error) {
    if (error instanceof WorkspaceConflict) {
      conflicted = true;
      syncStatus(error.message, 'Открыть актуальный макет');
    } else if ([401, 403, 404].includes(error.status) && !error.limited) {
      setToken('');
      needsAccess = true;
      syncStatus('Для сохранения нужен доступ к GitHub', 'Подключить GitHub');
      requestAccess();
    } else {
      retryAt = Math.max(Date.now() + 10000, error.retryAt || 0);
      syncStatus('Сохраним, когда связь с GitHub восстановится');
    }
  } finally {
    writing = false;
    if (!pending) byId('edit-btn').focus();
  }
}

function saveWorkspace() {
  const state = store.current();
  rememberSelection(state.activeId);
  if (sameLayout(editBase, state)) {
    setEditing(false);
    showWorkspace(confirmed);
    return;
  }
  try {
    serializeWorkspace(state);
  } catch (error) {
    message(error.message);
    return;
  }
  if (readPending()) {
    message('В другой вкладке есть неотправленные правки. Завершите сохранение в ней.');
    return;
  }
  pending = { id: crypto.randomUUID(), base: editBase, state };
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Still try to save to GitHub while this tab is open.
  }
  setEditing(false);
  if (!token) requestAccess();
  void sendPending();
}

byId('edit-btn').addEventListener('click', () => setEditing(true));
byId('save-workspace').addEventListener('click', saveWorkspace);
byId('sync-access-repo').textContent = repository;
byId('sync-access-cancel').addEventListener('click', () => byId('sync-access').close());
byId('sync-access-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = byId('github-token');
  const value = input.value.trim();
  if (!value) return;
  setToken(value);
  needsAccess = false;
  input.value = '';
  byId('sync-access').close();
  void sendPending();
});
byId('resolve-sync').addEventListener('click', async () => {
  if (!conflicted) {
    requestAccess();
    return;
  }
  try {
    const latest = await sync.read(token);
    exportWorkspace(pending.state);
    clearPending();
    confirmWorkspace(latest.state);
    showWorkspace(confirmed);
    syncStatus();
  } catch {
    message('Не удалось загрузить актуальный макет. Повторите попытку.');
  }
});
const legacy = recoverLegacyWorkspace(initial, known, storage);
byId('recover-workspace').hidden = !legacy;
byId('recover-workspace').addEventListener('click', () => exportWorkspace(legacy));

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
  if (pending) return;
  if (!editing) setEditing(true);
  if (mode === 'rename' && !store.active()) return;
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
    byId('space-dialog').close();
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
byId('delete-space').addEventListener('click', () => {
  if (pending) return;
  if (!editing) setEditing(true);
  if (!store.active()) return;
  confirm(
    'Удалить «' + store.active().title + '»?',
    'Графики останутся в каталоге. Удаление пространства можно отменить в настройке макета.',
    () => {
      store.removeActive();
      render();
    },
  );
});
function history(direction) {
  store[direction]();
  render();
}
byId('undo-btn').addEventListener('click', () => history('undo'));
byId('redo-btn').addEventListener('click', () => history('redo'));
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
  history(event.shiftKey ? 'redo' : 'undo');
});
function openCatalog() {
  byId('catalog-search').value = '';
  updateCatalogStatus();
  filterCatalog('');
  byId('catalog').showModal();
  byId('catalog-search').focus();
}
byId('add-btn').addEventListener('click', openCatalog);
byId('empty-action').addEventListener('click', () => {
  setEditing(true);
  if (store.active()) openCatalog();
  else openName('create');
});
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
function exportWorkspace(state = store.current()) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zetflix-workspaces.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId('export-btn').addEventListener('click', () => exportWorkspace());
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
    const state = Object.hasOwn(incoming, 'activeId')
      ? validateWorkspace(incoming, known)
      : validateSharedWorkspace(incoming, known);
    confirm(
      'Импортировать пространства?',
      'Текущие пространства будут заменены. Это действие можно отменить в настройке макета.',
      () => {
        if (pending) return;
        setEditing(true);
        store.commit(state);
        render();
      },
    );
  } catch (error) {
    message('Ошибка импорта: ' + error.message);
  } finally {
    event.target.value = '';
  }
});
function syncNow() {
  if (pending) void sendPending();
  else void refreshWorkspace();
}

window.addEventListener('online', () => {
  if (retryAt < Date.now() + 10000) retryAt = 0;
  syncNow();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncNow();
});
const syncInterval = setInterval(syncNow, 10000);
window.addEventListener('beforeunload', (event) => {
  if ((editing && !sameLayout(editBase, store.state)) || (pending && !readPending())) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    clearInterval(syncInterval);
    charts.dispose();
    grid.dispose();
    void data.dispose();
  }
});
render();
syncNow();
