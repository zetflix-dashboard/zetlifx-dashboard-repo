import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DatasetComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartRegistry } from './ChartRegistry.js';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, CanvasRenderer]);

export class ChartManager {
  constructor(data, filters) {
    this.data = data;
    this.filters = filters;
    this.sessions = new Map();
    this.unsubscribe = filters.subscribe(() => this.refreshAll());
  }

  mount(instanceId, chartId, plotContainer) {
    const definition = ChartRegistry.get(chartId);
    if (!definition) throw new Error('Неизвестный модуль: ' + chartId);
    const chartNode = document.createElement('div');
    chartNode.className = 'widget-chart';
    const overlay = document.createElement('div');
    overlay.className = 'widget-overlay';
    overlay.setAttribute('role', 'status');
    overlay.textContent = 'Загрузка данных из Parquet…';
    plotContainer.append(chartNode, overlay);
    const chart = echarts.init(chartNode, null, { renderer: 'canvas' });
    const session = { definition, chart, overlay, controller: null, request: 0 };
    session.observer = new ResizeObserver(() => chart.resize());
    session.observer.observe(chartNode);
    this.sessions.set(instanceId, session);
    this.refreshOne(instanceId);
  }

  async refreshOne(instanceId) {
    const session = this.sessions.get(instanceId);
    if (!session) return;
    session.controller?.abort();
    session.controller = new AbortController();
    const request = ++session.request;
    session.overlay.className = 'widget-overlay';
    session.overlay.textContent = 'Загрузка данных из Parquet…';
    try {
      const rows = await session.definition.load({
        filters: this.filters.get(),
        query: (files, sql, params) => this.data.query(files, sql, params, session.controller.signal),
        signal: session.controller.signal,
      });
      if (this.sessions.get(instanceId) !== session || request !== session.request) return;
      if (!rows.length) {
        session.chart.clear();
        session.overlay.textContent = 'За выбранный период нет данных';
        return;
      }
      session.chart.setOption(session.definition.option(rows), { notMerge: true });
      session.overlay.className = 'widget-overlay hidden';
      session.chart.resize();
    } catch (error) {
      if (this.sessions.get(instanceId) !== session || request !== session.request || error.name === 'AbortError') return;
      session.chart.clear();
      session.overlay.className = 'widget-overlay error';
      session.overlay.textContent = 'Не удалось загрузить данные: ' + (error?.message || String(error));
    }
  }

  refreshAll() {
    for (const id of this.sessions.keys()) this.refreshOne(id);
  }
  resizeAll() {
    for (const session of this.sessions.values()) session.chart.resize();
  }
  disposeOne(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.controller?.abort();
    session.observer.disconnect();
    session.chart.dispose();
    this.sessions.delete(id);
  }
  dispose() {
    this.unsubscribe();
    for (const id of Array.from(this.sessions.keys())) this.disposeOne(id);
  }
}
