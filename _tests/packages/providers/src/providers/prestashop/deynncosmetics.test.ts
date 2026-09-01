import { describe, expect, it } from 'vitest';
import {
  parseEmbeddedPrice,
  parseEmbeddedQuantity,
} from '../../../../../../packages/providers/src/providers/prestashop/deynncosmetics.ts';

describe('parseEmbeddedQuantity', () => {
  it('parses the encoded quantity from the page config', () => {
    expect(parseEmbeddedQuantity('&quot;quantity&quot;:2851')).toBe(2851);
  });

  it('ignores the raw quantity fields of the related blocks', () => {
    const html = '{"name":"related","quantity":1},{"name":"related","quantity":1}';
    expect(parseEmbeddedQuantity(html)).toBeNull();
  });

  it('parses zero for a sold out product', () => {
    expect(parseEmbeddedQuantity('&quot;quantity&quot;:0')).toBe(0);
  });

  it('returns null when no quantity exists', () => {
    expect(parseEmbeddedQuantity('<html></html>')).toBeNull();
  });
});

describe('parseEmbeddedPrice', () => {
  it('parses the price amount from the page config', () => {
    expect(parseEmbeddedPrice('&quot;price_amount&quot;:69.99')).toBe(69.99);
  });

  it('returns null when no price exists', () => {
    expect(parseEmbeddedPrice('<html></html>')).toBeNull();
  });
});
