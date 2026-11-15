import './style.css';
import { ChartRegistry } from './shared/charts/ChartRegistry.js';
import { ChartManager } from './shared/charts/ChartManager.js';
import { DataClient } from './shared/data/DataClient.js';
import { FilterStore } from './shared/filters/FilterStore.js';
import { GridManager } from './layout/GridManager.js';
import { WorkspaceStore, validateWorkspace } from './layout/WorkspaceStore.js';
import sharedWorkspace from '@published-workspace?raw';
import {
  ACTIVE_KEY,
  DRAFT_KEY,
  loadDraft,
  sameLayout,
  validatePublishedWorkspace,
  workspaceBlobSha,
} from './layout/PublishedWorkspace.js';
import { initWorkspacePublishing } from './layout/WorkspacePublishingUI.js';
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
const published = validatePublishedWorkspace(JSON.parse(sharedWorkspace), known, selected);
const publishedSha = await workspaceBlobSha(sharedWorkspace);
const loaded = loadDraft(published, publishedSha, known, storage);
let draftStore = loaded.state ? new WorkspaceStore(loaded.state, known) : null;
let draftBase = loaded.base || publishedSha;
let submittedSha = loaded.submittedSha;
let recovery = Boolean(loaded.recovery);
const commonStore = new WorkspaceStore(published, known);
let store = draftStore ?? commonStore;
let showCommon = false;
let editing = false;
let naming = 'create';
let headingEditingId = null;
let confirmAction;
let saveTimer;
let saved = false;
const saveStatus = byId('save-state');
function statusSaved(text) { saveStatus.textContent = text; }
function draftDiff(baseState, candidate) {
  const oldSpaces = new Map(baseState.spaces.map((space) => [space.id, space]));
  const summary = { spaces: 0, added: 0, removed: 0, moved: 0, resized: 0, filters: 0, headings: 0 };
  for (const space of candidate.spaces) {
    const old = oldSpaces.get(space.id);
    if (!old || old.title !== space.title) summary.spaces++;
    const original = new Map((old?.widgets || []).map((widget) => [widget.instanceId, widget]));
    for (const widget of space.widgets) {
      const previous = original.get(widget.instanceId);
      if (!previous) summary.added++;
      else {
        if (previous.x !== widget.x || previous.y !== widget.y) summary.moved++;
        if (previous.w !== widget.w || previous.h !== widget.h) summary.resized++;
        if (JSON.stringify(previous.localFilters || {}) !== JSON.stringify(widget.localFilters || {})) summary.filters++;
        if (previous.title !== widget.title) summary.headings++;
        original.delete(widget.instanceId);
      }
    }
    summary.removed += original.size;
    oldSpaces.delete(space.id);
  }
  summary.spaces += oldSpaces.size;
  return summary;
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
  statusSaved('Сохраняем…');
  syncControls();
  saveTimer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(saveTimer);
  try {
    if (recovery) {
      const original = storage.getItem(DRAFT_KEY);
      if (original) storage.setItem(DRAFT_KEY + '.recovery.' + Date.now(), original);
      recovery = false;
    }
    if (!draftStore) return;
    storage.setItem(
      DRAFT_KEY,
      JSON.stringify({ state: draftStore.current(), base: draftBase, submittedSha }),
    );
    saved = true;
    statusSaved('Сохранено в этом браузере');
    syncControls();
  } catch {
    statusSaved('Не удалось сохранить');
    syncControls();
    message(
      'Сохранение в браузере недоступно. Экспортируйте пространства через меню действий, чтобы не потерять изменения.',
    );
  }
}
function syncControls() {
  byId('publish-workspace').disabled =
    !editing || !saved || (draftBase === publishedSha && sameLayout(store.state, published));
  byId('reset-draft').hidden = !editing || draftBase === publishedSha;
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
  byId('rename-space').disabled = !active;
  byId('delete-space').disabled = !active;
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
      if (store === draftStore) persist();
      else {
        selected = space.id;
        try {
          storage?.setItem(ACTIVE_KEY, selected);
        } catch {
          // The selection still works in this tab.
        }
      }
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
function setEditing(value) {
  if (editing === value) return;
  if (value) {
    draftStore ??= new WorkspaceStore(store.current(), known);
    showCommon = false;
    store = draftStore;
  } else {
    if (!saved) flush();
    if (!saved) return;
  }
  editing = value;
  grid.setEditing(editing);
  byId('editor-bar').hidden = !editing;
  byId('edit-btn').hidden = editing;
  byId('save-draft').hidden = !editing;
  byId('publish-workspace').hidden = !editing;
  reloadCharts.hidden = editing;
  reloadCharts.disabled = editing;
  byId('workspace-view').disabled = editing;
  byId('workspace-view').checked = showCommon;
  if (editing) {
    if (draftBase !== publishedSha)
      message(
        'Команда обновила общий макет. Ваши изменения сохранены: скачайте копию перед переходом на новую версию.',
      );
    render();
    byId('save-draft').focus();
  } else {
    render();
    byId('edit-btn').focus();
  }
  statusSaved('Сохранено в этом браузере');
}
byId('edit-btn').addEventListener('click', () => setEditing(true));
byId('save-draft').addEventListener('click', () => setEditing(false));
byId('workspace-view').addEventListener('change', (event) => {
  showCommon = event.target.checked;
  store = showCommon ? commonStore : (draftStore ?? commonStore);
  statusSaved(showCommon ? 'Вы смотрите общий макет' : 'Личные изменения — только в этом браузере');
  render();
});
byId('reset-draft').addEventListener('click', () =>
  confirm(
    'Начать с новой общей версии?',
    'Сначала скачаем резервную копию ваших изменений. Затем откроем общую версию, загруженную при открытии страницы.',
    () => {
      exportWorkspace();
      draftBase = publishedSha;
      submittedSha = undefined;
      draftStore = new WorkspaceStore(published, known);
      store = draftStore;
      persist();
      message('');
      render();
    },
  ),
);
initWorkspacePublishing({
  storage,
  publishedSha,
  draft: () => ({ state: draftStore.current(), base: draftBase }),
  preview: () => draftDiff(published, draftStore.current()),
  markSubmitted: (blob) => {
    submittedSha = blob;
    flush();
  },
});
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
byId('delete-space').addEventListener('click', () => {
  if (!editing) setEditing(true);
  if (!store.active()) return;
  confirm(
    'Удалить «' + store.active().title + '»?',
    'Графики останутся в каталоге. Удаление пространства можно отменить в настройке макета.',
    () => {
      store.removeActive();
      persist();
      render();
    },
  );
});
function history(direction) {
  store[direction]();
  persist();
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
function exportWorkspace() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(store.current(), null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zetflix-workspaces.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId('export-btn').addEventListener('click', exportWorkspace);
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
    const state = Object.hasOwn(incoming, 'previousBlobSha')
      ? validatePublishedWorkspace(incoming, known)
      : validateWorkspace(incoming, known);
    confirm(
      'Импортировать пространства?',
      'Текущие пространства будут заменены. Это действие можно отменить в настройке макета.',
      () => {
        setEditing(true);
        store.commit(state);
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
  if (event.key === DRAFT_KEY)
    message(
      'Личный макет изменён в другой вкладке. Сохраните копию через меню, прежде чем перезагружать страницу.',
    );
});
window.addEventListener('beforeunload', (event) => {
  if (!saved && draftStore) {
    flush();
    if (!saved) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
});
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    if (!saved && draftStore) flush();
    charts.dispose();
    grid.dispose();
    void data.dispose();
  }
});
render();
statusSaved(draftStore ? 'Личный макет — в этом браузере' : 'Открыт общий макет');
if (loaded.warning) message(loaded.warning);
