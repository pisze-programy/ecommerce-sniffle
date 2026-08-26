import type { ProviderConfig } from './types.ts';
import { assertNonEmptyString, assertPositiveInteger } from './helpers.ts';
import { EXCLUDED_STOCK_IDS } from './providers/shoper/excluded-stock-ids.ts';
import { LEGACY_PROVIDERS } from './config.legacy.ts';

function validateConfig(config: ProviderConfig): ProviderConfig {
  assertNonEmptyString(config.id, 'config.id');
  assertNonEmptyString(config.domain, 'config.domain');
  assertNonEmptyString(config.schedule, 'config.schedule');
  assertNonEmptyString(config.endpoint, 'config.endpoint');
  assertPositiveInteger(config.ratePerSecond, 'config.ratePerSecond');
  return config;
}

const RAW_CONFIGS: readonly ProviderConfig[] = [
  // Web - exact stock via HTML/JSON (GET), no mutation, no proxy
  {
    id: 'rever',
    domain: 'rever.com.pl',
    platform: 'woocommerce',
    schedule: '45 4 * * *',
    window: 'both',
    mode: 'cf-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 40,
    requiresProxy: false,
    endpoint: 'https://rever.com.pl/product-sitemap.xml',
    enabled: true,
  },
  {
    id: 'dobrerzeczy',
    domain: 'dobrerzeczy.pl',
    platform: 'custom',
    schedule: '0 6 * * *',
    window: 'both',
    mode: 'vps-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 5,
    requiresProxy: true,
    endpoint: 'https://dobrerzeczy.pl/',
    enabled: true,
  },
  {
    id: 'royalwatch',
    domain: 'royalwatch.pl',
    platform: 'woocommerce',
    schedule: '45 4 * * *',
    window: 'both',
    mode: 'cf-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 65,
    requiresProxy: false,
    endpoint: 'https://www.royalwatch.pl/product-sitemap.xml',
    enabled: true,
  },
  {
    id: 'mushi',
    domain: 'mushi.pl',
    platform: 'custom',
    schedule: '45 4 * * *',
    window: 'both',
    mode: 'cf-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 15,
    requiresProxy: false,
    endpoint: 'https://www.mushi.pl/sitemap.xml',
    enabled: true,
  },
  {
    id: 'premieresociety',
    domain: 'premieresociety.com',
    platform: 'custom',
    schedule: '45 4 * * *',
    window: 'both',
    mode: 'cf-get',
    stockSource: 'html',
    ratePerSecond: 1,
    durationSeconds: 70,
    requiresProxy: false,
    endpoint: 'https://premieresociety.com/pl/3-sklep',
    enabled: false,
  },
  // MCP Shopify
  {
    id: 'derichgallery',
    domain: 'derichgallery.com',
    platform: 'shopify',
    schedule: '0 2 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'cart-probe',
    ratePerSecond: 1,
    durationSeconds: 300,
    requiresProxy: true,
    endpoint: 'https://derichgallery.com/products.json',
    enabled: true,
  },
  {
    id: 'monartofficial',
    domain: 'monartofficial.com',
    platform: 'shopify',
    schedule: '15 2 * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'cart-probe',
    ratePerSecond: 1,
    durationSeconds: 1100,
    requiresProxy: true,
    endpoint: 'https://monartofficial.com/products.json',
    enabled: true,
  },
  ...LEGACY_PROVIDERS,
];

export const PROVIDERS: readonly ProviderConfig[] = RAW_CONFIGS.map((config) => {
  const excluded = EXCLUDED_STOCK_IDS[config.id];
  if (excluded === undefined) {
    return validateConfig(config);
  }
  return validateConfig({ ...config, excludedStockIds: excluded });
});
