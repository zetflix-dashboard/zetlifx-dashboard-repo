import { treeRows } from './treeData.js';
import { datasets } from '../data/datasets.js';
import { availableLocalFilters } from '../filters/LocalFilters.js';
export const TEMPLATES = Object.freeze([
  'line',
  'bar',
  'combo',
  'scatter',
  'pie',
  'table',
  'tree',
  'waterfall',
  'funnel',
  'heatmap',
  'indicator',
  'sankey',
]);
const extraFields = {
  tree: 'parent',
  waterfall: 'stepType',
  heatmap: 'category',
  sankey: 'target',
};
const singleSeries = ['pie', 'tree', 'waterfall', 'funnel', 'heatmap', 'sankey'];
export const isNumeric = (unit) => !['month', 'text'].includes(unit);
const text = (s, max = 160) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
function keys(object, allowed) {
  if (
    !object ||
    typeof object !== 'object' ||
    Array.isArray(object) ||
    Object.keys(object).some((k) => !allowed.includes(k))
  )
    throw new Error('Неизвестное поле контракта');
}
export function validateChart(raw, catalog = datasets) {
  keys(raw, [
    'id',
    'title',
    'question',
    'dataset',
    'template',
    'dimension',
    'series',
    'columns',
    'columnBars',
    'pointLabel',
    'localFilters',
    'totals',
    'aggregation',
    'sourceTitle',
    'targetTitle',
    'description',
    'trend',
    ...Object.values(extraFields),
  ]);
  if (!/^C\d{2}$/.test(raw.id) || !text(raw.title, 90) || !text(raw.question, 300))
    throw new Error('Нужны C-ID, заголовок и вопрос');
  if (!Object.hasOwn(catalog, raw.dataset))
    throw new Error(
      'Источник не поддерживается: предложите доступный источник или отдельную ADMIN-задачу',
    );
  if (!TEMPLATES.includes(raw.template))
    throw new Error('Шаблон не поддерживается: предложите таблицу или отдельную ADMIN-задачу');
  const fields = catalog[raw.dataset].fields;
  if (
    raw.localFilters !== undefined &&
    (!Array.isArray(raw.localFilters) ||
      new Set(raw.localFilters).size !== raw.localFilters.length ||
      raw.localFilters.length > 4 ||
      raw.localFilters.some((id) => typeof id !== 'string'))
  )
    throw new Error('Некорректные локальные фильтры');
  availableLocalFilters(raw, catalog);
  const validField = (f) => typeof f === 'string' && Object.hasOwn(fields, f);
  if (
    raw.description !== undefined &&
    (raw.template !== 'tree' ||
      !validField(raw.description) ||
      fields[raw.description].unit !== 'text')
  )
    throw new Error('Описание дерева требует текстовое поле');
  if (raw.trend !== undefined) {
    if (raw.template !== 'tree') throw new Error('История доступна только дереву');
    keys(raw.trend, ['period', 'periods']);
    if (
      !validField(raw.trend.period) ||
      fields[raw.trend.period].unit !== 'month' ||
      !Number.isInteger(raw.trend.periods) ||
      raw.trend.periods < 2 ||
      raw.trend.periods > 24
    )
      throw new Error('История дерева требует месяц и период от 2 до 24 месяцев');
  }
  const extra = extraFields[raw.template];
  if (
    Object.values(extraFields).some((field) => field !== extra && raw[field] !== undefined) ||
    (extra && !validField(raw[extra])) ||
    ((raw.template === 'tree' || raw.template === 'waterfall') &&
      fields[raw[extra]].unit !== 'text')
  )
    throw new Error('Некорректные поля шаблона');
  if (
    (raw.template !== 'sankey' &&
      (raw.sourceTitle !== undefined || raw.targetTitle !== undefined)) ||
    (raw.sourceTitle !== undefined && !text(raw.sourceTitle, 60)) ||
    (raw.targetTitle !== undefined && !text(raw.targetTitle, 60))
  )
    throw new Error('Заголовки сторон доступны только Sankey');
  if (raw.template !== 'indicator' && raw.aggregation !== undefined)
    throw new Error('Агрегация поддерживается только индикатором');
  if (raw.template === 'indicator') {
    if (
      raw.dimension !== undefined ||
      raw.pointLabel !== undefined ||
      raw.columns !== undefined ||
      raw.totals !== undefined ||
      raw.columnBars !== undefined ||
      !Array.isArray(raw.series) ||
      raw.series.length !== 1
    )
      throw new Error('Индикатор требует одну числовую серию без измерения');
    keys(raw.series[0], ['field']);
    if (!validField(raw.series[0].field) || !isNumeric(fields[raw.series[0].field].unit))
      throw new Error('Индикатор требует числовое поле');
    if (raw.aggregation !== undefined && !['sum', 'avg', 'min', 'max'].includes(raw.aggregation))
      throw new Error('Неизвестная агрегация индикатора');
    if (raw.aggregation === 'sum' && fields[raw.series[0].field].unit === 'percent')
      throw new Error('Нельзя суммировать процентные показатели');
  } else if (raw.template === 'table') {
    if (
      raw.pointLabel !== undefined ||
      raw.dimension !== undefined ||
      raw.series !== undefined ||
      !Array.isArray(raw.columns) ||
      (raw.totals !== undefined &&
        (!Array.isArray(raw.totals) ||
          new Set(raw.totals).size !== raw.totals.length ||
          raw.totals.some(
            (field) =>
              !validField(field) || !raw.columns.includes(field) || !isNumeric(fields[field].unit),
          ))) ||
      !raw.columns.length ||
      raw.columns.length > 12 ||
      raw.columns.some((f) => !validField(f)) ||
      new Set(raw.columns).size !== raw.columns.length ||
      (raw.columnBars !== undefined &&
        (!Array.isArray(raw.columnBars) ||
          new Set(raw.columnBars).size !== raw.columnBars.length ||
          raw.columnBars.some(
            (field) =>
              !validField(field) || !raw.columns.includes(field) || !isNumeric(fields[field].unit),
          )))
    )
      throw new Error('Некорректные столбцы таблицы');
  } else {
    if (
      raw.columns !== undefined ||
      raw.totals !== undefined ||
      raw.columnBars !== undefined ||
      (raw.pointLabel !== undefined &&
        (!['scatter', 'tree'].includes(raw.template) ||
          !validField(raw.pointLabel) ||
          fields[raw.pointLabel].unit !== 'text')) ||
      !validField(raw.dimension) ||
      !Array.isArray(raw.series) ||
      !raw.series.length ||
      raw.series.length > 6
    )
      throw new Error('Некорректные измерение или серии');
    const seen = new Set();
    for (const series of raw.series) {
      keys(series, ['field', 'type']);
      if (
        !validField(series.field) ||
        !isNumeric(fields[series.field].unit) ||
        seen.has(series.field)
      )
        throw new Error('Нужна уникальная числовая серия');
      seen.add(series.field);
      if (
        raw.template === 'combo'
          ? !['line', 'bar'].includes(series.type)
          : series.type !== undefined
      )
        throw new Error('Некорректный тип серии');
    }
    if (new Set(raw.series.map((s) => fields[s.field].unit)).size > 2)
      throw new Error('Допускаются максимум две единицы измерения');
    if (singleSeries.includes(raw.template) && raw.series.length !== 1)
      throw new Error('Шаблон требует одну числовую серию');
    if (
      ['pie', 'tree', 'waterfall', 'funnel', 'sankey'].includes(raw.template) &&
      fields[raw.dimension].unit !== 'text'
    )
      throw new Error('Шаблон требует текстовую категорию');
    if (raw.template === 'sankey' && fields[raw.target].unit !== 'text')
      throw new Error('Sankey требует текстовое поле целевого сегмента');
    if (raw.template === 'scatter' && !isNumeric(fields[raw.dimension].unit))
      throw new Error('Точечная диаграмма требует числовую ось X');
    if (extra && new Set([raw.dimension, raw[extra], raw.series[0].field]).size !== 3)
      throw new Error('Шаблон требует разные поля категорий и показателя');
  }
  return structuredClone(raw);
}
export function tableFields(definition) {
  if (definition.template === 'table') return definition.columns;
  return [
    ...new Set(
      [
        definition.dimension,
        definition[extraFields[definition.template]],
        definition.pointLabel,
        definition.description,
        definition.trend?.period,
        ...definition.series.map((s) => s.field),
      ].filter(Boolean),
    ),
  ];
}

function validateStructure(rows, definition, fields) {
  const { template, dimension, parent, category, stepType, target } = definition;
  if (template === 'indicator') {
    if (!definition.aggregation && rows.length > 1)
      throw new Error('Индикатор без агрегации требует ровно одну строку');
    return;
  }
  if (!['tree', 'waterfall', 'funnel', 'heatmap', 'sankey'].includes(template) || !rows.length)
    return;

  const metric = definition.series[0].field;
  const categoryValue = (value, field) =>
    isNumeric(fields[field].unit) ? Number(value) : String(value);
  const dimensions =
    template === 'heatmap'
      ? [dimension, category]
      : template === 'sankey'
        ? [dimension, target]
        : template === 'tree' && definition.trend
          ? [dimension, definition.trend.period]
          : [dimension];
  const seen = new Set();
  for (const row of rows) {
    if (dimensions.some((field) => row[field] == null || row[field] === ''))
      throw new Error('В результате отсутствует категория');
    const key = JSON.stringify(dimensions.map((field) => categoryValue(row[field], field)));
    if (seen.has(key)) throw new Error('Категории графика должны быть уникальны');
    seen.add(key);
  }

  if (template === 'sankey') {
    const sources = new Set(rows.map((row) => String(row[dimension])));
    const targets = new Set(rows.map((row) => String(row[target])));
    if (rows.length > 100 || sources.size > 12 || targets.size > 12)
      throw new Error('Sankey: максимум 100 связей и 12 сегментов на каждой стороне');
    if (rows.some((row) => row[metric] == null || row[metric] === '' || Number(row[metric]) < 0))
      throw new Error('Sankey требует неотрицательные числовые значения потоков');
  }

  if (template === 'tree') {
    if (definition.trend) {
      const parents = new Map();
      for (const row of rows) {
        if (
          typeof row[definition.trend.period] !== 'string' ||
          !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(row[definition.trend.period])
        )
          throw new Error('История дерева требует дату первого числа месяца');
        const id = String(row[dimension]);
        if (parents.has(id) && parents.get(id) !== row[parent])
          throw new Error('Родитель узла должен совпадать во всей истории');
        parents.set(id, row[parent]);
      }
      rows = treeRows(definition, rows);
    }
    if (rows.length > 200) throw new Error('Дерево поддерживает до 200 узлов');
    const nodes = new Set(rows.map((row) => String(row[dimension])));
    const roots = rows.filter((row) => row[parent] === null);
    if (roots.length !== 1) throw new Error('Дерево требует ровно один корень с NULL родителем');
    const children = new Map();
    for (const row of rows) {
      if (row[parent] === null) continue;
      const id = String(row[parent]);
      if (!nodes.has(id)) throw new Error('Узел дерева ссылается на неизвестного родителя');
      if (!children.has(id)) children.set(id, []);
      children.get(id).push(String(row[dimension]));
    }
    const queue = [String(roots[0][dimension])];
    for (const id of queue) {
      for (const child of children.get(id) || []) queue.push(child);
    }
    if (queue.length !== nodes.size) throw new Error('Дерево содержит цикл');
  }
  if (
    template === 'waterfall' &&
    (rows.length < 2 ||
      rows[0][stepType] !== 'total' ||
      rows.at(-1)[stepType] !== 'total' ||
      rows.some(
        (row) =>
          !['total', 'delta'].includes(row[stepType]) || row[metric] == null || row[metric] === '',
      ))
  )
    throw new Error('Мост требует начальный и конечный итог, шаги total/delta и числовые суммы');
  if (
    template === 'funnel' &&
    rows.some((row) => row[metric] == null || row[metric] === '' || Number(row[metric]) < 0)
  )
    throw new Error('Воронка требует неотрицательные значения всех этапов');
}

export function validateRows(rows, definition, catalog = datasets) {
  if (!Array.isArray(rows) || rows.length > 5000)
    throw new Error('Нужно агрегировать данные: лимит 5000 строк');
  const columns = tableFields(definition);
  const fields = catalog[definition.dataset].fields;
  for (const row of rows)
    for (const field of columns) {
      if (!Object.hasOwn(row, field)) throw new Error('В результате отсутствует поле ' + field);
      const value = row[field];
      if (value !== null && isNumeric(fields[field].unit) && !Number.isFinite(Number(value)))
        throw new Error('Некорректное число в ' + field);
    }
  validateStructure(rows, definition, fields);
  return rows;
}
