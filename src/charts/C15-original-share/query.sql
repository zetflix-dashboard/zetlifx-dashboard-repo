WITH selection AS (SELECT CAST(? AS DATE) AS first, CAST(? AS DATE) AS last, CAST(? AS VARCHAR) AS access), watch AS (
  SELECT v.title_id, SUM(v.hours_watched) AS hours
  FROM read_parquet('viewing_daily.parquet') v
  JOIN read_parquet('users.parquet') u USING (user_id)
  CROSS JOIN selection f
  WHERE v.view_date >= f.first AND v.view_date <= last_day(f.last)
    AND NOT u.is_test AND v.access_type IN ('Подписка', 'Пробный период', 'Партнерский пакет')
    AND (f.access = 'all' OR v.access_type = f.access)
  GROUP BY v.title_id
)
SELECT CAST(t.origin AS VARCHAR) AS origin, CAST(SUM(w.hours) AS DOUBLE) AS hours
FROM watch w JOIN read_parquet('content_titles.parquet') t USING (title_id)
GROUP BY t.origin ORDER BY hours DESC
