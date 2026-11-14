const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
export function monthLabel(value) {
  const parts = String(value).slice(0, 7).split('-');
  return parts.length === 2 ? parts[1] + '.' + parts[0].slice(2) : String(value);
}
export function formatValue(value, unit = 'number', short = false) {
  if (value == null || value === '') return '—';
  if (unit === 'month') return monthLabel(value);
  if (unit === 'text') return String(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (short) return compact.format(n) + (unit === 'percent' ? '%' : unit === 'rub' ? ' ₽' : '');
  return unit === 'rub' ? money.format(n) : number.format(n) + (unit === 'percent' ? '%' : '');
}
export const formatRubles = v => formatValue(v, 'rub');
export const formatPercent = v => formatValue(v, 'percent');
