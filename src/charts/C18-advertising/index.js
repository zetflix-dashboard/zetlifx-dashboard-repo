import { dateRange } from '../../shared/filters/FilterStore.js';
import { AXIS_COLOR, GRID_COLOR, formatPercent, formatRubles, monthLabel } from '../../shared/ui/format.js';

const SQL = [
  "WITH ads AS (",
  "  SELECT period, SUM(revenue) AS revenue, SUM(impressions) AS impressions",
  "  FROM read_parquet('ad_revenue.parquet') GROUP BY period",
  ")",
  "SELECT",
  "  CAST(i.period AS VARCHAR) AS period,",
  "  CAST(100.0 * i.sold_impressions / NULLIF(i.available_impressions, 0) AS DOUBLE) AS fill_pct,",
  "  CAST(1000.0 * a.revenue / NULLIF(a.impressions, 0) AS DOUBLE) AS ecpm",
  "FROM read_parquet('ad_inventory.parquet') AS i",
  "LEFT JOIN ads AS a USING (period)",
  "WHERE i.period >= CAST(? AS DATE) AND i.period <= CAST(? AS DATE)",
  "ORDER BY i.period"
].join('\n');

export default {
  id: 'C18',
  title: 'Эффективность рекламы',
  subtitle: 'C18 · Заполняемость и eCPM · Ad_Inventory + Ad_Revenue',
  supportedFilters: ['period'],
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 4, h: 3 },
  async load({ filters, query }) {
    return query(['ad_inventory.parquet', 'ad_revenue.parquet'], SQL, dateRange(filters));
  },
  option(rows) {
    return {
      backgroundColor: 'transparent',
      animationDuration: 320,
      color: ['#4ecfb9', '#f6bc61'],
      grid: { left: 40, right: 55, top: 62, bottom: 52, containLabel: true },
      legend: { top: 2, textStyle: { color: '#a5b6d1', fontSize: 10 }, data: ['Заполняемость', 'eCPM'] },
      tooltip: { trigger: 'axis', backgroundColor: '#1c2c43', borderColor: '#43516d', textStyle: { color: '#eaf1fc' } },
      xAxis: { type: 'category', data: rows.map((r) => monthLabel(r.period)), axisLabel: { color: AXIS_COLOR, rotate: rows.length > 12 ? 50 : 0 }, axisLine: { lineStyle: { color: GRID_COLOR } } },
      yAxis: [
        { type: 'value', min: 0, max: 100, axisLabel: { color: AXIS_COLOR, formatter: (v) => v + '%' }, splitLine: { lineStyle: { color: GRID_COLOR } } },
        { type: 'value', axisLabel: { color: AXIS_COLOR, formatter: (v) => Math.round(v) + ' ₽' }, splitLine: { show: false } }
      ],
      series: [
        { name: 'Заполняемость', type: 'line', smooth: true, showSymbol: false, lineStyle: { width: 3 }, data: rows.map((r) => r.fill_pct == null ? null : Number(r.fill_pct)), tooltip: { valueFormatter: (v) => formatPercent(v) } },
        { name: 'eCPM', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, lineStyle: { width: 2 }, data: rows.map((r) => r.ecpm == null ? null : Number(r.ecpm)), tooltip: { valueFormatter: (v) => formatRubles(v) } }
      ]
    };
  }
};
