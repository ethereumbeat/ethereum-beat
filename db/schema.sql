-- Ethereum Beat — D1 schema
-- Apply with: wrangler d1 execute ethereum_beat --file db/schema.sql [--local|--remote]

CREATE TABLE IF NOT EXISTS metrics (
  metric_key TEXT NOT NULL,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  value REAL NOT NULL,
  PRIMARY KEY (metric_key, date)
);

CREATE TABLE IF NOT EXISTS metric_meta (
  metric_key TEXT PRIMARY KEY,
  label TEXT,
  category TEXT,
  unit TEXT,
  description TEXT,
  source_name TEXT,
  source_url TEXT,
  featured INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  agg_mode TEXT DEFAULT 'mean',  -- mean | sum | last
  caption TEXT,                  -- optional arc caption; overrides the delta line (dp10c)
  compare_window TEXT DEFAULT 'd' -- d|w|m|q|none: which window the delta compares over (PR C)
);

CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics (date);
