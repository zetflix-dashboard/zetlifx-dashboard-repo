export const MIN_MONTH = '2024-01';
export const MAX_MONTH = '2025-12';
export const DEFAULT_FILTERS = Object.freeze({ periodFrom: MIN_MONTH, periodTo: MAX_MONTH });

const validMonth = (value) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function validateFilters(filters) {
  if (!validMonth(filters.periodFrom) || !validMonth(filters.periodTo)) {
    throw new Error('Некорректный месяц фильтра');
  }
  if (filters.periodFrom < MIN_MONTH || filters.periodTo > MAX_MONTH || filters.periodFrom > filters.periodTo) {
    throw new Error('Период должен находиться в пределах 2024–2025 и начало не может быть позже конца');
  }
  return { periodFrom: filters.periodFrom, periodTo: filters.periodTo };
}

export function dateRange(filters) {
  const normalized = validateFilters(filters);
  return [normalized.periodFrom + '-01', normalized.periodTo + '-01'];
}

export class FilterStore {
  constructor(initial = DEFAULT_FILTERS) {
    this.value = validateFilters(initial);
    this.listeners = new Set();
  }
  get() { return { ...this.value }; }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  set(patch) {
    const next = validateFilters({ ...this.value, ...patch });
    if (next.periodFrom === this.value.periodFrom && next.periodTo === this.value.periodTo) return;
    this.value = next;
    this.listeners.forEach((listener) => listener(this.get()));
  }
  reset() { this.set(DEFAULT_FILTERS); }
}
