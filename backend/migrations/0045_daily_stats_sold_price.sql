-- Ecommerce Pulse - add the sold price bounds to the daily stats.
-- The minimum and the maximum price of a unit sold that day.
-- Null when nothing was sold that day.

ALTER TABLE daily_stats ADD COLUMN sold_min_price REAL;
ALTER TABLE daily_stats ADD COLUMN sold_max_price REAL;
