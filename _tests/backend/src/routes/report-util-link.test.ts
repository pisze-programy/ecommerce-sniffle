import { describe, expect, it } from 'vitest';
import { shopifyVariantUrl } from '../../../../backend/src/routes/report.ts';

describe('shopifyVariantUrl', () => {
  it('appends the variant query on a clean product url', () => {
    expect(shopifyVariantUrl('https://booso.pl/products/p1', '49802392666443')).toBe(
      'https://booso.pl/products/p1?variant=49802392666443'
    );
  });

  it('appends with an ampersand when the url already has a query', () => {
    expect(shopifyVariantUrl('https://x.pl/products/p?from=a', 'v1')).toBe('https://x.pl/products/p?from=a&variant=v1');
  });
});
