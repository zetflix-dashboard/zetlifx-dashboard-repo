import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { validateChart } from '../src/shared/charts/contract.js';
import {
  WORKSPACE_PATH,
  validatePublishedWorkspace,
  MAX_WORKSPACE_BYTES,
} from '../src/layout/PublishedWorkspace.js';

const charts = new Map();
for (const entry of readdirSync('src/charts', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const chart = validateChart(
    JSON.parse(readFileSync('src/charts/' + entry.name + '/chart.json', 'utf8')),
  );
  charts.set(chart.id, chart);
}
const stat = lstatSync(WORKSPACE_PATH);
if (!stat.isFile() || stat.mode & 0o111 || stat.size > MAX_WORKSPACE_BYTES)
  throw new Error('The published layout must be a regular JSON file under 1 MB');
const raw = JSON.parse(readFileSync(WORKSPACE_PATH, 'utf8'));
validatePublishedWorkspace(raw, (id) => charts.get(id));

console.log('Validated published workspace');
