// Monthly history is optional; legacy trees still contain exactly one row per node.
export function treeRows(definition, rows) {
  if (!definition.trend) return rows;
  const latest = new Map();
  for (const row of rows) {
    const id = String(row[definition.dimension]);
    if (!latest.has(id) || row[definition.trend.period] > latest.get(id)[definition.trend.period])
      latest.set(id, row);
  }
  return [...latest.values()];
}

export function treeHistory(definition, rows, periods = definition.trend?.periods || 12) {
  if (!definition.trend || !rows.length) return new Map();
  const { period } = definition.trend;
  const metric = definition.series[0].field;
  const monthIndex = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
  const end = Math.max(...rows.map((row) => monthIndex(row[period])));
  const histories = new Map();
  for (const row of rows) {
    const id = String(row[definition.dimension]);
    if (!histories.has(id)) histories.set(id, Array(periods).fill(null));
    const index = monthIndex(row[period]) - end + periods - 1;
    if (index >= 0 && index < periods)
      histories.get(id)[index] = row[metric] == null ? null : Number(row[metric]);
  }
  return histories;
}

export function treeSparkline(values, theme) {
  const observed = values.filter((value) => value !== null);
  if (observed.length < 2) return { path: '', color: theme.axis };
  const min = Math.min(...observed);
  const range = Math.max(...observed) - min;
  let connected = false;
  const path = values
    .map((value, index) => {
      if (value === null) {
        connected = false;
        return '';
      }
      const command = connected ? 'L' : 'M';
      connected = true;
      const x = 14 + (index / Math.max(1, values.length - 1)) * 188;
      const y = range ? 94 - ((value - min) / range) * 26 : 81;
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const delta = observed.at(-1) - observed[0];
  const rgb = /^#([0-9a-f]{6})$/i.exec(theme.tooltip)?.[1] || 'ffffff';
  const dark =
    [0, 2, 4].reduce((sum, offset) => sum + parseInt(rgb.slice(offset, offset + 2), 16), 0) < 384;
  return {
    path,
    color:
      delta === 0
        ? theme.axis
        : delta > 0
          ? dark
            ? '#56cda3'
            : '#16815d'
          : dark
            ? '#f1848e'
            : '#c54656',
  };
}
