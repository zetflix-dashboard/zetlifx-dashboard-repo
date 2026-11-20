import assert from 'node:assert/strict';
import { treeHistory, treeRows, treeSparkline } from '../src/shared/charts/treeData.js';
import test from 'node:test';
import * as echarts from 'echarts';
import { tableFields, validateChart, validateRows } from '../src/shared/charts/contract.js';
import { chartTheme, indicatorValue } from '../src/shared/charts/templates.js';
import {
  treeOption,
  waterfallOption,
  funnelOption,
  heatmapOption,
  sankeyOption,
} from '../src/shared/charts/specializedOptions.js';

const fields = {
  label: { label: 'Категория', unit: 'text' },
  parent: { label: 'Родитель', unit: 'text' },
  to: { label: 'Сегмент на конец периода', unit: 'text' },
  step: { label: 'Тип шага', unit: 'text' },
  amount: { label: 'Сумма', unit: 'rub' },
  cohort: { label: 'Когорта', unit: 'month' },
  age: { label: 'Месяц жизни', unit: 'number' },
  retention: { label: 'Удержание', unit: 'percent' },
};
const catalog = { sample: { fields } };
const base = {
  id: 'C01',
  title: 'Тестовый график',
  question: 'Вопрос?',
  dataset: 'sample',
  dimension: 'label',
  series: [{ field: 'amount' }],
};

function render(definition, rows, buildOption) {
  validateChart(definition, catalog);
  validateRows(rows, definition, catalog);
  const option = buildOption(definition, rows, fields, chartTheme());
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 620, height: 380 });
  try {
    chart.setOption({ ...option, animation: false });
    return { option, svg: chart.renderToSVGString() };
  } finally {
    chart.dispose();
  }
}

test('tree renders a single hierarchy with signed values and rejects missing parents and cycles', () => {
  const definition = { ...base, template: 'tree', parent: 'parent' };
  const rows = [
    { label: 'Расходы', parent: 'Прибыль', amount: -40 },
    { label: 'Прибыль', parent: null, amount: 60 },
  ];
  const { svg, option } = render(definition, rows, treeOption);
  assert.match(svg, /Расходы/);
  assert.equal(option.series[0].data[0].children[0].value, -40);
  assert.throws(
    () => validateRows([{ ...rows[0], parent: 'missing' }, rows[1]], definition, catalog),
    /родителя/,
  );
  assert.throws(
    () => validateRows([{ ...rows[0], parent: rows[0].label }, rows[1]], definition, catalog),
    /цикл/,
  );
});

test('waterfall shows signed changes across zero and draws an independent closing total', () => {
  const definition = { ...base, template: 'waterfall', stepType: 'step' };
  const rows = [
    { label: '2024', step: 'total', amount: 100 },
    { label: 'Расходы', step: 'delta', amount: -125 },
    { label: 'Реклама', step: 'delta', amount: 10 },
    { label: '2025', step: 'total', amount: -15 },
  ];
  const { svg, option } = render(definition, rows, waterfallOption);
  assert.match(svg, /2025/);
  assert.match(svg, /stroke-dasharray="3,3"/);
  assert.deepEqual(
    option.series[0].data.map((step) => step.slice(1, 3)),
    [
      [0, 100],
      [100, -25],
      [-25, -15],
      [0, -15],
    ],
  );
  assert.throws(() => validateRows(rows.slice(0, -1), definition, catalog), /конечный итог/);
  assert.throws(() => validateChart({ ...definition, stepType: 'amount' }, catalog));
});

test('funnel honors source order and zero stage sizes', () => {
  const definition = { ...base, template: 'funnel' };
  const rows = [
    { label: 'Регистрация', amount: 100 },
    { label: 'Оплата', amount: 20 },
    { label: 'Продление', amount: 0 },
  ];
  const { svg, option } = render(definition, rows, funnelOption);
  assert.match(svg, /Оплата/);
  assert.equal(option.series[0].sort, 'none');
  assert.deepEqual(
    option.series[0].data.map(({ value }) => value),
    [100, 20, 0],
  );
  assert.throws(() => validateRows([{ ...rows[0], amount: -1 }], definition, catalog));
});

test('cohort heatmap preserves NULL slots, retains observed zeroes and rejects duplicate cells', () => {
  const definition = {
    ...base,
    template: 'heatmap',
    dimension: 'age',
    category: 'cohort',
    series: [{ field: 'retention' }],
  };
  const rows = [
    { age: 0, cohort: '2025-11-01', retention: 100 },
    { age: 1, cohort: '2025-11-01', retention: 0 },
    { age: 0, cohort: '2025-12-01', retention: 100 },
    { age: 1, cohort: '2025-12-01', retention: null },
  ];
  const { svg, option } = render(definition, rows, heatmapOption);
  assert.match(svg, /12\.25/);
  assert.deepEqual(option.series[0].data, [
    [0, 0, 100],
    [1, 0, 0],
    [0, 1, 100],
  ]);
  assert.deepEqual(tableFields(definition), ['age', 'cohort', 'retention']);
  assert.throws(() => validateRows([...rows, rows[0]], definition, catalog), /уникальны/);
  assert.throws(() => validateChart({ ...definition, parent: 'parent' }, catalog));
});

test('indicator requires explicit aggregation for multirow inputs and preserves zero/NULL', () => {
  const definition = {
    id: 'C01',
    title: 'Выручка за период',
    question: 'Сколько за период?',
    dataset: 'sample',
    template: 'indicator',
    series: [{ field: 'amount' }],
    aggregation: 'sum',
  };
  assert.equal(validateChart(definition, catalog).template, 'indicator');
  const rows = [{ amount: 0 }, { amount: null }, { amount: 1500 }];
  assert.deepEqual(validateRows(rows, definition, catalog), rows);
  assert.equal(indicatorValue(definition, rows), 1500);
  assert.equal(indicatorValue({ ...definition, aggregation: 'avg' }, rows), 750);
  assert.equal(indicatorValue({ ...definition, aggregation: 'min' }, rows), 0);
  assert.equal(indicatorValue({ ...definition, aggregation: 'max' }, rows), 1500);
  assert.equal(indicatorValue(definition, [{ amount: null }]), null);
  assert.throws(() => validateRows(rows, { ...definition, aggregation: undefined }, catalog));
  assert.throws(() => validateChart({ ...definition, aggregation: 'eval' }, catalog));
  assert.throws(() => validateChart({ ...definition, dimension: 'label' }, catalog));
  assert.throws(
    () => validateChart({ ...definition, series: [{ field: 'retention' }] }, catalog),
    /суммировать/,
  );
});

test('sankey renders separate sides and selected-source focus without falsifying flows', () => {
  const definition = {
    ...base,
    template: 'sankey',
    target: 'to',
    sourceTitle: 'Январь 2024',
    targetTitle: 'Декабрь 2025',
  };
  const rows = [
    { label: 'Приток', to: 'Новые', amount: 30 },
    { label: 'Приток', to: 'Потерянные', amount: 10 },
    { label: 'Новые', to: 'Новые', amount: 5 },
  ];
  const { option, svg } = render(definition, rows, sankeyOption);
  assert.equal(option.series[0].type, 'sankey');
  assert.equal(option.series[0].data.length, 4);
  assert.match(svg, /Приток/);
  assert.deepEqual(tableFields(definition), ['label', 'to', 'amount']);
  assert.deepEqual(
    option.series[0].links.map((link) => link.value),
    [30, 10, 5],
  );
  assert.notEqual(option.series[0].links[0].source, option.series[0].links[0].target);
  const selected = sankeyOption(definition, rows, fields, chartTheme(), 'Приток');
  assert.equal(selected.series[0].links[0].lineStyle.opacity, 0.72);
  assert.equal(selected.series[0].links[2].lineStyle.opacity, 0.035);
  assert.throws(() => validateRows([...rows, rows[0]], definition, catalog), /уникальны/);
  assert.throws(
    () => validateRows([{ label: 'Приток', to: 'Новые', amount: -1 }], definition, catalog),
    /неотрицательные/,
  );
  assert.throws(() => validateChart({ ...definition, target: 'amount' }, catalog));
  assert.throws(() => validateChart({ ...definition, sourceTitle: 'x'.repeat(61) }, catalog));
  assert.throws(() => validateChart({ ...definition, html: '<svg></svg>' }, catalog));
});

test('tree tiles support monthly history, descriptions and configurable windows without changing snapshot trees', () => {
  const definition = {
    ...base,
    template: 'tree',
    parent: 'parent',
    description: 'to',
    trend: { period: 'cohort', periods: 3 },
  };
  const rows = [
    { label: 'Прибыль', parent: null, amount: 0, cohort: '2025-01-01', to: 'Доходы минус расходы' },
    {
      label: 'Прибыль',
      parent: null,
      amount: 60,
      cohort: '2025-03-01',
      to: 'Доходы минус расходы',
    },
    {
      label: 'Расходы',
      parent: 'Прибыль',
      amount: -40,
      cohort: '2025-03-01',
      to: 'Затраты за месяц',
    },
    {
      label: 'Расходы',
      parent: 'Прибыль',
      amount: -20,
      cohort: '2025-01-01',
      to: 'Затраты за месяц',
    },
  ];
  const { option, svg } = render(definition, rows, treeOption);
  const series = option.series[0];
  assert.equal(series.orient, 'TB');
  assert.equal(series.roam, 'move');
  assert.equal(series.expandAndCollapse, false);
  assert.equal(series.data[0].value, 60);
  assert.deepEqual(series.symbolSize, [216, 108]);
  assert.match(decodeURIComponent(series.data[0].symbol), /<rect.*rx="12"/);
  assert.match(decodeURIComponent(series.data[0].symbol), /<text.*>i<\/text>/);
  assert.match(option.tooltip.formatter({ data: series.data[0] }), /Доходы минус расходы/);
  assert.match(svg, /Прибыль/);
  assert.deepEqual(treeHistory(definition, rows).get('Прибыль'), [0, null, 60]);
  assert.deepEqual(treeHistory(definition, rows, 2).get('Прибыль'), [null, 60]);
  assert.equal(
    treeRows(definition, [...rows].reverse()).find((row) => row.label === 'Прибыль').amount,
    60,
  );
  assert.deepEqual(tableFields(definition), ['label', 'parent', 'to', 'cohort', 'amount']);
  assert.throws(() => validateRows([...rows, rows[0]], definition, catalog), /уникальны/);
  assert.throws(
    () => validateRows([{ ...rows[0], cohort: '2025-13-01' }], definition, catalog),
    /дату/,
  );
  assert.throws(() => validateRows([{ ...rows[0], cohort: null }], definition, catalog));
  assert.throws(
    () => validateRows([rows[0], { ...rows[1], parent: 'Расходы' }, rows[2]], definition, catalog),
    /Родитель/,
  );
  assert.throws(() => validateChart({ ...definition, description: 'amount' }, catalog), /Описание/);
  for (const trend of [
    { period: 'label', periods: 3 },
    { period: 'cohort', periods: 0 },
    { period: 'cohort', periods: 25 },
    { period: 'cohort', periods: 3, code: 'x' },
  ])
    assert.throws(() => validateChart({ ...definition, trend }, catalog));
  assert.throws(
    () =>
      validateChart(
        { ...definition, template: 'line', parent: undefined, description: undefined },
        catalog,
      ),
    /только дерев/,
  );
});

test('tree sparklines distinguish growth, decline and flat values, preserve gaps and never fabricate history', () => {
  const theme = chartTheme();
  assert.equal(treeSparkline([], theme).path, '');
  assert.equal(treeSparkline([null, 0], theme).path, '');
  const up = treeSparkline([0, 5, 10], theme);
  const down = treeSparkline([10, 5, 0], theme);
  const flat = treeSparkline([0, 0], theme);
  assert.notEqual(up.color, down.color);
  assert.equal(flat.color, theme.axis);
  assert.doesNotMatch(flat.path, /NaN|Infinity/);
  const gap = treeSparkline([0, null, 10], theme);
  assert.equal((gap.path.match(/M/g) || []).length, 2);
  assert.doesNotMatch(gap.path, /L/);
  assert.notEqual(treeSparkline([0, 1], { ...theme, tooltip: '#1c2025' }).color, up.color);
  const definition = { ...base, template: 'tree', parent: 'parent' };
  const option = treeOption(
    definition,
    [{ label: 'Ноль', parent: null, amount: 0 }],
    fields,
    theme,
  );
  assert.equal(option.series[0].data[0].value, 0);
  assert.equal(option.series[0].data[0].hasHistory, false);
});
