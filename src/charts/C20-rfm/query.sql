WITH paid AS (
  SELECT b.user_id, b.service_period_start, b.service_period_end,
    CAST(b.charged_amount AS DOUBLE) AS amount
  FROM read_parquet('billing_events.parquet') b
  JOIN read_parquet('users.parquet') u USING (user_id)
  WHERE b.event_status = 'Успешно' AND NOT b.is_test AND NOT u.is_test
    AND u.account_type = 'Прямой пользователь' AND b.plan_id IN ('PL1', 'PL2')
    AND b.event_date BETWEEN DATE '2024-01-01' AND DATE '2025-12-31'
), money AS (
  SELECT user_id, SUM(amount) AS amount FROM paid GROUP BY user_id
), frequency AS (
  SELECT p.user_id, COUNT(DISTINCT CAST(m.month AS DATE)) AS months
  FROM paid p, UNNEST(generate_series(
    date_trunc('month', p.service_period_start),
    date_trunc('month', p.service_period_end), INTERVAL 1 MONTH
  )) AS m(month)
  WHERE m.month BETWEEN DATE '2024-01-01' AND DATE '2025-12-01'
  GROUP BY p.user_id
), last_view AS (
  SELECT v.user_id, MAX(v.view_date) AS last_date
  FROM read_parquet('viewing_daily.parquet') v
  JOIN money mo USING (user_id)
  WHERE v.view_date <= DATE '2025-12-31'
  GROUP BY v.user_id
), scored AS (
  SELECT mo.user_id, mo.amount,
    COALESCE(f.months, 0) AS paid_months,
    CASE WHEN lv.last_date IS NULL THEN NULL ELSE date_diff('day', lv.last_date, DATE '2025-12-31') END AS days_since_view,
    CASE WHEN lv.last_date IS NULL THEN 1 ELSE 0 END AS never_viewed,
    CASE WHEN lv.last_date IS NULL OR date_diff('day', lv.last_date, DATE '2025-12-31') > 90 THEN 1
         WHEN date_diff('day', lv.last_date, DATE '2025-12-31') > 30 THEN 2 ELSE 3 END AS r,
    CASE WHEN COALESCE(f.months, 0) >= 12 THEN 3
         WHEN COALESCE(f.months, 0) >= 4 THEN 2 ELSE 1 END AS f,
    CASE WHEN mo.amount >= 5000 THEN 3 WHEN mo.amount >= 1500 THEN 2 ELSE 1 END AS m
  FROM money mo LEFT JOIN frequency f USING (user_id)
  LEFT JOIN last_view lv USING (user_id)
), groups AS (
  SELECT r, f, m, COUNT(*) AS users, SUM(amount) AS revenue,
    AVG(paid_months) AS avg_paid_months,
    AVG(days_since_view) AS avg_days_since_view,
    SUM(never_viewed) AS never_viewed_users
  FROM scored GROUP BY r, f, m
)
SELECT CAST(r AS VARCHAR) || CAST(f AS VARCHAR) || CAST(m AS VARCHAR) AS segment,
  CAST(r AS DOUBLE) AS recency_score, CAST(f AS DOUBLE) AS frequency_score,
  CAST(m AS DOUBLE) AS monetary_score, CAST(users AS DOUBLE) AS users,
  CAST(revenue AS DOUBLE) AS revenue,
  CAST(100.0 * users / NULLIF(SUM(users) OVER (), 0) AS DOUBLE) AS user_share_pct,
  CAST(100.0 * revenue / NULLIF(SUM(revenue) OVER (), 0) AS DOUBLE) AS share_pct,
  CAST(revenue / NULLIF(users, 0) AS DOUBLE) AS revenue_per_user,
  CAST(avg_paid_months AS DOUBLE) AS avg_paid_months,
  CAST(avg_days_since_view AS DOUBLE) AS avg_days_since_view,
  CAST(never_viewed_users AS DOUBLE) AS never_viewed_users
FROM groups ORDER BY revenue DESC
