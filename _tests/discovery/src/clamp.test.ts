import { describe, expect, it } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { LogRecord } from '@ecommerce-sniffle/providers';
import {
  detectLeaks,
  extractAppStock,
  extractDataInventoryQuantity,
  extractGrowMap,
  extractKaching,
  extractRestock,
  extractShopDomain,
  extractStorefrontToken,
  parseClampMessage,
  pickVerifiable,
} from '../../../discovery/src/clamp.ts';

function makeLogger(): { logger: ReturnType<typeof createLogger>; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

describe('extractKaching', () => {
  it('reads the variant map from the bundle JSON block', () => {
    const body =
      '<script class="kaching-bundles-product" data-product-id="1" type="application/json">' +
      '{"id":1,"variants":[{"id":11,"inventoryQuantity":7},{"id":12,"inventoryQuantity":99}]}' +
      '</script>';
    const { logger } = makeLogger();
    const map = extractKaching(body, logger);
    expect(map.get('11')).toBe(7);
    expect(map.get('12')).toBe(99);
  });

  it('logs and skips a malformed JSON block', () => {
    const body = '<script class="kaching-bundles-product" type="application/json">{not json}</script>';
    const { logger, records } = makeLogger();
    const map = extractKaching(body, logger);
    expect(map.size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.script parse failed')).toBe(true);
  });

  it('returns empty when the block is absent', () => {
    const { logger } = makeLogger();
    expect(extractKaching('<html></html>', logger).size).toBe(0);
  });
});

describe('extractDataInventoryQuantity', () => {
  it('reads the id and qty list', () => {
    const body = '<script data-inventory-quantity>[{"id":21,"qty":420},{"id":22,"qty":474}]</script>';
    const { logger } = makeLogger();
    const map = extractDataInventoryQuantity(body, logger);
    expect(map.get('21')).toBe(420);
    expect(map.get('22')).toBe(474);
  });

  it('logs and skips a malformed list', () => {
    const body = '<script data-inventory-quantity>[oops]</script>';
    const { logger, records } = makeLogger();
    expect(extractDataInventoryQuantity(body, logger).size).toBe(0);
    expect(records.some((record) => record.message === 'embeddedinventory.script parse failed')).toBe(true);
  });
});

describe('extractGrowMap', () => {
  it('reads the JS map of variant id and count', () => {
    const body = 'window.gwProductInventoryQuantity[31]="34";window.gwProductInventoryQuantity[32]="59";';
    const map = extractGrowMap(body);
    expect(map.get('31')).toBe(34);
    expect(map.get('32')).toBe(59);
  });

  it('returns empty for a plain page', () => {
    expect(extractGrowMap('<html></html>').size).toBe(0);
  });
});

describe('extractRestock', () => {
  it('reads the variant quantity from the config', () => {
    const { logger } = makeLogger();
    const body = 'var _ReStockConfig = { product: { variants: [{ id: 41, title: "S", quantity: 191 }] } };';
    const map = extractRestock(body, logger);
    expect(map.get('41')).toBe(191);
  });

  it('returns empty without the config', () => {
    const { logger } = makeLogger();
    expect(extractRestock('<html></html>', logger).size).toBe(0);
  });
});

describe('extractAppStock', () => {
  it('reads the reward stock and skips the zero variant id', () => {
    const body =
      '{"variantId": 0, "stock": 0, "stockTracked": false}' +
      '{"variantId": 51, "productTitle": "gift", "stock": 1066, "stockTracked": true}';
    const map = extractAppStock(body);
    expect(map.get('51')).toBe(1066);
    expect(map.has('0')).toBe(false);
  });
});

describe('detectLeaks', () => {
  it('finds two catalog vectors on one page', () => {
    const body =
      '<script class="kaching-bundles-product" type="application/json">{"variants":[{"id":11,"inventoryQuantity":7}]}</script>' +
      'window.gwProductInventoryQuantity[31]="34";';
    const { logger } = makeLogger();
    const hits = detectLeaks(body, logger);
    expect(hits.map((hit) => hit.vector)).toEqual(['kaching-inventory', 'grow-inventory-map']);
    expect(hits.every((hit) => hit.scope === 'catalog')).toBe(true);
  });

  it('marks the reward stock as an app scope', () => {
    const body = '{"variantId": 51, "stock": 4, "stockTracked": true}';
    const { logger } = makeLogger();
    const hits = detectLeaks(body, logger);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.vector).toBe('app-stock');
    expect(hits[0]?.scope).toBe('app');
  });

  it('returns empty for a page without a vector', () => {
    const { logger } = makeLogger();
    expect(detectLeaks('<html><body>shop</body></html>', logger)).toEqual([]);
  });
});

describe('pickVerifiable', () => {
  it('picks the smallest count below the cap', () => {
    const variants = new Map([
      ['1', 99],
      ['2', 12],
      ['3', 13],
    ]);
    const sample = pickVerifiable({ vector: 'grow-inventory-map', scope: 'catalog', variants }, 40);
    expect(sample).toEqual({ variantId: '2', quantity: 12 });
  });

  it('returns null when every count is at or above the cap', () => {
    const variants = new Map([['1', 99]]);
    expect(pickVerifiable({ vector: 'grow-inventory-map', scope: 'catalog', variants }, 40)).toBe(null);
  });
});

describe('parseClampMessage', () => {
  it('reads the Polish message', () => {
    expect(parseClampMessage('{"message":"Tylko 12 poz. dodano do koszyka z powodu dostępności."}')).toBe(12);
  });

  it('reads the English message', () => {
    expect(parseClampMessage('{"message":"Only 13 items were added to your cart due to availability."}')).toBe(13);
  });

  it('reads the Polish singular message', () => {
    expect(parseClampMessage('Tylko 1 pozycja została dodana do koszyka')).toBe(1);
  });

  it('returns null for a message without a count', () => {
    expect(parseClampMessage('{"quantity":5}')).toBe(null);
  });
});

describe('storefront hints', () => {
  it('reads the storefront token', () => {
    const body = 'storefrontAccessToken = "beeb0153754a4126decfb761eed267a9"';
    expect(extractStorefrontToken(body)).toBe('beeb0153754a4126decfb761eed267a9');
  });

  it('returns null without a token', () => {
    expect(extractStorefrontToken('<html></html>')).toBe(null);
  });

  it('reads the permanent shop domain', () => {
    expect(extractShopDomain('window.shop = "kw62pd-hj.myshopify.com"')).toBe('kw62pd-hj.myshopify.com');
  });
});
