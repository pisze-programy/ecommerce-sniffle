export { COUNTDOWN_DOMAINS, isCountdownShop } from './countdown.js';
export { computeVariantDelta, salePrice } from './classify.js';
export { diffSnapshots } from './diff.js';
export { compareSnapshots, summarizeEvents } from './compare.js';
export type {
  CompareOptions,
  EventSummary,
  ProductChange,
  RestockEstimate,
  SalesEstimate,
  SnapshotComparison,
} from './compare.js';
export { calculateShopSummary, SENTINEL_QTY } from './summary.js';
export type { ShopBias, ShopSummary } from './summary.js';
export { topSellingProducts } from './top.js';
export type { TopProduct, TopProductsOptions } from './top.js';
export { aggregateDaily, isSuspectEvent, maxAbsQuantity, mergeDailyStats } from './aggregate.js';
export { catalogToSnapshot, currentWindow } from './snapshot.js';
export type { DailyStatsInput } from './aggregate.js';
export type { Confidence, DailyStats, EventType, Snapshot, SnapshotWindow, StockEvent, VariantState } from './types.js';
