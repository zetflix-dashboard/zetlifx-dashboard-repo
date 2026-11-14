const ruble = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export function formatRubles(value) { return ruble.format(Number(value) || 0); }
export function formatPercent(value) { return decimal.format(Number(value) || 0) + '%'; }
export function monthLabel(value) {
  const parts = String(value).slice(0, 7).split('-');
  return parts.length === 2 ? parts[1] + '.' + parts[0].slice(2) : String(value);
}
export const AXIS_COLOR = '#8796ae';
export const GRID_COLOR = '#283a55';
