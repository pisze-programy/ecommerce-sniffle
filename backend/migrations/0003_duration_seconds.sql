-- Ecommerce Pulse - task queue ordering
-- The claim serves the fastest task first.
-- The duration estimate comes from the provider config.

ALTER TABLE tasks ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 600;
