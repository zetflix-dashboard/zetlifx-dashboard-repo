import { validateChart } from './contract.js';
const imports = import.meta.glob('../../charts/*/chart.json', { eager: true, import: 'default' });
const definitions = new Map();
const refs = new Set();
for (const [path, raw] of Object.entries(imports)) {
  const chart = validateChart(raw);
  const directory = path.split('/').at(-2);
  if (definitions.has(chart.id) || !directory.startsWith(chart.id + '-'))
    throw new Error('Повтор или несовпадение C-ID: ' + path);
  const ref = directory.slice(chart.id.length + 1);
  if (refs.has(ref)) throw new Error('Повтор ID графика: ' + ref);
  refs.add(ref);
  definitions.set(
    chart.id,
    Object.freeze({
      ...chart,
      ref,
      defaultSize:
        chart.template === 'table'
          ? { w: 12, h: 8 }
          : chart.template === 'sankey'
            ? { w: 12, h: 7 }
            : chart.template === 'indicator'
              ? { w: 4, h: 2 }
              : { w: 6, h: 5 },
      minSize:
        chart.template === 'indicator'
          ? { w: 3, h: 2 }
          : chart.template === 'sankey'
            ? { w: 6, h: 5 }
            : { w: 4, h: 4 },
    }),
  );
}
export const ChartRegistry = {
  get: (id) => definitions.get(id),
  has: (id) => definitions.has(id),
  list: () => [...definitions.values()].sort((a, b) => a.id.localeCompare(b.id)),
};
