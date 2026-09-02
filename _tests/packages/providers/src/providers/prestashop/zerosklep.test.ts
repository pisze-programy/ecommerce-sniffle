import { describe, expect, it } from 'vitest';
import {
  extractZeroProductUrls,
  parseQuantityAll,
  parseZeroProductId,
} from '../../../../../../packages/providers/src/providers/prestashop/zerosklep.ts';

describe('parseQuantityAll', () => {
  it('prefers the all-versions quantity over the default combination', () => {
    const html = '&quot;quantity&quot;:3,&quot;quantity_all_versions&quot;:17';
    expect(parseQuantityAll(html)).toBe(17);
  });

  it('falls back to the plain quantity when no all-versions field exists', () => {
    expect(parseQuantityAll('&quot;quantity&quot;:82')).toBe(82);
  });

  it('returns null when no quantity exists', () => {
    expect(parseQuantityAll('<html></html>')).toBeNull();
  });
});

describe('parseZeroProductId', () => {
  it('parses the product id from the page config', () => {
    expect(parseZeroProductId('&quot;id&quot;:41,&quot;id_product&quot;')).toBe('41');
  });

  it('returns null without a product id', () => {
    expect(parseZeroProductId('<html></html>')).toBeNull();
  });
});

describe('extractZeroProductUrls', () => {
  it('extracts absolute product urls on the shop domain', () => {
    const html = '<a href="https://zerosklep.pl/akcesoria/czapka.html"></a><a href="https://other.pl/x.html"></a>';
    expect(extractZeroProductUrls(html, 'https://zerosklep.pl')).toEqual([
      'https://zerosklep.pl/akcesoria/czapka.html',
    ]);
  });

  it('deduplicates repeated urls', () => {
    const html =
      '<a href="https://zerosklep.pl/koszulki/t-shirt.html"></a><a href="https://zerosklep.pl/koszulki/t-shirt.html"></a>';
    expect(extractZeroProductUrls(html, 'https://zerosklep.pl')).toHaveLength(1);
  });
});
