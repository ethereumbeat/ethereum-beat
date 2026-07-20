-- CI-ONLY synthetic data. Applied after schema.sql + meta.sql so the built
-- worker renders like production (populated charts, /pulse routes, sitemap)
-- WITHOUT hitting any external API — keeping CI hermetic and deterministic
-- enough for the audits. Never used in dev or production (those seed real
-- data via `npm run seed`).
--
-- One recursive CTE fans ~420 daily points across every metric in
-- metric_meta, from 2025-06-01 up to today.
INSERT OR REPLACE INTO metrics (metric_key, date, value)
WITH RECURSIVE seq(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 420
)
SELECT
  mm.metric_key,
  date('2025-06-01', '+' || seq.n || ' days'),
  (abs(random()) % 900) + 50 + seq.n * 1.0
FROM metric_meta mm, seq
WHERE date('2025-06-01', '+' || seq.n || ' days') <= date('now');
