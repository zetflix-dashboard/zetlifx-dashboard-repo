WITH bounds AS (SELECT CAST(? AS DATE) AS first, CAST(? AS DATE) AS last, CAST(? AS VARCHAR) AS genre),
amort AS (
  SELECT a.title_id, SUM(a.amortization_amount) AS expense
  FROM read_parquet('content_amortization.parquet') a CROSS JOIN bounds b
  WHERE a.period >= b.first AND a.period <= b.last
  GROUP BY a.title_id
), watch AS (
  SELECT v.title_id, SUM(v.hours_watched) AS hours
  FROM read_parquet('viewing_daily.parquet') v
  JOIN read_parquet('users.parquet') u USING (user_id)
  CROSS JOIN bounds b
  WHERE v.view_date >= b.first AND v.view_date <= last_day(b.last)
    AND NOT u.is_test AND v.access_type IN ('Подписка', 'Пробный период', 'Партнерский пакет')
  GROUP BY v.title_id
)
SELECT CAST(t.title_name AS VARCHAR) AS title, CAST(w.hours AS DOUBLE) AS hours,
  CAST(a.expense / NULLIF(w.hours, 0) AS DOUBLE) AS cost_per_hour
FROM amort a JOIN watch w USING (title_id) JOIN read_parquet('content_titles.parquet') t USING (title_id) CROSS JOIN bounds b
WHERE w.hours > 0 AND (b.genre = 'all' OR t.genre = b.genre) ORDER BY hours DESC
