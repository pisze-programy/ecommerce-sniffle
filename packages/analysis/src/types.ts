export type Confidence = 'exact' | 'lower-bound' | 'masked' | 'low';

export type EventType =
  'sold' | 'restock' | 'soldOut' | 'backInStock' | 'promoStart' | 'promoEnd' | 'productNew' | 'productRemoved';

export type SnapshotWindow = 'morning' | 'evening' | 'unknown';

export interface VariantState {
  readonly productId: string;
  readonly variantId: string;
  readonly quantity: number | null;
  readonly price: number | null;
  readonly regularPrice: number | null;
  readonly available: boolean;
  readonly productUrl?: string | null;
  readonly productTitle?: string | null;
  readonly variantTitle?: string | null;
}

export interface Snapshot {
  readonly shop: string;
  readonly snapshotAt: string;
  readonly window: SnapshotWindow;
  readonly variants: readonly VariantState[];
}

export interface StockEvent {
  readonly type: EventType;
  readonly productId: string;
  readonly variantId: string;
  readonly from: VariantState | null;
  readonly to: VariantState | null;
  readonly units: number;
  readonly confidence: Confidence;
}

export interface DailyStats {
  readonly shop: string;
  readonly day: string;
  readonly unitsSold: number;
  readonly revenue: number;
  readonly restocked: number;
  readonly soldOutCount: number;
  readonly promotionCount: number;
  readonly maskedCount: number;
  readonly suspectCount: number;
}
