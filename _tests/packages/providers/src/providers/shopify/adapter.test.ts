import { describe, expect, it } from 'vitest';
import {
  parsePrice,
  parseShopifyCatalog,
  parseShopifyProduct,
  parseShopifyVariant,
} from '../../../../../../packages/providers/src/providers/shopify/implementations/adapter.ts';

const DOMAIN = 'forcer.pl';

describe('parsePrice', () => {
  it('parses a PLN price', () => {
    expect(parsePrice('1190.00')).toBe(1190);
  });

  it('parses a decimal price', () => {
    expect(parsePrice('200.00')).toBe(200);
  });

  it('returns null for empty input', () => {
    expect(parsePrice(null)).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(parsePrice('not-a-number')).toBeNull();
  });
});

describe('parseShopifyVariant', () => {
  it('maps a variant with exact inventory', () => {
    const variant = parseShopifyVariant({
      id: 53670923403593,
      title: 'SHORT',
      sku: '667003001121',
      price: '1190.00',
      compare_at_price: '1490.00',
      available: true,
      inventory_quantity: 3,
    });
    expect(variant).not.toBeNull();
    expect(variant?.id).toBe('53670923403593');
    expect(variant?.title).toBe('SHORT');
    expect(variant?.sku).toBe('667003001121');
    expect(variant?.price.amount).toBe(1190);
    expect(variant?.regularPrice?.amount).toBe(1490);
    expect(variant?.available).toBe(true);
    expect(variant?.quantity).toBe(3);
  });

  it('keeps quantity null when inventory is masked', () => {
    const variant = parseShopifyVariant({
      id: 1,
      title: 'OS',
      price: '200.00',
      compare_at_price: '200.00',
      available: true,
    });
    expect(variant?.quantity).toBeNull();
    expect(variant?.available).toBe(true);
  });

  it('treats an unavailable masked variant as sold out', () => {
    const variant = parseShopifyVariant({
      id: 2,
      title: 'OS',
      price: '200.00',
      compare_at_price: null,
      available: false,
    });
    expect(variant?.quantity).toBe(0);
    expect(variant?.available).toBe(false);
  });

  it('ignores regular price when compare equals the price', () => {
    const variant = parseShopifyVariant({
      id: 3,
      title: 'OS',
      price: '200.00',
      compare_at_price: '200.00',
      available: true,
    });
    expect(variant?.regularPrice).toBeNull();
  });

  it('returns null for a non-object or id-less entry', () => {
    expect(parseShopifyVariant(null)).toBeNull();
    expect(parseShopifyVariant('nope')).toBeNull();
    expect(parseShopifyVariant({ title: 'no-id' })).toBeNull();
  });
});

describe('parseShopifyProduct', () => {
  it('maps product id, title and url', () => {
    const product = parseShopifyProduct(
      {
        id: 10023411843401,
        title: 'SET AIR',
        handle: 'set-air',
        variants: [
          { id: 1, title: 'SHORT', price: '1190.00', available: true, sku: null },
          { id: 2, title: 'REGULAR', price: '1190.00', available: false, sku: 'x' },
        ],
      },
      DOMAIN
    );
    expect(product?.id).toBe('10023411843401');
    expect(product?.title).toBe('SET AIR');
    expect(product?.url).toBe('https://forcer.pl/products/set-air');
    expect(product?.variants).toHaveLength(2);
  });

  it('skips malformed variants', () => {
    const product = parseShopifyProduct(
      { id: 1, title: 'T', handle: 't', variants: [{ title: 'no-id' }, null, 'bad'] },
      DOMAIN
    );
    expect(product?.variants).toEqual([]);
  });

  it('returns null for a non-object', () => {
    expect(parseShopifyProduct('nope', DOMAIN)).toBeNull();
  });
});

describe('parseShopifyCatalog', () => {
  it('extracts all products from the json payload', () => {
    const products = parseShopifyCatalog(
      {
        products: [
          { id: 1, title: 'A', handle: 'a', variants: [{ id: 11, title: 'OS', price: '1.00', available: true }] },
          { id: 2, title: 'B', handle: 'b', variants: [{ id: 21, title: 'OS', price: '2.00', available: false }] },
        ],
      },
      DOMAIN
    );
    expect(products).toHaveLength(2);
    expect(products[0]?.title).toBe('A');
  });

  it('returns an empty array for invalid payloads', () => {
    expect(parseShopifyCatalog(null, DOMAIN)).toEqual([]);
    expect(parseShopifyCatalog({ notProducts: [] }, DOMAIN)).toEqual([]);
    expect(parseShopifyCatalog('nope', DOMAIN)).toEqual([]);
  });
});
