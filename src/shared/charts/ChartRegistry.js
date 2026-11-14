const imports = import.meta.glob('../../charts/*/index.js', { eager: true });
const definitions = new Map();

for (const entry of Object.values(imports)) {
  const chart = entry.default;
  if (!chart || !/^C\d{2}$/.test(chart.id) || definitions.has(chart.id)) {
    throw new Error('График без корректного уникального C-ID');
  }
  for (const field of ['title', 'subtitle', 'load', 'option']) {
    if (!chart[field]) throw new Error('У ' + chart.id + ' отсутствует ' + field);
  }
  definitions.set(chart.id, chart);
}

export const ChartRegistry = {
  get(id) { return definitions.get(id); },
  list() { return Array.from(definitions.values()).sort((a, b) => a.id.localeCompare(b.id)); },
  has(id) { return definitions.has(id); },
};
