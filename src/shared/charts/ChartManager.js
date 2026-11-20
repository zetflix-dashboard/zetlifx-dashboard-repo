import * as echarts from 'echarts/core';
import './template-styles.css';
import {
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  TreeChart,
  CustomChart,
  FunnelChart,
  HeatmapChart,
  SankeyChart,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartRegistry } from './ChartRegistry.js';
import { datasets } from '../data/datasets.js';
import { datasetQueryParams, validateLocalFilters } from '../filters/LocalFilters.js';
import { validateRows } from './contract.js';
import { buildOption, chartTheme, renderIndicator, renderTable } from './templates.js';
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  PieChart,
  TreeChart,
  CustomChart,
  FunnelChart,
  HeatmapChart,
  SankeyChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  VisualMapComponent,
  CanvasRenderer,
]);
export class ChartManager {
  constructor(data, filters) {
    this.data = data;
    this.filters = filters;
    this.sessions = new Map();
    this.unsubscribe = filters.subscribe(() => this.refreshAll());
  }
  mount(instanceId, chartId, container, localFilters = {}) {
    const definition = ChartRegistry.get(chartId);
    if (!definition) throw new Error('Неизвестный график');
    const node = document.createElement('div');
    node.className = 'widget-chart';
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';
    overlay.setAttribute('role', 'status');
    container.append(node, overlay);
    const session = {
      definition,
      localFilters: validateLocalFilters(definition, localFilters),
      node,
      overlay,
      chart: null,
      request: 0,
      tableSort: {},
      focusSource: null,
      treePeriods: definition.trend?.periods || 12,
      table: definition.template === 'table',
    };
    session.observer = new ResizeObserver(() => session.chart?.resize());
    session.observer.observe(node);
    this.sessions.set(instanceId, session);
    void this.refreshOne(instanceId);
  }
  draw(session) {
    session.chart?.dispose();
    session.chart = null;
    session.node.replaceChildren();
    session.node.classList.toggle('table-view', session.table);
    session.node.classList.toggle(
      'indicator-view',
      !session.table && session.definition.template === 'indicator',
    );
    session.node.classList.toggle(
      'sankey-view',
      !session.table && session.definition.template === 'sankey',
    );
    session.node.classList.toggle(
      'tree-view',
      !session.table && session.definition.template === 'tree',
    );
    if (session.table) {
      renderTable(session.node, session.definition, session.rows, session.tableSort);
    } else if (session.definition.template === 'indicator') {
      renderIndicator(session.node, session.definition, session.rows);
    } else {
      let plot = session.node;
      if (session.definition.template === 'tree') {
        const controls = document.createElement('div');
        controls.className = 'tree-controls';
        const hint = document.createElement('span');
        hint.textContent = 'Перетаскивайте холст';
        controls.append(hint);
        if (session.definition.trend) {
          const label = document.createElement('label');
          label.textContent = 'Динамика: ';
          const select = document.createElement('select');
          select.setAttribute('aria-label', 'Период мини-графиков дерева');
          const periods = [...new Set([3, 6, 12, 24, session.definition.trend.periods])].sort(
            (a, b) => a - b,
          );
          for (const months of periods) {
            const option = document.createElement('option');
            option.value = String(months);
            option.textContent = months + ' мес.';
            option.selected = months === session.treePeriods;
            select.append(option);
          }
          select.addEventListener('change', () => {
            session.treePeriods = Number(select.value);
            this.updateTree(session);
          });
          label.append(select);
          controls.append(label);
        }
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'К началу';
        reset.addEventListener('click', () => this.updateTree(session));
        controls.append(reset);
        plot = document.createElement('div');
        plot.className = 'tree-plot';
        plot.tabIndex = 0;
        plot.setAttribute('role', 'group');
        plot.setAttribute(
          'aria-label',
          'Дерево метрик. Перетаскивайте мышью или используйте клавиши со стрелками. Описание доступно при наведении на i.',
        );
        plot.addEventListener('keydown', (event) => {
          const delta = {
            ArrowLeft: [60, 0],
            ArrowRight: [-60, 0],
            ArrowUp: [0, 60],
            ArrowDown: [0, -60],
          }[event.key];
          if (!delta) return;
          event.preventDefault();
          session.chart.dispatchAction({
            type: 'treeRoam',
            seriesIndex: 0,
            dx: delta[0],
            dy: delta[1],
          });
        });
        session.node.append(controls, plot);
      }
      if (session.definition.template === 'sankey') {
        const controls = document.createElement('div');
        controls.className = 'sankey-filters';
        controls.setAttribute('role', 'group');
        controls.setAttribute('aria-label', 'Выделить исходный сегмент');
        const sources = [
          ...new Set(session.rows.map((row) => String(row[session.definition.dimension]))),
        ];
        for (const source of [null, ...sources]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = source === null ? 'Все' : source;
          button.setAttribute('aria-pressed', String(session.focusSource === source));
          button.addEventListener('click', () => {
            if (session.focusSource === source) return;
            session.focusSource = source;
            this.draw(session);
          });
          controls.append(button);
        }
        const stageLabels = document.createElement('div');
        stageLabels.className = 'sankey-stage-labels';
        const sourceTitle = document.createElement('span');
        sourceTitle.textContent =
          session.definition.sourceTitle ||
          datasets[session.definition.dataset].fields[session.definition.dimension].label;
        const targetTitle = document.createElement('span');
        targetTitle.textContent =
          session.definition.targetTitle ||
          datasets[session.definition.dataset].fields[session.definition.target].label;
        stageLabels.append(sourceTitle, targetTitle);
        plot = document.createElement('div');
        plot.className = 'sankey-plot';
        session.node.append(controls, stageLabels, plot);
      }
      session.chart = echarts.init(plot, null, { renderer: 'canvas' });
      session.chart.setOption(
        buildOption(
          session.definition,
          session.rows,
          matchMedia('(prefers-reduced-motion: reduce)').matches,
          chartTheme(),
          session.focusSource,
          session.treePeriods,
        ),
      );
    }
  }
  updateTree(session) {
    if (!session.rows?.length) return;
    session.chart?.setOption(
      buildOption(
        session.definition,
        session.rows,
        matchMedia('(prefers-reduced-motion: reduce)').matches,
        chartTheme(),
        null,
        session.treePeriods,
      ),
      { notMerge: true },
    );
  }
  setLocalFilters(id, next) {
    const session = this.sessions.get(id);
    if (!session) return;
    const normalized = validateLocalFilters(session.definition, next);
    if (JSON.stringify(normalized) === JSON.stringify(session.localFilters)) return;
    session.localFilters = normalized;
    void this.refreshOne(id);
  }
  toggleTable(id) {
    const s = this.sessions.get(id);
    if (!s || s.definition.template === 'table') return false;
    s.table = !s.table;
    if (s.rows?.length) this.draw(s);
    return s.table;
  }
  async refreshOne(id, force = false) {
    const s = this.sessions.get(id);
    if (!s) return;
    s.controller?.abort();
    const controller = (s.controller = new AbortController());
    const request = ++s.request;
    s.node.setAttribute('aria-busy', 'true');
    s.overlay.hidden = false;
    s.overlay.replaceChildren('Загрузка данных…');
    // Never leave stale values exposed while the period is changing.
    s.chart?.clear();
    s.node.querySelector('table')?.remove();
    s.rows = null;
    try {
      const dataset = datasets[s.definition.dataset];
      const rows = await this.data.query(
        dataset.sources,
        dataset.sql,
        datasetQueryParams(s.definition, this.filters.get(), s.localFilters),
        controller.signal,
        {
          definition: s.definition,
          force,
          validate: (result) => validateRows(result, s.definition),
        },
      );
      if (this.sessions.get(id) !== s || request !== s.request) return;
      s.rows = rows;
      if (
        s.definition.template === 'sankey' &&
        s.focusSource !== null &&
        !rows.some((row) => String(row[s.definition.dimension]) === s.focusSource)
      )
        s.focusSource = null;
      if (!rows.length) {
        s.overlay.textContent = 'За выбранный период нет данных';
        return;
      }
      this.draw(s);
      s.overlay.hidden = true;
    } catch (error) {
      if (this.sessions.get(id) !== s || request !== s.request || error.name === 'AbortError')
        return;
      s.overlay.replaceChildren('Не удалось загрузить данные. ');
      const retry = document.createElement('button');
      retry.textContent = 'Повторить';
      retry.type = 'button';
      retry.addEventListener('click', () => this.refreshOne(id));
      s.overlay.append(retry);
      console.error('Chart ' + s.definition.id, error);
    } finally {
      if (this.sessions.get(id) === s && request === s.request)
        s.node.setAttribute('aria-busy', 'false');
    }
  }
  applyTheme() {
    for (const session of this.sessions.values()) {
      if (session.chart && session.rows?.length) {
        session.chart.setOption(
          buildOption(
            session.definition,
            session.rows,
            matchMedia('(prefers-reduced-motion: reduce)').matches,
            chartTheme(),
            session.focusSource,
            session.treePeriods,
          ),
          { notMerge: true },
        );
      }
    }
  }
  refreshAll() {
    for (const [id, session] of this.sessions) {
      if (datasets[session.definition.dataset].filters.includes('period')) void this.refreshOne(id);
    }
  }
  async reloadAll() {
    const clearing = this.data.clearCache();
    const refreshing = [...this.sessions.keys()].map((id) => this.refreshOne(id));
    await Promise.all([clearing, ...refreshing]);
  }
  resizeAll() {
    for (const s of this.sessions.values()) s.chart?.resize();
  }
  disposeOne(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    s.controller?.abort();
    s.observer.disconnect();
    s.chart?.dispose();
    this.sessions.delete(id);
  }
  dispose() {
    this.unsubscribe();
    for (const id of [...this.sessions.keys()]) this.disposeOne(id);
  }
}
