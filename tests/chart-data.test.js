import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { datasets, loadChartCatalog } from '../scripts/chart-datasets.mjs';
import { validateData, validateQuery } from '../src/shared/data/queryContract.js';
import { validateChart } from '../src/shared/charts/contract.js';

const data = {
  label: 'Выручка',
  sources: ['pl_control.parquet'],
  grain: 'период',
  dateRole: 'месяц признания',
  filters: [],
  limitation: 'Контрольные итоги.',
  fields: { amount: { label: 'Выручка', unit: 'rub' } },
};
const query = "SELECT SUM(net_revenue) AS amount FROM read_parquet('pl_control.parquet')";
const chart = {
  id: 'C91',
  title: 'Выручка',
  question: 'Какова выручка?',
  dataset: 'customRevenue',
  template: 'indicator',
  series: [{ field: 'amount' }],
  data,
};

test('a new chart is discovered using only its local JSON and SQL; changes stay isolated', () => {
  const root = mkdtempSync(join(tmpdir(), 'zetflix-chart-'));
  const dir = join(root, 'src/charts/C91-custom');
  try {
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(root, 'src/shared/data'), { recursive: true });
    writeFileSync(join(root, 'src/shared/data/sources.json'), JSON.stringify(data.sources));
    writeFileSync(join(dir, 'chart.json'), JSON.stringify(chart));
    writeFileSync(join(dir, 'query.sql'), query);
    const before = JSON.stringify(datasets);
    const catalog = loadChartCatalog(root).catalog;
    assert.equal(validateChart(chart, catalog).id, 'C91');
    assert.equal(catalog.customRevenue.sql, query);
    writeFileSync(join(dir, 'query.sql'), query.replace('SUM(', 'MAX('));
    assert.match(loadChartCatalog(root).catalog.customRevenue.sql, /MAX/);
    assert.equal(JSON.stringify(datasets), before);
    writeFileSync(join(dir, 'query.sql'), query + '; DROP TABLE x');
    assert.throws(() => loadChartCatalog(root), /один SELECT/);
    rmSync(join(dir, 'query.sql'));
    assert.throws(() => loadChartCatalog(root), /ENOENT/);
    symlinkSync(join(dir, 'chart.json'), join(dir, 'query.sql'));
    assert.throws(() => loadChartCatalog(root), /regular/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('all migrated charts preserve source metadata, filter parameters and local queries', () => {
  const { catalog, files } = loadChartCatalog();
  assert.equal(
    Object.keys(catalog).length,
    files.filter((file) => file.endsWith('chart.json')).length,
  );
  for (const file of files.filter((file) => file.endsWith('chart.json'))) {
    const definition = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(catalog[definition.dataset].fields, definition.data.fields);
    assert.deepEqual(catalog[definition.dataset].sources, definition.data.sources);
    assert.doesNotThrow(() => validateChart(definition));
  }
});

test('query policy handles comments, escaped literals and positional filter parameters', () => {
  assert.doesNotThrow(() => validateQuery(query + '; -- ? DROP TABLE x', data));
  assert.doesNotThrow(() =>
    validateQuery(
      "SELECT 'it''s ?; DROP' AS label, SUM(net_revenue) AS amount FROM read_parquet('pl_control.parquet')",
      data,
    ),
  );
  const filtered = {
    ...data,
    filters: ['period'],
    localFilters: [{ id: 'q', label: 'Квартал', options: [{ value: 'all', label: 'Все' }] }],
  };
  assert.doesNotThrow(() =>
    validateQuery(query + ' WHERE period BETWEEN ? AND ? AND ? = 1', filtered),
  );
  assert.throws(() => validateQuery(query, filtered), /параметров/);
  assert.throws(() => validateQuery(query + ' WHERE period = ?', data), /параметров/);
});

test('query policy rejects mutations, external sources, dynamic readers and unknown functions', () => {
  for (const sql of [
    query + '; SELECT 1',
    query + '; DROP TABLE x',
    'WITH x AS (DELETE FROM y RETURNING *) SELECT * FROM x',
    "SELECT * FROM read_csv('https://example.com/file')",
    "SELECT * FROM read_parquet('https://example.com/x.parquet')",
    "SELECT * FROM read_parquet('../pl_control.parquet')",
    "SELECT * FROM read_parquet(['pl_control.parquet'])",
    'SELECT * FROM read_parquet(?)',
    "SELECT * FROM 'pl_control.parquet'",
    query + ", 'https://example.com/x.parquet'",
    "SELECT * FROM read_parquet('pl_control.parquet', filename=true)",
    'SELECT * FROM "read_csv"(\'file.csv\')',
    "SELECT query('DROP TABLE x')",
    "SELECT current_setting('secret')",
    query + ' /* unclosed',
  ])
    assert.throws(() => validateQuery(sql, data), sql);
});

test('result metadata and filter definitions reject unsupported or executable options', () => {
  assert.doesNotThrow(() => validateData(data, data.sources));
  for (const changed of [
    { sources: ['missing.parquet'] },
    { filters: ['region'] },
    { fields: { amount: { label: 'Сумма', unit: 'html' } } },
    { fields: { amount: { label: 'Сумма', unit: 'rub', formatter: 'code' } } },
    { sql: 'SELECT 1' },
    { localFilters: [{ id: 'x', label: 'X', options: [] }] },
    {
      localFilters: [
        {
          id: 'x',
          label: 'X',
          options: [
            { value: 'a', label: 'A' },
            { value: 'a', label: 'B' },
          ],
        },
      ],
    },
  ])
    assert.throws(() => validateData({ ...data, ...changed }, data.sources));
});
