-- Pass: collector alerting + staleness signal.
-- Adds the collector_runs table to existing DBs (schema.sql covers fresh installs).
-- Apply with: wrangler d1 execute ethereum_beat --file db/migrations/005_collector_runs.sql [--local|--remote]

CREATE TABLE IF NOT EXISTS collector_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  ok TEXT NOT NULL,
  failed TEXT NOT NULL,
  error_summary TEXT,
  rows INTEGER NOT NULL DEFAULT 0,
  alerted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_collector_runs_finished ON collector_runs (finished_at);
