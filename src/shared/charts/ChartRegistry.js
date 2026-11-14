import { validateChart } from './contract.js';
const imports = import.meta.glob('../../charts/*/chart.json', { eager: true, import: 'default' });
const definitions = new Map();
for (const [path, raw] of Object.entries(imports)) {
  const chart = validateChart(raw);
  if (definitions.has(chart.id) || !path.split('/').at(-2).startsWith(chart.id + '-')) throw new Error('Повтор или несовпадение C-ID: ' + path);
  definitions.set(chart.id, Object.freeze({ ...chart, defaultSize: { w: 6, h: 5 }, minSize: { w: 4, h: 4 } }));
}
export const ChartRegistry = {
  get: id => definitions.get(id),
  has: id => definitions.has(id),
  list: () => [...definitions.values()].sort((a, b) => a.id.localeCompare(b.id)),
};
