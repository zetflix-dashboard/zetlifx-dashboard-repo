WITH ads AS (
  SELECT period, SUM(revenue) AS revenue, SUM(impressions) AS impressions
  FROM read_parquet('ad_revenue.parquet') GROUP BY period
)
SELECT
  CAST(i.period AS VARCHAR) AS period,
  CAST(100.0 * i.sold_impressions / NULLIF(i.available_impressions, 0) AS DOUBLE) AS fill_pct,
  CAST(1000.0 * a.revenue / NULLIF(a.impressions, 0) AS DOUBLE) AS ecpm
FROM read_parquet('ad_inventory.parquet') AS i
LEFT JOIN ads AS a USING (period)
WHERE i.period >= CAST(? AS DATE) AND i.period <= CAST(? AS DATE)
ORDER BY i.period
