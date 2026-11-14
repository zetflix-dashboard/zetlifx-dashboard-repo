import { datasets } from '../data/datasets.js';
import { formatValue } from '../ui/format.js';
export const PALETTE = Object.freeze([
  '#407bd0',
  '#278775',
  '#b67931',
  '#8865af',
  '#bf5760',
  '#507d88',
]);
export function chartTheme() {
  // Unit tests run without a DOM; browser rendering reads the same CSS tokens.
  const style =
    typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const token = (key, fallback) => style?.getPropertyValue(key).trim() || fallback;
  return {
    palette: token('--chart-palette', PALETTE.join(','))
      .split(',')
      .map((c) => c.trim()),
    text: token('--chart-text', '#475569'),
    axis: token('--chart-axis', '#64748b'),
    grid: token('--chart-grid', '#e9edf2'),
    tooltip: token('--chart-tooltip', '#ffffff'),
    tooltipText: token('--chart-tooltip-text', '#182333'),
    border: token('--chart-border', '#dce2e9'),
  };
}

export function buildOption(definition, rows, reducedMotion = false, theme = chartTheme()) {
  const fields = datasets[definition.dataset].fields;
  const units = [...new Set(definition.series.map((s) => fields[s.field].unit))];
  const scatter = definition.template === 'scatter';
  return {
    backgroundColor: 'transparent',
    color: theme.palette,
    animation: !reducedMotion,
    animationDuration: 200,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: theme.text },
    aria: { enabled: true, description: definition.question, decal: { show: true } },
    grid: { left: 12, right: 16, top: 50, bottom: 12, containLabel: true },
    legend: {
      type: 'scroll',
      top: 0,
      left: 8,
      right: 8,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: theme.text, fontSize: 12 },
    },
    tooltip: {
      trigger: scatter ? 'item' : 'axis',
      renderMode: 'richText',
      confine: true,
      backgroundColor: theme.tooltip,
      borderColor: theme.border,
      textStyle: { color: theme.tooltipText, fontSize: 12 },
    },
    xAxis: {
      type: scatter ? 'value' : 'category',
      data: scatter
        ? undefined
        : rows.map((r) => formatValue(r[definition.dimension], fields[definition.dimension].unit)),
      axisLabel: {
        color: theme.axis,
        hideOverlap: true,
        formatter: scatter
          ? (v) => formatValue(v, fields[definition.dimension].unit, true)
          : undefined,
      },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: units.map((unit, i) => ({
      type: 'value',
      name: unit === 'rub' ? '₽' : unit === 'percent' ? '%' : '',
      nameTextStyle: { color: theme.axis },
      axisLabel: { color: theme.axis, formatter: (v) => formatValue(v, unit, true) },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: i === 0, lineStyle: { color: theme.grid, type: 'dashed' } },
    })),
    series: definition.series.map((series, i) => {
      const unit = fields[series.field].unit;
      return {
        name: fields[series.field].label,
        type: series.type || definition.template,
        yAxisIndex: units.indexOf(unit),
        data: rows.map((r) => {
          const y = r[series.field] == null ? null : Number(r[series.field]);
          return scatter
            ? [r[definition.dimension] == null ? null : Number(r[definition.dimension]), y]
            : y;
        }),
        smooth: false,
        connectNulls: false,
        showSymbol: rows.length <= 12,
        symbolSize: scatter ? 9 : 5,
        lineStyle: { width: 2, type: i % 2 ? 'dashed' : 'solid' },
        barMaxWidth: 24,
        emphasis: { focus: 'series' },
        tooltip: {
          valueFormatter: (v) =>
            Array.isArray(v)
              ? v
                  .map((n, index) =>
                    formatValue(n, index ? unit : fields[definition.dimension].unit),
                  )
                  .join(' · ')
              : formatValue(v, unit),
        },
      };
    }),
  };
}
export function renderTable(container, definition, rows) {
  const fields = datasets[definition.dataset].fields;
  const columns = definition.columns || [
    definition.dimension,
    ...definition.series.map((s) => s.field),
  ];
  const table = document.createElement('table');
  table.className = 'data-table';
  const caption = table.createCaption();
  caption.textContent = definition.title;
  caption.className = 'sr-only';
  const header = table.createTHead().insertRow();
  for (const field of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = fields[field].label;
    header.append(th);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const field of columns) {
      const cell = tr.insertCell();
      cell.textContent = formatValue(row[field], fields[field].unit);
      if (!['month', 'text'].includes(fields[field].unit)) cell.className = 'numeric';
    }
  }
  container.replaceChildren(table);
}
