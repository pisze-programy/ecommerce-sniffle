export type Platform = "shopify" | "shoper" | "woocommerce" | "custom" | "prestashop" | "magento";

export type StockSource = "embedded-json" | "cart-probe" | "basket-reveal" | "html" | "boolean";

export type ExecutionMode = "cf-get" | "vps-get" | "vps-mutation";

export type TaskWindow = "morning" | "evening" | "both";

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
