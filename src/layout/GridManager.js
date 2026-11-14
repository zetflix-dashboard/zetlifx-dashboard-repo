import { GridStack } from 'gridstack';
import { ChartRegistry } from '../shared/charts/ChartRegistry.js';
import { datasets } from '../shared/data/datasets.js';
import { LAYOUT_VERSION } from './LayoutStorage.js';
import { createIcon } from '../shared/ui/icons.js';

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

export class GridManager {
  constructor(container, charts, onChange) {
    this.container = container;
    this.charts = charts;
    this.onChange = onChange;
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
    const definition = ChartRegistry.get(widget.chartId);
    if (!definition) throw new Error('График не найден: ' + widget.chartId);
    if (this.items.has(widget.instanceId)) throw new Error('Повтор ID карточки');

    const item = element('div', 'grid-stack-item');
    item.dataset.instanceId = widget.instanceId;
    const content = element('div', 'grid-stack-item-content');
    const head = element('div', 'widget-head');
    const titles = element('div', 'widget-titles');
    const titleRow = element('div', 'widget-title-row');
    titleRow.append(element('h3', '', definition.title));
    const info = element('details', 'widget-info');
    const summary = element('summary');
    summary.append(createIcon('info'));
    summary.title = 'О данных';
    summary.setAttribute('aria-label', 'О данных: ' + definition.title);
    const description = element(
      'p',
      '',
      definition.question + ' ' + datasets[definition.dataset].limitation +
        ' Фильтры: ' + (datasets[definition.dataset].filters.length ? 'период.' : 'общий период не применяется.'),
    );
    info.append(summary, description);
    titleRow.append(info);
    titles.append(titleRow, element('p', '', definition.id + ' · ' + datasets[definition.dataset].label));
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
    actions.append(table, grip, remove);
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
    this.items.set(widget.instanceId, { item, chartId: widget.chartId });
    this.charts.mount(widget.instanceId, widget.chartId, plot);
    if (notify && !this.silent) this.onChange(this.getLayout());
  }

  removeOne(instanceId, notify = true) {
    const current = this.items.get(instanceId);
    if (!current) return;
    this.charts.disposeOne(instanceId);
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
        chartId: item.chartId,
        x: node.x || 0,
        y: node.y || 0,
        w: node.w || 1,
        h: node.h || 1,
      };
    });
    return { version: LAYOUT_VERSION, dashboardId: 'current', title: 'Пространство', widgets };
  }

  getNextRow() {
    return Math.max(0, ...this.getLayout().widgets.map((widget) => widget.y + widget.h));
  }
  count() {
    return this.items.size;
  }

  dispose() {
    for (const id of Array.from(this.items.keys())) this.charts.disposeOne(id);
    this.items.clear();
    this.grid.destroy();
  }
}
