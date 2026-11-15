import { GridStack } from 'gridstack';
import { ChartRegistry } from '../shared/charts/ChartRegistry.js';
import { datasets } from '../shared/data/datasets.js';
import { LAYOUT_VERSION } from './LayoutStorage.js';
import { createIcon } from '../shared/ui/icons.js';
import { availableLocalFilters, validateLocalFilters } from '../shared/filters/LocalFilters.js';

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

export class GridManager {
  constructor(container, charts, onChange, onEditHeading = () => {}) {
    this.container = container;
    this.charts = charts;
    this.onChange = onChange;
    this.onEditHeading = onEditHeading;
    this.items = new Map();
    this.silent = false;
    this.editing = false;

    this.grid = GridStack.init(
      {
        column: 12,
        cellHeight: 76,
        margin: 6,
        animate: true,
        staticGrid: true,
        draggable: { handle: '.widget-grip', scroll: true },
        // All eight directions; invisible hit areas preserve native cursor hints.
        alwaysShowResizeHandle: true,
        resizable: { handles: 'n,ne,e,se,s,sw,w,nw', autoHide: false },
        columnOpts: {
          columnMax: 12,
          breakpoints: [
            { w: 660, c: 1 },
            { w: 1100, c: 6 },
          ],
          layout: 'list',
        },
      },
      container,
    );
    this.grid.on('dragstop resizestop', () => {
      if (!this.silent) this.onChange(this.getLayout());
      this.charts.resizeAll();
    });
    this.grid.on('change', () => this.charts.resizeAll());
  }

  setEditing(editing) {
    this.editing = Boolean(editing);
    this.grid.setStatic(!this.editing);
    this.container.classList.toggle('edit-mode', this.editing);
  }

  addOne(widget, notify = true) {
    if (notify && !this.silent) {
      // New cards also enter through the canonical layout, even when the
      // catalogue is opened on a phone. Never persist a responsive width.
      const layout = this.getLayout();
      layout.widgets.push(widget);
      this.replace(layout);
      this.onChange(this.getLayout());
      return;
    }
    if (widget.type === 'heading') {
      const item = element('div', 'grid-stack-item heading-item');
      item.dataset.instanceId = widget.instanceId;
      const content = element('div', 'grid-stack-item-content heading-content');
      const label = element('h2', 'heading-title', widget.title);
      const controls = element('div', 'heading-controls');
      const grip = element('button', 'widget-grip');
      grip.type = 'button';
      grip.setAttribute('aria-label', 'Переместить заголовок: ' + widget.title);
      grip.append(createIcon('grip'));
      const edit = element('button', 'heading-edit', 'Изменить');
      edit.type = 'button';
      edit.addEventListener('click', () =>
        this.onEditHeading(widget.instanceId, this.items.get(widget.instanceId).title),
      );
      const remove = element('button', 'widget-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Удалить заголовок: ' + widget.title);
      remove.addEventListener('click', () => this.removeOne(widget.instanceId));
      controls.append(edit, grip, remove);
      content.append(label, controls);
      item.append(content);
      this.container.append(item);
      this.grid.makeWidget(item, {
        id: widget.instanceId,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        minW: 2,
        minH: 1,
        maxH: 3,
      });
      this.items.set(widget.instanceId, { item, type: 'heading', title: widget.title });
      if (notify && !this.silent) this.onChange(this.getLayout());
      return;
    }
    const definition = ChartRegistry.get(widget.chartId);
    if (!definition) throw new Error('График не найден: ' + widget.chartId);
    if (this.items.has(widget.instanceId)) throw new Error('Повтор ID карточки');

    const item = element('div', 'grid-stack-item');
    item.dataset.instanceId = widget.instanceId;
    const content = element('div', 'grid-stack-item-content');
    const head = element('div', 'widget-head');
    const titles = element('div', 'widget-titles');
    const titleRow = element('div', 'widget-title-row');
    titleRow.append(
      element('h3', '', definition.title),
      element('span', 'widget-chart-id', '· ' + definition.id),
    );
    const info = element('details', 'widget-info');
    const summary = element('summary');
    summary.append(createIcon('info'));
    summary.title = 'О данных';
    summary.setAttribute('aria-label', 'О данных: ' + definition.title);
    const description = element(
      'p',
      '',
      definition.question +
        ' ' +
        datasets[definition.dataset].limitation +
        ' Фильтры: ' +
        (datasets[definition.dataset].filters.length ? 'период.' : 'общий период не применяется.'),
    );
    info.append(summary, description);
    titleRow.append(info);
    titles.append(titleRow);
    const actions = element('div', 'widget-actions');
    const grip = element('button', 'widget-grip');
    grip.type = 'button';
    grip.append(createIcon('grip'));

    grip.title = 'Перетащите или используйте стрелки; Shift + стрелки меняют размер';
    grip.addEventListener('keydown', (event) => {
      if (!this.editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
        return;
      event.preventDefault();
      const n = item.gridstackNode;
      const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
      const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      const column = this.grid.getColumn();
      const patch = event.shiftKey
        ? horizontal
          ? {
              w: Math.max(
                Math.min(definition.minSize.w, column),
                Math.min(column - n.x, n.w + delta),
              ),
            }
          : { h: Math.max(definition.minSize.h, Math.min(20, n.h + delta)) }
        : horizontal
          ? { x: Math.max(0, Math.min(column - n.w, n.x + delta)) }
          : { y: Math.max(0, Math.min(1000, n.y + delta)) };
      this.grid.update(item, patch);
      this.onChange(this.getLayout());
    });
    grip.setAttribute('aria-label', 'Переместить график: ' + definition.title);
    const remove = element('button', 'widget-remove', '×');
    remove.type = 'button';
    remove.title = 'Убрать график с макета';
    remove.setAttribute('aria-label', 'Убрать ' + definition.title);
    remove.addEventListener('click', () => this.removeOne(widget.instanceId));
    const table = element('button', 'widget-table', 'Таблица');
    table.type = 'button';
    table.setAttribute('aria-label', 'Показать таблицу: ' + definition.title);
    table.setAttribute('aria-pressed', 'false');
    table.hidden = definition.template === 'table';
    table.addEventListener('click', () => {
      const active = this.charts.toggleTable(widget.instanceId);
      table.textContent = active ? 'График' : 'Таблица';
      table.setAttribute('aria-pressed', String(active));
    });
    const localFilters = validateLocalFilters(definition, widget.localFilters || {});
    const filtersList = availableLocalFilters(definition);
    for (const filter of filtersList) {
      const label = element('label', 'widget-filter');
      const name = element('span', 'sr-only', filter.label);
      const select = element('select', 'widget-filter-select');
      select.setAttribute('aria-label', definition.title + ': ' + filter.label);
      select.title = filter.label;
      for (const option of filter.options) {
        const node = element('option', '', option.label);
        node.value = option.value;
        select.append(node);
      }
      select.value = localFilters[filter.id] || filter.options[0].value;
      select.addEventListener('change', () => {
        const next = validateLocalFilters(definition, {
          ...this.items.get(widget.instanceId).localFilters,
          [filter.id]: select.value,
        });
        this.items.get(widget.instanceId).localFilters = next;
        this.charts.setLocalFilters(widget.instanceId, next);
        this.onChange(this.getLayout(), { instanceId: widget.instanceId, localFilters: next });
      });
      label.append(name, select);
      actions.append(label);
    }
    const refresh = element('button', 'widget-refresh');
    refresh.type = 'button';
    refresh.title = 'Перезагрузить график';
    refresh.setAttribute('aria-label', 'Перезагрузить график: ' + definition.title);
    refresh.append(createIcon('refresh'));
    refresh.addEventListener('click', () => this.charts.refreshOne(widget.instanceId, true));
    actions.append(table, refresh, grip, remove);
    head.append(titles, actions);
    const plot = element('div', 'widget-plot');
    content.append(head, plot);
    item.append(content);
    this.container.append(item);

    this.grid.makeWidget(item, {
      id: widget.instanceId,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: definition.minSize.w,
      minH: definition.minSize.h,
    });
    this.items.set(widget.instanceId, { item, chartId: widget.chartId, localFilters });
    this.charts.mount(widget.instanceId, widget.chartId, plot, localFilters);
    if (notify && !this.silent) this.onChange(this.getLayout());
  }

  removeOne(instanceId, notify = true) {
    const current = this.items.get(instanceId);
    if (!current) return;
    if (current.type !== 'heading') this.charts.disposeOne(instanceId);
    this.grid.removeWidget(current.item);
    this.items.delete(instanceId);
    if (notify && !this.silent) this.onChange(this.getLayout());
  }

  replace(layout) {
    this.silent = true;
    const displayColumns = this.grid.getColumn();
    // Load the saved desktop coordinates before applying responsive columns.
    // Otherwise makeWidget clamps widths on a mobile first visit and loses
    // the canonical layout before GridStack can cache it.
    this.grid.column(12, 'none');
    this.grid.batchUpdate();
    try {
      for (const id of Array.from(this.items.keys())) this.removeOne(id, false);
      for (const widget of layout.widgets) this.addOne(widget, false);
    } finally {
      this.grid.batchUpdate(false);
      this.grid.column(displayColumns, 'list');
      this.silent = false;
      this.setEditing(this.editing);
    }
    this.charts.resizeAll();
  }

  getLayout() {
    // GridStack remembers the original 12-column coordinates across responsive changes.
    const nodes = this.grid.save(false, false, undefined, 12);
    const widgets = nodes.map((node) => {
      const item = this.items.get(node.id);
      return {
        instanceId: node.id,
        ...(item.type === 'heading'
          ? { type: 'heading', title: item.title }
          : {
              chartId: item.chartId,
              ...(Object.keys(item.localFilters).length ? { localFilters: item.localFilters } : {}),
            }),
        x: node.x || 0,
        y: node.y || 0,
        w: node.w || 1,
        h: node.h || 1,
      };
    });
    return { version: LAYOUT_VERSION, dashboardId: 'current', title: 'Пространство', widgets };
  }

  updateHeading(instanceId, title) {
    const item = this.items.get(instanceId);
    if (!item || item.type !== 'heading') throw new Error('Заголовок не найден');
    item.title = title;
    item.item.querySelector('.heading-title').textContent = title;
    item.item
      .querySelector('.widget-grip')
      .setAttribute('aria-label', 'Переместить заголовок: ' + title);
    this.onChange(this.getLayout());
  }
  getNextRow() {
    return Math.max(0, ...this.getLayout().widgets.map((widget) => widget.y + widget.h));
  }
  count() {
    return this.items.size;
  }

  dispose() {
    for (const [id, item] of this.items) if (item.type !== 'heading') this.charts.disposeOne(id);
    this.items.clear();
    this.grid.destroy();
  }
}
