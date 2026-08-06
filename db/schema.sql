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

-- One row per daily collector run: when it ran, which sources passed/failed,
-- a concise error summary, and whether a failure digest was alerted (for the
-- 24h de-dupe). /api/snapshot reads the latest finished_at to compute is_stale.
CREATE TABLE IF NOT EXISTS collector_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,       -- ISO-8601
  finished_at TEXT NOT NULL,      -- ISO-8601
  ok TEXT NOT NULL,               -- JSON array of source names that succeeded
  failed TEXT NOT NULL,           -- JSON array of {source, error} that failed
  error_summary TEXT,             -- one-line digest of failures (NULL when all ok)
  rows INTEGER NOT NULL DEFAULT 0,
  alerted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_collector_runs_finished ON collector_runs (finished_at);
