import { datasets } from '../data/datasets.js';
import { isNumeric, tableFields } from './contract.js';
import { treeOption, waterfallOption, funnelOption, heatmapOption } from './specializedOptions.js';
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

const specializedOptions = {
  tree: treeOption,
  waterfall: waterfallOption,
  funnel: funnelOption,
  heatmap: heatmapOption,
};

export function buildOption(definition, rows, reducedMotion = false, theme = chartTheme()) {
  const fields = datasets[definition.dataset].fields;
  const specializedOption = specializedOptions[definition.template];
  if (specializedOption) {
    const { tooltip, ...option } = specializedOption(definition, rows, fields, theme);
    return {
      backgroundColor: 'transparent',
      color: theme.palette,
      animation: !reducedMotion,
      aria: { enabled: true, description: definition.question, decal: { show: true } },
      textStyle: { color: theme.text, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 },
      tooltip: {
        trigger: 'item',
        renderMode: 'richText',
        confine: true,
        backgroundColor: theme.tooltip,
        borderColor: theme.border,
        textStyle: { color: theme.tooltipText },
        ...tooltip,
      },
      ...option,
    };
  }
  const units = [...new Set(definition.series.map((s) => fields[s.field].unit))];
  const scatter = definition.template === 'scatter';
  if (definition.template === 'pie') {
    const metric = definition.series[0].field;
    const unit = fields[metric].unit;
    return {
      backgroundColor: 'transparent',
      color: theme.palette,
      animation: !reducedMotion,
      aria: { enabled: true, description: definition.question, decal: { show: true } },
      textStyle: { color: theme.text, fontFamily: 'Inter, system-ui, sans-serif' },
      tooltip: {
        trigger: 'item',
        renderMode: 'richText',
        confine: true,
        backgroundColor: theme.tooltip,
        borderColor: theme.border,
        textStyle: { color: theme.tooltipText },
        valueFormatter: (value) => formatValue(value, unit),
      },
      legend: { bottom: 2, textStyle: { color: theme.text } },
      series: [
        {
          name: fields[metric].label,
          type: 'pie',
          radius: ['45%', '71%'],
          center: ['50%', '44%'],
          label: { show: true, formatter: '{d}%', color: theme.text },
          itemStyle: { borderColor: theme.tooltip, borderWidth: 2 },
          data: rows.map((row) => ({
            name: String(row[definition.dimension]),
            value: Number(row[metric]),
          })),
        },
      ],
    };
  }
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
            ? {
                name: definition.pointLabel
                  ? String(r[definition.pointLabel])
                  : fields[series.field].label,
                value: [
                  r[definition.dimension] == null ? null : Number(r[definition.dimension]),
                  y,
                ],
              }
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
const collator = new Intl.Collator('ru', { numeric: true });

function compareCells(a, b, unit, direction) {
  const missingA = a == null || a === '';
  const missingB = b == null || b === '';
  if (missingA || missingB) return Number(missingA) - Number(missingB);
  const order = isNumeric(unit) ? Number(a) - Number(b) : collator.compare(a, b);
  return direction === 'ascending' ? order : -order;
}

export function renderTable(container, definition, rows, sort = {}) {
  const fields = datasets[definition.dataset].fields;
  const columns = tableFields(definition);
  const table = document.createElement('table');
  table.className = 'data-table';
  const caption = table.createCaption();
  caption.textContent = definition.title;
  caption.className = 'sr-only';
  const header = table.createTHead().insertRow();
  const headings = new Map();
  for (const field of columns) {
    const th = document.createElement('th');
    th.scope = 'col';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-sort';
    const label = document.createElement('span');
    label.textContent = fields[field].label;
    const indicator = document.createElement('span');
    indicator.className = 'table-sort-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    button.append(label, indicator);
    button.addEventListener('click', () => {
      sort.direction =
        sort.field === field && sort.direction === 'ascending' ? 'descending' : 'ascending';
      sort.field = field;
      applySort();
    });
    th.append(button);
    header.append(th);
    headings.set(field, th);
  }

  const bars = definition.columnBars || [];
  const maxima = new Map(
    bars.map((field) => [field, Math.max(0, ...rows.map((row) => Number(row[field]) || 0))]),
  );
  const body = table.createTBody();
  const entries = rows.map((row) => {
    const tr = body.insertRow();
    for (const field of columns) {
      const cell = tr.insertCell();
      cell.textContent = formatValue(row[field], fields[field].unit);
      if (isNumeric(fields[field].unit)) cell.className = 'numeric';
      if (bars.includes(field)) {
        const max = maxima.get(field);
        const value = Number(row[field]);
        const width =
          max && Number.isFinite(value) ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
        cell.classList.add('cell-bar');
        cell.dataset.barIndex = String(bars.indexOf(field));
        cell.style.setProperty('--bar-width', width + '%');
      }
    }
    return { row, tr };
  });
  if (definition.totals?.length && rows.length) {
    const footer = table.createTFoot().insertRow();
    footer.className = 'data-table-totals';
    for (const field of columns) {
      const cell = footer.insertCell();
      if (field === columns[0]) {
        cell.textContent = 'Итого';
        cell.className = 'total-label';
      } else if (definition.totals.includes(field)) {
        const sum = rows.reduce((acc, row) => {
          const value = row[field];
          return value == null ? acc : acc + Number(value);
        }, 0);
        cell.textContent = formatValue(sum, fields[field].unit);
        cell.className = 'numeric';
      } else {
        cell.textContent = '—';
      }
    }
  }

  function applySort() {
    const { field, direction } = sort;
    for (const [key, heading] of headings) {
      if (key === field) heading.setAttribute('aria-sort', direction);
      else heading.removeAttribute('aria-sort');
    }
    const sorted = [...entries].sort((a, b) =>
      compareCells(a.row[field], b.row[field], fields[field].unit, direction),
    );
    body.replaceChildren(...sorted.map(({ tr }) => tr));
  }
  if (headings.has(sort.field)) applySort();
  container.replaceChildren(table);
}
