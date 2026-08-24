-- Ecommerce Pulse - task queue for the distributed workers
-- CF is the broker. VPS and CF workers claim and execute tasks.

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL,
  window TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER,
  worker_id TEXT,
  masked_count INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_queue
  ON tasks (status, window, created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_shop
  ON tasks (domain, status);
