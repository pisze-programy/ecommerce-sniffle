-- Ecommerce Pulse - bizraport financials update (manual harvest, browser).
-- Source: https://www.bizraport.pl/krs/{krs}
-- Harvest date: 2026-09-06.
-- The year is the reporting year shown on bizraport.
-- A row with NULL values and a fetched_at means the firm has no KRS
-- financial report yet. Retry it after the firm files its report.

INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('zerosklep', 2025, 14100000, 41100000, 5500000, 54000000, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('dresscodecrew', 2024, 1700000, 3800000, 648000, 5900000, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('deynncosmetics', 2025, 1500000, 2000000, 304000, 3600000, '2026-09-06T00:00:00.000Z');

-- No KRS report yet. Retry after the firm files its report.
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('forcer', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('mushi', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('royalwatch', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('emereedivine', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
-- The firm GSQ sp. z o.o. was removed from KRS on 2020-10-30.
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('godsavequeens', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('patandrub', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('berecords', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');
-- The dobrerzeczy firm is a foundation. It files no KRS financial report.
INSERT OR REPLACE INTO entity_financials (entity_id, year, assets, revenue, net_profit, valuation, fetched_at) VALUES ('dobrerzeczy', NULL, NULL, NULL, NULL, NULL, '2026-09-06T00:00:00.000Z');