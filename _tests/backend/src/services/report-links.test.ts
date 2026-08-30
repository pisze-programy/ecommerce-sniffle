import { describe, expect, it } from 'vitest';
import { productLink, variantCell } from '../../../../backend/src/services/report/links.ts';
import type { ShopNames } from '../../../../backend/src/services/storage.ts';

function names(overrides: Partial<ShopNames> = {}): ShopNames {
  return {
    productUrls: new Map(),
    productTitles: new Map(),
    variantTitles: new Map(),
    ...overrides,
  };
}

describe('productLink', () => {
  it('shows the title as the link text and keeps the id in the title attribute', () => {
    const html = productLink(
      names({ productUrls: new Map([['p1', 'https://mock.pl/p1']]), productTitles: new Map([['p1', 'SET AIR']]) }),
      'p1'
    );
    expect(html).toContain('href="https://mock.pl/p1"');
    expect(html).toContain('title="p1"');
    expect(html).toContain('>SET AIR</a>');
  });

  it('shows dashes when the product title is missing', () => {
    const html = productLink(names({ productUrls: new Map([['p1', 'https://mock.pl/p1']]) }), 'p1');
    expect(html).toContain('>--</a>');
  });

  it('marks a missing url', () => {
    const html = productLink(names(), 'p1');
    expect(html).toContain('brak linku');
  });
});

describe('variantCell', () => {
  it('shows a meaningful variant title', () => {
    const html = variantCell(
      names({
        productUrls: new Map([['p1', 'https://mock.pl/p1']]),
        variantTitles: new Map([['v1', '65 / A']]),
      }),
      'p1',
      'v1',
      'shopify'
    );
    expect(html).toContain('>65 / A</a>');
    expect(html).toContain('variant=v1');
  });

  it('shows dashes for a default title variant', () => {
    const html = variantCell(
      names({
        productUrls: new Map([['p1', 'https://mock.pl/p1']]),
        variantTitles: new Map([['v1', 'Default Title']]),
      }),
      'p1',
      'v1',
      'shopify'
    );
    expect(html).toContain('>---</a>');
  });

  it('shows dashes when the variant title is missing', () => {
    const html = variantCell(names({ productUrls: new Map([['p1', 'https://mock.pl/p1']]) }), 'p1', 'v1', 'shopify');
    expect(html).toContain('>---</a>');
  });

  it('renders plain text for non-shopify platforms', () => {
    const html = variantCell(names(), 'p1', 'v1', 'shoper');
    expect(html).toBe('---');
  });
});
