import { GridStack } from 'gridstack';
import { ChartRegistry } from '../shared/charts/ChartRegistry.js';
import { LAYOUT_VERSION } from './LayoutStorage.js';

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

    this.grid = GridStack.init({
      column: 12,
      cellHeight: 82,
      margin: 5,
      animate: true,
      staticGrid: true,
      draggable: { handle: '.widget-grip', scroll: true },
      resizable: { handles: 'se' },
      responsive: {
        breakpoints: [{ w: 660, c: 1 }, { w: 1100, c: 6 }],
        layout: 'list'
      }
    }, container);
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
    const definition = ChartRegistry.get(widget.chartId);
    if (!definition) throw new Error('График не найден: ' + widget.chartId);
    if (this.items.has(widget.instanceId)) throw new Error('Повтор ID карточки');

    const item = element('div', 'grid-stack-item');
    item.dataset.instanceId = widget.instanceId;
    const content = element('div', 'grid-stack-item-content');
    const head = element('div', 'widget-head');
    const titles = element('div', 'widget-titles');
    titles.append(element('h3', '', definition.title), element('p', '', definition.subtitle));
    const actions = element('div', 'widget-actions');
    const grip = element('button', 'widget-grip', '⠿');
    grip.type = 'button';
    grip.title = 'Перетащить график';
    grip.setAttribute('aria-label', 'Перетащить ' + definition.title);
    const remove = element('button', 'widget-remove', '×');
    remove.type = 'button';
    remove.title = 'Убрать график с макета';
    remove.setAttribute('aria-label', 'Убрать ' + definition.title);
    remove.addEventListener('click', () => this.removeOne(widget.instanceId));
    actions.append(grip, remove);
    head.append(titles, actions);
    const plot = element('div', 'widget-plot');
    content.append(head, plot);
    item.append(content);
    this.container.append(item);

    this.grid.makeWidget(item, {
      id: widget.instanceId, x: widget.x, y: widget.y,
      w: widget.w, h: widget.h,
      minW: definition.minSize.w, minH: definition.minSize.h
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
    this.grid.batchUpdate();
    try {
      for (const id of Array.from(this.items.keys())) this.removeOne(id, false);
      for (const widget of layout.widgets) this.addOne(widget, false);
    } finally {
      this.grid.batchUpdate(false);
      this.silent = false;
      this.setEditing(this.editing);
    }
    this.charts.resizeAll();
  }

  getLayout() {
    // GridStack remembers the original 12-column coordinates across responsive changes.
    const nodes = this.grid.save(false, false, 12);
    const widgets = nodes.map((node) => {
      const item = this.items.get(node.id);
      return {
        instanceId: node.id,
        chartId: item.chartId,
        x: node.x || 0,
        y: node.y || 0,
        w: node.w || 1,
        h: node.h || 1
      };
    });
    return { version: LAYOUT_VERSION, dashboardId: 'overview', title: 'Общий обзор', widgets };
  }

  getNextRow() { return this.grid.getRow(); }
  count() { return this.items.size; }

  dispose() {
    for (const id of Array.from(this.items.keys())) this.charts.disposeOne(id);
    this.items.clear();
    this.grid.destroy();
  }
}
