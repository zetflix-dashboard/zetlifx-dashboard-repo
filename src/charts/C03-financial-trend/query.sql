WITH quarter_filter AS (SELECT CAST(? AS DATE) AS first, CAST(? AS DATE) AS last, CAST(? AS VARCHAR) AS quarter)
SELECT
  CAST(period AS VARCHAR) AS period,
  CAST(net_revenue AS DOUBLE) AS net_revenue,
  CAST(operating_profit AS DOUBLE) AS operating_profit,
  CAST(100.0 * operating_profit / NULLIF(net_revenue, 0) AS DOUBLE) AS margin_pct
FROM read_parquet('pl_control.parquet') CROSS JOIN quarter_filter f
WHERE period >= f.first AND period <= f.last
  AND (f.quarter = 'all' OR date_part('quarter', period) = try_cast(f.quarter AS INTEGER))
ORDER BY period
