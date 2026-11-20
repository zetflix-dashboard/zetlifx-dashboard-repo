import { isNumeric } from './contract.js';
import { formatValue } from '../ui/format.js';
import { treeRows, treeHistory, treeSparkline } from './treeData.js';

export function treeOption(definition, rows, fields, theme, periods = null) {
  const { dimension, parent, pointLabel, description } = definition;
  const metric = definition.series[0].field;
  const unit = fields[metric].unit;
  const current = treeRows(definition, rows);
  const histories = treeHistory(definition, rows, periods || definition.trend?.periods || 12);
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
    );
  const nodes = new Map(
    current.map((row) => {
      const id = String(row[dimension]);
      const spark = treeSparkline(histories.get(id) || [], theme);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="216" height="108" viewBox="0 0 216 108"><rect x="1" y="1" width="214" height="106" rx="12" fill="${escape(theme.tooltip)}" stroke="${escape(theme.border)}"/><path d="${spark.path}" fill="none" stroke="${spark.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/><circle cx="196" cy="20" r="7" fill="none" stroke="${escape(theme.axis)}"/><text x="196" y="24" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${escape(theme.axis)}">i</text></svg>`;
      return [
        id,
        {
          name: String(row[pointLabel || dimension] ?? row[dimension]),
          value: row[metric] == null ? null : Number(row[metric]),
          description: description
            ? String(row[description] || 'Описание метрики не задано')
            : 'Описание метрики не задано',
          period: definition.trend ? row[definition.trend.period] : null,
          hasHistory: Boolean(spark.path),
          symbol: 'image://data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
          children: [],
        },
      ];
    }),
  );
  const root = current.find((row) => row[parent] === null);
  for (const row of current) {
    if (row[parent] !== null)
      nodes.get(String(row[parent])).children.push(nodes.get(String(row[dimension])));
  }
  let leaves = 0;
  let depth = 0;
  const measure = (node, level) => {
    depth = Math.max(depth, level);
    if (!node.children.length) leaves++;
    for (const child of node.children) measure(child, level + 1);
  };
  if (root) measure(nodes.get(String(root[dimension])), 0);
  const label = {
    position: 'inside',
    verticalAlign: 'top',
    offset: [-88, -37],
    align: 'left',
    formatter: ({ data }) => {
      // Plain text avoids interpreting user labels as ECharts rich-text markup.
      const name = data.name.length > 20 ? data.name.slice(0, 19) + '…' : data.name;
      return name + '\n' + formatValue(data.value, unit, true);
    },
    color: theme.text,
    fontSize: 14,
    lineHeight: 24,
    fontWeight: 600,
  };
  return {
    tooltip: {
      formatter: ({ data }) =>
        [
          data.name,
          formatValue(data.value, unit),
          data.description,
          ...(data.period ? ['Значение за ' + data.period.slice(0, 7)] : []),
          ...(!data.hasHistory ? ['Недостаточно истории для линии'] : []),
        ].join('\n'),
    },
    series: [
      {
        type: 'tree',
        data: root ? [nodes.get(String(root[dimension]))] : [],
        orient: 'TB',
        roam: 'move',
        expandAndCollapse: false,
        initialTreeDepth: -1,
        top: 68,
        left: 'center',
        width: Math.max(1, leaves) * 320,
        height: Math.max(1, depth) * 168,
        symbolSize: [216, 108],
        edgeShape: 'polyline',
        edgeForkPosition: '50%',
        lineStyle: { color: theme.border, width: 1.5 },
        label,
        leaves: { label },
        emphasis: { focus: 'ancestor' },
      },
    ],
  };
}

export function funnelOption(definition, rows, fields, theme) {
  const metric = definition.series[0].field;
  const unit = fields[metric].unit;
  const data = rows.map((row) => ({
    name: String(row[definition.dimension]),
    value: Number(row[metric]),
  }));
  return {
    tooltip: { valueFormatter: (value) => formatValue(value, unit) },
    series: [
      {
        type: 'funnel',
        sort: 'none',
        min: 0,
        max: Math.max(1, ...data.map(({ value }) => value)),
        minSize: '0%',
        left: '8%',
        width: '66%',
        top: 10,
        bottom: 10,
        gap: 3,
        label: { position: 'right', color: theme.text, overflow: 'truncate', width: 130 },
        itemStyle: { borderColor: theme.tooltip, borderWidth: 1 },
        data,
      },
    ],
  };
}

export function waterfallOption(definition, rows, fields, theme) {
  const { dimension, stepType } = definition;
  const metric = definition.series[0].field;
  const unit = fields[metric].unit;
  const colors = [theme.palette[0], theme.palette[1], theme.palette[4]];
  let balance = 0;
  const data = rows.map((row, index) => {
    const total = row[stepType] === 'total';
    const change = Number(row[metric]);
    const from = total ? 0 : balance;
    balance = total ? change : balance + change;
    return [index, from, balance, change, total ? 0 : change >= 0 ? 1 : 2];
  });

  return {
    grid: { left: 12, right: 16, top: 16, bottom: 12, containLabel: true },
    tooltip: {
      formatter: ({ value }) =>
        [String(rows[value[0]][dimension]), formatValue(value[3], unit)].join('\n'),
    },
    xAxis: {
      type: 'category',
      data: rows.map((row) => String(row[dimension])),
      axisLabel: { color: theme.axis, hideOverlap: true },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: theme.axis, formatter: (value) => formatValue(value, unit, true) },
      splitLine: { lineStyle: { color: theme.grid, type: 'dashed' } },
    },
    series: [
      {
        type: 'custom',
        name: fields[metric].label,
        encode: { x: 0, y: [1, 2] },
        data,
        renderItem: (_params, api) => {
          const index = api.value(0);
          const [x, start] = api.coord([index, api.value(1)]);
          const [, end] = api.coord([index, api.value(2)]);
          const width = Math.min(40, api.size([1, 0])[0] * 0.6);
          const bar = {
            type: 'rect',
            shape: {
              x: x - width / 2,
              y: Math.min(start, end),
              width,
              height: Math.max(1, Math.abs(start - end)),
            },
            style: { fill: colors[api.value(4)] },
          };
          if (index === 0) return bar;
          const [previousX, previousEnd] = api.coord([index - 1, data[index - 1][2]]);
          return {
            type: 'group',
            children: [
              {
                type: 'line',
                silent: true,
                shape: {
                  x1: previousX + width / 2,
                  y1: previousEnd,
                  x2: x - width / 2,
                  y2: previousEnd,
                },
                style: { stroke: theme.axis, lineDash: [3, 3] },
              },
              bar,
            ],
          };
        },
      },
    ],
  };
}

export function heatmapOption(definition, rows, fields, theme) {
  const { dimension, category } = definition;
  const metric = definition.series[0].field;
  const unit = fields[metric].unit;
  const axis = (field) => {
    const toKey = isNumeric(fields[field].unit) ? Number : String;
    const keys = [...new Set(rows.map((row) => toKey(row[field])))];
    return {
      labels: keys.map((value) => formatValue(value, fields[field].unit)),
      keys: new Map(keys.map((value, index) => [value, index])),
      toKey,
    };
  };
  const x = axis(dimension);
  const y = axis(category);
  const data = rows
    .filter((row) => row[metric] != null)
    .map((row) => [
      x.keys.get(x.toKey(row[dimension])),
      y.keys.get(y.toKey(row[category])),
      Number(row[metric]),
    ]);
  const values = data.map((cell) => cell[2]);
  const min = Math.min(0, ...values);
  return {
    grid: { left: 12, right: 16, top: 34, bottom: 8, containLabel: true },
    tooltip: {
      formatter: ({ value: [column, row, value] }) =>
        [y.labels[row] + ' · ' + x.labels[column], formatValue(value, unit)].join('\n'),
    },
    xAxis: {
      type: 'category',
      data: x.labels,
      axisLabel: { color: theme.axis, hideOverlap: true },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.border } },
      splitArea: { show: true, areaStyle: { color: [theme.grid, theme.grid] } },
    },
    yAxis: {
      type: 'category',
      data: y.labels,
      inverse: true,
      axisLabel: { color: theme.axis, hideOverlap: true },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.border } },
    },
    visualMap: {
      dimension: 2,
      min,
      max: Math.max(unit === 'percent' ? 100 : min + 1, ...values),
      orient: 'horizontal',
      top: 0,
      right: 12,
      itemWidth: 8,
      itemHeight: 80,
      textStyle: { color: theme.text },
      formatter: (value) => formatValue(value, unit, true),
      inRange: { color: [theme.tooltip, theme.palette[0]] },
    },
    series: [
      {
        type: 'heatmap',
        name: fields[metric].label,
        data,
        itemStyle: { borderColor: theme.border, borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: theme.text, borderWidth: 2 } },
      },
    ],
  };
}

export function sankeyOption(definition, rows, fields, theme, selectedSource = null) {
  const sourceField = definition.dimension;
  const targetField = definition.target;
  const metric = definition.series[0].field;
  const unit = fields[metric].unit;
  const sources = [...new Set(rows.map((row) => String(row[sourceField])))];
  const targets = [...new Set(rows.map((row) => String(row[targetField])))];
  const categories = [...new Set([...sources, ...targets])];
  const color = (name) => theme.palette[categories.indexOf(name) % theme.palette.length];
  const totals = (field, name) =>
    rows.reduce((total, row) => total + (String(row[field]) === name ? Number(row[metric]) : 0), 0);
  const active = selectedSource !== null && sources.includes(selectedSource);
  const nodes = [
    ...sources.map((name) => ({
      name: 'source:' + name,
      display: name,
      value: totals(sourceField, name),
      depth: 0,
      itemStyle: { color: color(name), opacity: active && selectedSource !== name ? 0.28 : 1 },
      label: { position: 'left' },
    })),
    ...targets.map((name) => ({
      name: 'target:' + name,
      display: name,
      value: totals(targetField, name),
      depth: 1,
      itemStyle: { color: color(name) },
      label: { position: 'right' },
    })),
  ];
  const links = rows.map((row) => {
    const from = String(row[sourceField]);
    const to = String(row[targetField]);
    return {
      source: 'source:' + from,
      target: 'target:' + to,
      from,
      to,
      value: Number(row[metric]),
      lineStyle: {
        color: color(from),
        opacity: active ? (from === selectedSource ? 0.72 : 0.035) : 0.3,
      },
    };
  });
  return {
    tooltip: {
      formatter: (params) => {
        const item = params.data;
        return 'from' in item
          ? item.from + ' → ' + item.to + '\\n' + formatValue(item.value, unit)
          : item.display + '\\n' + formatValue(item.value, unit);
      },
    },
    series: [
      {
        type: 'sankey',
        name: fields[metric].label,
        orient: 'horizontal',
        nodeAlign: 'justify',
        nodeWidth: 15,
        nodeGap: 12,
        layoutIterations: 32,
        draggable: false,
        left: '23%',
        right: '23%',
        top: 16,
        bottom: 12,
        data: nodes,
        links,
        label: {
          show: true,
          color: theme.text,
          fontSize: 11,
          overflow: 'truncate',
          width: 125,
          formatter: (params) => params.data.display,
        },
        lineStyle: { curveness: 0.45 },
        emphasis: { focus: 'adjacency' },
      },
    ],
  };
}
