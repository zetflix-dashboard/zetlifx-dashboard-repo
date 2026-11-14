import * as echarts from 'echarts/core';
import { LineChart, BarChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartRegistry } from './ChartRegistry.js';
import { datasets } from '../data/datasets.js';
import { dateRange } from '../filters/FilterStore.js';
import { validateRows } from './contract.js';
import { buildOption, renderTable } from './templates.js';
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  CanvasRenderer,
]);
export class ChartManager {
  constructor(data, filters) {
    this.data = data;
    this.filters = filters;
    this.sessions = new Map();
    this.unsubscribe = filters.subscribe(() => this.refreshAll());
  }
  mount(instanceId, chartId, container) {
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
      node,
      overlay,
      chart: null,
      request: 0,
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
    if (session.table) renderTable(session.node, session.definition, session.rows);
    else {
      session.chart = echarts.init(session.node, null, { renderer: 'canvas' });
      session.chart.setOption(
        buildOption(
          session.definition,
          session.rows,
          matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
      );
    }
  }
  toggleTable(id) {
    const s = this.sessions.get(id);
    if (!s || s.definition.template === 'table') return false;
    s.table = !s.table;
    if (s.rows?.length) this.draw(s);
    return s.table;
  }
  async refreshOne(id) {
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
        dateRange(this.filters.get()),
        controller.signal,
      );
      if (this.sessions.get(id) !== s || request !== s.request) return;
      s.rows = validateRows(rows, s.definition);
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
          ),
          { notMerge: true },
        );
      }
    }
  }
  refreshAll() {
    for (const id of this.sessions.keys()) void this.refreshOne(id);
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
