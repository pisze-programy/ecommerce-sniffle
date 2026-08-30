export type Platform = 'shopify' | 'shoper' | 'woocommerce' | 'custom' | 'prestashop' | 'magento' | 'idosell';

export type StockSource =
  | 'embedded-json'
  | 'cart-probe'
  | 'basket-reveal'
  | 'html'
  | 'boolean'
  | 'storefront-availability'
  | 'mcp-inventory'
  | 'ucp-inventory';

export type ExecutionMode = 'cf-get' | 'vps-get' | 'vps-mutation';

export type TaskWindow = 'morning' | 'evening' | 'both';

// The shop can throttle the probe stream. The adaptive rate listens to
// throttle signals and self-tunes. The presence of this block enables
// the adaptive rate. Its absence keeps the fixed rate limiter.
export interface AdaptiveRateConfig {
  readonly minRequestsPerSecond: number;
  readonly maxRequestsPerSecond: number;
  readonly startRequestsPerSecond: number;
  readonly backoffFactor: number;
  readonly recoveryStep: number;
  readonly recoveryCount: number;
}

export interface ProviderConfig {
  readonly id: string;
  readonly domain: string;
  readonly platform: Platform;
  readonly schedule: string;
  readonly mode: ExecutionMode;
  readonly window: TaskWindow;
  readonly stockSource: StockSource;
  readonly ratePerSecond: number;
  readonly durationSeconds: number;
  readonly requiresProxy: boolean;
  readonly endpoint: string;
  readonly enabled: boolean;
  // The shop reports prices in this currency. The display layer converts
  // non-PLN amounts to PLN. Undefined means the prices are PLN.
  readonly currency?: string;
  // The entity (company or brand) that owns the shop. Used by the
  // report layer to draw the entity graph. The VPS does not use it.
  readonly entityId?: string;
  readonly excludedStockIds?: readonly number[];
  readonly adaptiveRate?: AdaptiveRateConfig;
}

export interface Money {
  readonly amount: number;
  readonly currency: string;
}

export interface Variant {
  readonly id: string;
  readonly title: string;
  readonly sku: string | null;
  readonly price: Money;
  readonly regularPrice: Money | null;
  readonly available: boolean;
  readonly quantity: number | null;
}

export interface Product {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly variants: readonly Variant[];
}

export interface Catalog {
  readonly domain: string;
  readonly fetchedAt: string;
  readonly products: readonly Product[];
}

export interface Provider {
  readonly config: ProviderConfig;
  fetchCatalog(): Promise<Catalog>;
}

export interface StockRevealer extends Provider {
  revealStock(target: StockRevealTarget): Promise<Catalog>;
}

export interface StockRevealTarget {
  readonly productIds: readonly string[];
}
