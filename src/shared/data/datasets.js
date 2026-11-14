const SQL0 = [
  'SELECT',
  '  CAST(period AS VARCHAR) AS period,',
  '  CAST(net_revenue AS DOUBLE) AS net_revenue,',
  '  CAST(operating_profit AS DOUBLE) AS operating_profit,',
  '  CAST(100.0 * operating_profit / NULLIF(net_revenue, 0) AS DOUBLE) AS margin_pct',
  "FROM read_parquet('pl_control.parquet')",
  'WHERE period >= CAST(? AS DATE) AND period <= CAST(? AS DATE)',
  'ORDER BY period',
].join('\n');
const SQL1 = [
  'WITH ads AS (',
  '  SELECT period, SUM(revenue) AS revenue, SUM(impressions) AS impressions',
  "  FROM read_parquet('ad_revenue.parquet') GROUP BY period",
  ')',
  'SELECT',
  '  CAST(i.period AS VARCHAR) AS period,',
  '  CAST(100.0 * i.sold_impressions / NULLIF(i.available_impressions, 0) AS DOUBLE) AS fill_pct,',
  '  CAST(1000.0 * a.revenue / NULLIF(a.impressions, 0) AS DOUBLE) AS ecpm',
  "FROM read_parquet('ad_inventory.parquet') AS i",
  'LEFT JOIN ads AS a USING (period)',
  'WHERE i.period >= CAST(? AS DATE) AND i.period <= CAST(? AS DATE)',
  'ORDER BY i.period',
].join('\n');

export const datasets = Object.freeze({
  financialMonthly: {
    label: 'P&L · контрольные итоги',
    sources: ['pl_control.parquet'],
    sql: SQL0,
    grain: 'месяц',
    dateRole: 'месяц признания',
    filters: ['period'],
    limitation:
      'Контрольные итоги PL_Control. Детальная сверка по фактам пока не реализована; сегментация недоступна.',
    fields: {
      period: { label: 'Месяц', unit: 'month' },
      net_revenue: { label: 'Выручка', unit: 'rub' },
      operating_profit: { label: 'Опер. прибыль', unit: 'rub' },
      margin_pct: { label: 'Опер. маржа', unit: 'percent' },
    },
  },
  advertisingMonthly: {
    label: 'Реклама · месячные показатели',
    sources: ['ad_inventory.parquet', 'ad_revenue.parquet'],
    sql: SQL1,
    grain: 'месяц',
    dateRole: 'месяц показов',
    filters: ['period'],
    limitation:
      'Заполняемость и eCPM. Доход на пользователя PL1 ещё не реализован. Другие разрезы недоступны.',
    fields: {
      period: { label: 'Месяц', unit: 'month' },
      fill_pct: { label: 'Заполняемость', unit: 'percent' },
      ecpm: { label: 'eCPM', unit: 'rub' },
    },
  },
});
