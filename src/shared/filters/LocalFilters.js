import { datasets } from '../data/datasets.js';
import { dateRange } from './FilterStore.js';

// Every selectable value is defined in the trusted data catalogue, never in a chart.
export function availableLocalFilters(definition, catalog = datasets) {
  const dataset = catalog[definition.dataset];
  const approved = dataset.localFilters || [];
  return (definition.localFilters || []).map((id) => {
    const filter = approved.find((item) => item.id === id);
    if (!filter) throw new Error('Недоступный локальный фильтр: ' + id);
    return filter;
  });
}

export function validateLocalFilters(definition, raw = {}, catalog = datasets) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Некорректные локальные фильтры');
  }
  const approved = availableLocalFilters(definition, catalog);
  const result = {};
  for (const [id, value] of Object.entries(raw)) {
    const filter = approved.find((item) => item.id === id);
    if (!filter || !filter.options.some((option) => option.value === value)) {
      throw new Error('Недопустимое значение локального фильтра: ' + id);
    }
    // The default is implicit, so old workspaces keep their original form.
    if (value !== filter.options[0].value) result[id] = value;
  }
  return result;
}

export function datasetQueryParams(definition, globalFilters, rawLocal = {}, catalog = datasets) {
  const dataset = catalog[definition.dataset];
  const local = validateLocalFilters(definition, rawLocal, catalog);
  const params = dataset.filters.includes('period') ? dateRange(globalFilters) : [];
  // SQL parameters follow the catalogue-defined order, not user input order.
  for (const filter of dataset.localFilters || []) {
    params.push(local[filter.id] || filter.options[0].value);
  }
  return params;
}
