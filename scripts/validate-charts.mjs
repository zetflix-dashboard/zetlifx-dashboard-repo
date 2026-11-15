import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateChart } from '../src/shared/charts/contract.js';
const root = resolve('src/charts');
const ids = new Set();
const refs = new Set();
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name === 'AGENTS.md') continue;
  if (!entry.isDirectory() || !/^C\d{2}-[a-z0-9][a-z0-9-]*$/.test(entry.name))
    throw new Error('Invalid chart directory: ' + entry.name);
  for (const name of readdirSync(resolve(root, entry.name))) {
    const stat = lstatSync(resolve(root, entry.name, name));
    if (
      !['chart.json', 'README.md'].includes(name) ||
      !stat.isFile() ||
      stat.mode & 0o111 ||
      stat.size > 30000
    )
      throw new Error('Only small regular JSON/Markdown chart files are permitted: ' + name);
  }
  const definition = validateChart(
    JSON.parse(readFileSync(resolve(root, entry.name, 'chart.json'), 'utf8')),
  );
  if (!entry.name.startsWith(definition.id + '-') || ids.has(definition.id))
    throw new Error('Duplicate or mismatched C-ID');
  const ref = entry.name.slice(definition.id.length + 1);
  if (refs.has(ref)) throw new Error('Duplicate chart reference: ' + ref);
  refs.add(ref);
  ids.add(definition.id);
}
console.log('Validated ' + ids.size + ' declarative charts');
