import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData, validateQuery } from '../src/shared/data/queryContract.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function loadChartCatalog(root = projectRoot) {
  const charts = resolve(root, 'src/charts');
  const sources = JSON.parse(readFileSync(resolve(root, 'src/shared/data/sources.json'), 'utf8'));
  const catalog = Object.create(null);
  const files = [];
  const ids = new Set();
  for (const entry of readdirSync(charts, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'AGENTS.md') continue;
    if (!entry.isDirectory() || !/^C\d{2}-[a-z0-9][a-z0-9-]*$/.test(entry.name))
      throw new Error('Invalid chart directory: ' + entry.name);
    const directory = resolve(charts, entry.name);
    for (const name of readdirSync(directory)) {
      const file = resolve(directory, name);
      const stat = lstatSync(file);
      if (
        !['chart.json', 'query.sql', 'README.md'].includes(name) ||
        !stat.isFile() ||
        stat.mode & 0o111 ||
        stat.size > 30000
      )
        throw new Error('Only small regular JSON/SQL/Markdown chart files are permitted: ' + file);
      files.push(file);
    }
    const chart = JSON.parse(readFileSync(resolve(directory, 'chart.json'), 'utf8'));
    if (
      !/^C\d{2}$/.test(chart.id) ||
      ids.has(chart.id) ||
      !entry.name.startsWith(chart.id + '-') ||
      typeof chart.dataset !== 'string' ||
      !/^[a-z][a-zA-Z0-9_]{0,59}$/.test(chart.dataset) ||
      ['constructor', 'prototype', '__proto__'].includes(chart.dataset) ||
      Object.hasOwn(catalog, chart.dataset)
    )
      throw new Error('Нужны уникальные C-ID и имя источника графика');
    ids.add(chart.id);
    const data = validateData(chart.data, sources);
    const sql = validateQuery(readFileSync(resolve(directory, 'query.sql'), 'utf8'), data);
    catalog[chart.dataset] = { ...data, sql };
  }
  return { catalog: Object.freeze(catalog), files };
}
export const datasets = loadChartCatalog().catalog;
