import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateChart, validateRows } from '../src/shared/charts/contract.js';
import { buildOption, PALETTE } from '../src/shared/charts/templates.js';
import { formatValue } from '../src/shared/ui/format.js';
const base = JSON.parse(
  readFileSync(new URL('../src/charts/C03-financial-trend/chart.json', import.meta.url)),
);
const row = { period: '2024-01-01', net_revenue: 100, operating_profit: 0, margin_pct: null };
test('validates all supported templates with one shared contract', () => {
  for (const template of ['line', 'bar', 'combo']) {
    const chart = {
      ...base,
      template,
      series: [{ field: 'net_revenue', ...(template === 'combo' ? { type: 'bar' } : {}) }],
    };
    assert.equal(validateChart(chart).template, template);
  }
  assert.equal(
    validateChart({
      ...base,
      template: 'scatter',
      dimension: 'net_revenue',
      series: [{ field: 'operating_profit' }],
    }).template,
    'scatter',
  );
  assert.equal(
    validateChart({
      id: base.id,
      title: base.title,
      question: base.question,
      dataset: base.dataset,
      template: 'table',
      columns: ['period', 'net_revenue'],
    }).template,
    'table',
  );
});
test('rejects arbitrary options, styles, executable hooks, unknown sources/fields and unsupported charts', () => {
  for (const extra of [
    { option: {} },
    { css: 'body{}' },
    { load: 'code' },
    { template: 'sankey' },
    { dataset: '__proto__' },
    { dimension: 'unknown' },
    { series: [{ field: 'missing' }] },
    { series: [{ field: 'period', type: 'bar' }] },
  ])
    assert.throws(() => validateChart({ ...base, ...extra }));
  assert.throws(() =>
    validateChart({ ...base, template: 'scatter', series: [{ field: 'net_revenue' }] }),
  );
  assert.throws(() =>
    validateChart({ ...base, series: [{ field: 'net_revenue', type: 'custom' }] }),
  );
});
test('templates preserve null, zero, negative values and common palette', () => {
  const option = buildOption(base, [row, { ...row, operating_profit: -12 }], true);
  assert.equal(option.animation, false);
  assert.deepEqual(option.color, PALETTE);
  assert.deepEqual(option.series[1].data, [0, -12]);
  assert.deepEqual(option.series[2].data, [null, null]);
  assert.equal(option.series[2].connectNulls, false);
  assert.equal(option.series[2].smooth, false);
  assert.equal(option.tooltip.renderMode, 'richText');
  assert.equal(formatValue(null, 'percent'), '—');
  assert.equal(formatValue(0, 'percent'), '0%');
});
test('result validation catches schema drift, non-numbers and oversized result sets', () => {
  assert.deepEqual(validateRows([row], base), [row]);
  assert.throws(() => validateRows([{}], base));
  assert.throws(() => validateRows([{ ...row, net_revenue: Infinity }], base));
  assert.throws(() => validateRows(Array(5001).fill(row), base));
});

test('C14, C15 and C20 use the shared declarative contract', () => {
  const ids = ['C14-cost-scatter', 'C15-original-share', 'C20-rfm'];
  for (const id of ids) {
    const chart = JSON.parse(
      readFileSync(new URL('../src/charts/' + id + '/chart.json', import.meta.url)),
    );
    assert.equal(validateChart(chart).id, id.slice(0, 3));
    if (chart.id === 'C15') {
      const option = buildOption(chart, [
        { origin: 'Оригинал', hours: 75 },
        { origin: 'Лицензия', hours: 25 },
      ], true);
      assert.equal(option.series[0].type, 'pie');
      assert.deepEqual(option.series[0].data.map((d) => d.value), [75, 25]);
    }
    if (chart.id === 'C14') {
      const option = buildOption(chart, [
        { title: 'Тестовый тайтл', hours: 200, cost_per_hour: 35 },
      ], true);
      assert.equal(option.series[0].data[0].name, 'Тестовый тайтл');
      assert.deepEqual(option.series[0].data[0].value, [200, 35]);
    }
    if (chart.id === 'C20') {
      assert.ok(chart.columnBars.every((field) => chart.columns.includes(field)));
      assert.throws(() => validateChart({ ...chart, columnBars: ['segment'] }));
    }
  }
});
test('donut and scatter reject invalid categories or extra executable fields', () => {
  const pie = JSON.parse(readFileSync(new URL('../src/charts/C15-original-share/chart.json', import.meta.url)));
  const scatter = JSON.parse(readFileSync(new URL('../src/charts/C14-cost-scatter/chart.json', import.meta.url)));
  assert.throws(() => validateChart({ ...pie, dimension: 'hours' }));
  assert.throws(() => validateChart({ ...scatter, pointLabel: 'hours' }));
  assert.throws(() => validateChart({ ...pie, options: { color: 'red' } }));
});
