import { datasets } from '../data/datasets.js';
import { availableLocalFilters } from '../filters/LocalFilters.js';
export const TEMPLATES = Object.freeze(['line', 'bar', 'combo', 'scatter', 'pie', 'table']);
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
  if (raw.template === 'table') {
    if (
      raw.dimension !== undefined ||
      raw.series !== undefined ||
      !Array.isArray(raw.columns) ||
      (raw.totals !== undefined &&
        (!Array.isArray(raw.totals) ||
          new Set(raw.totals).size !== raw.totals.length ||
          raw.totals.some(
            (field) =>
              !raw.columns.includes(field) || ['month', 'text'].includes(fields[field].unit),
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
              !raw.columns.includes(field) || ['month', 'text'].includes(fields[field].unit),
          )))
    )
      throw new Error('Некорректные столбцы таблицы');
  } else {
    if (
      raw.columns !== undefined ||
      raw.totals !== undefined ||
      raw.columnBars !== undefined ||
      (raw.pointLabel !== undefined &&
        (raw.template !== 'scatter' ||
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
        ['month', 'text'].includes(fields[series.field].unit) ||
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
    if (
      raw.template === 'pie' &&
      (fields[raw.dimension].unit !== 'text' || raw.series.length !== 1)
    )
      throw new Error('Круговая диаграмма требует категории и одну числовую серию');
    if (raw.template === 'scatter' && ['month', 'text'].includes(fields[raw.dimension].unit))
      throw new Error('Точечная диаграмма требует числовую ось X');
  }
  return structuredClone(raw);
}
export function validateRows(rows, definition, catalog = datasets) {
  if (!Array.isArray(rows) || rows.length > 5000)
    throw new Error('Нужно агрегировать данные: лимит 5000 строк');
  const fields =
    definition.template === 'table'
      ? definition.columns
      : [
          definition.dimension,
          ...definition.series.map((s) => s.field),
          ...(definition.pointLabel ? [definition.pointLabel] : []),
        ];
  for (const row of rows)
    for (const field of fields) {
      if (!Object.hasOwn(row, field)) throw new Error('В результате отсутствует поле ' + field);
      const value = row[field];
      const unit = catalog[definition.dataset].fields[field].unit;
      if (value !== null && !['month', 'text'].includes(unit) && !Number.isFinite(Number(value)))
        throw new Error('Некорректное число в ' + field);
    }
  return rows;
}
