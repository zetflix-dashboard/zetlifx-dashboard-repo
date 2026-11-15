import assert from 'node:assert/strict';
import test from 'node:test';
import * as echarts from 'echarts';
import { tableFields, validateChart, validateRows } from '../src/shared/charts/contract.js';
import { chartTheme } from '../src/shared/charts/templates.js';
import {
  treeOption,
  waterfallOption,
  funnelOption,
  heatmapOption,
} from '../src/shared/charts/specializedOptions.js';

const fields = {
  label: { label: 'Категория', unit: 'text' },
  parent: { label: 'Родитель', unit: 'text' },
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
