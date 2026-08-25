-- task usage per cron run. Used by the email summary.
CREATE TABLE IF NOT EXISTS task_usage (
  task_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  window TEXT NOT NULL,
  day TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  webshare_bytes INTEGER NOT NULL,
  status TEXT NOT NULL,
  masked INTEGER NOT NULL,
  variants INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_usage_window_day ON task_usage (window, day);
