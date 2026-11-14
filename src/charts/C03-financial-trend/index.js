import { dateRange } from '../../shared/filters/FilterStore.js';
import { AXIS_COLOR, GRID_COLOR, formatPercent, formatRubles, monthLabel } from '../../shared/ui/format.js';

const SQL = [
  "SELECT",
  "  CAST(period AS VARCHAR) AS period,",
  "  CAST(net_revenue AS DOUBLE) AS net_revenue,",
  "  CAST(operating_profit AS DOUBLE) AS operating_profit,",
  "  CAST(100.0 * operating_profit / NULLIF(net_revenue, 0) AS DOUBLE) AS margin_pct",
  "FROM read_parquet('pl_control.parquet')",
  "WHERE period >= CAST(? AS DATE) AND period <= CAST(? AS DATE)",
  "ORDER BY period"
].join('\n');

export default {
  id: 'C03',
  title: 'Выручка и операционная прибыль',
  subtitle: 'C03 · Динамика по месяцам · PL_Control',
  supportedFilters: ['period'],
  defaultSize: { w: 8, h: 4 },
  minSize: { w: 5, h: 3 },
  async load({ filters, query }) {
    return query(['pl_control.parquet'], SQL, dateRange(filters));
  },
  option(rows) {
    const months = rows.map((r) => monthLabel(r.period));
    return {
      backgroundColor: 'transparent',
      animationDuration: 320,
      color: ['#5d9ffa', '#e96886', '#65dfb0'],
      grid: { left: 65, right: 50, top: 55, bottom: 40, containLabel: true },
      tooltip: {
        trigger: 'axis', backgroundColor: '#1c2c43', borderColor: '#43516d', textStyle: { color: '#eaf1fc' },
        valueFormatter: (value) => formatRubles(value)
      },
      legend: { top: 4, textStyle: { color: '#a5b6d1', fontSize: 10 }, data: ['Выручка', 'Опер. прибыль', 'Опер. маржа'] },
      xAxis: { type: 'category', data: months, axisLabel: { color: AXIS_COLOR, rotate: rows.length > 14 ? 45 : 0 }, axisLine: { lineStyle: { color: GRID_COLOR } } },
      yAxis: [
        { type: 'value', axisLabel: { color: AXIS_COLOR, formatter: (v) => Math.round(v / 1000000) + 'м' }, splitLine: { lineStyle: { color: GRID_COLOR } } },
        { type: 'value', axisLabel: { color: AXIS_COLOR, formatter: (v) => formatPercent(v) }, splitLine: { show: false } }
      ],
      series: [
        { name: 'Выручка', type: 'bar', barMaxWidth: 23, data: rows.map((r) => Number(r.net_revenue)), itemStyle: { borderRadius: [3, 3, 0, 0] } },
        { name: 'Опер. прибыль', type: 'bar', barMaxWidth: 23, data: rows.map((r) => Number(r.operating_profit)), itemStyle: { borderRadius: [3, 3, 0, 0] } },
        { name: 'Опер. маржа', type: 'line', yAxisIndex: 1, data: rows.map((r) => r.margin_pct == null ? null : Number(r.margin_pct)), smooth: true, showSymbol: false, lineStyle: { width: 2.5 }, tooltip: { valueFormatter: (v) => formatPercent(v) } }
      ]
    };
  }
};
