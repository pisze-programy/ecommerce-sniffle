import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../../../../packages/providers/src/logger.ts';
import type { Logger, LogRecord } from '../../../../../../packages/providers/src/logger.ts';
import {
  decodeHtml,
  parseGtmProductData,
  parsePrice,
  parseProduct,
  parseProductId,
  parseSitemapUrls,
  parseVariationJson,
  resolveQuantity,
} from '../../../../../../packages/providers/src/providers/web/rever.ts';

interface Capture {
  readonly records: LogRecord[];
  readonly logger: Logger;
}

function capturingLogger(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

describe('decodeHtml', () => {
  it('decodes numeric entities and nbsp', () => {
    expect(decodeHtml('1 199&nbsp;<span>&#122;&#322;</span>')).toContain('zł');
    expect(decodeHtml('a&amp;b')).toBe('a&b');
  });
});

describe('parsePrice', () => {
  it('parses a PLN price', () => {
    expect(parsePrice('1 199&nbsp;&#122;&#322;')).toBe(1199);
  });

  it('parses a decimal price', () => {
    expect(parsePrice('49,99&nbsp;zł')).toBe(49.99);
  });

  it('returns null for empty input', () => {
    expect(parsePrice('')).toBeNull();
  });
});

describe('parseSitemapUrls', () => {
  it('extracts product urls', () => {
    const xml =
      '<urlset><url><loc>https://rever.com.pl/</loc></url><url><loc>https://rever.com.pl/produkt/bluza-a/</loc></url></urlset>';
    expect(parseSitemapUrls(xml)).toEqual(['https://rever.com.pl/produkt/bluza-a/']);
  });

  it('returns an empty array for no product urls', () => {
    expect(parseSitemapUrls('<urlset></urlset>')).toEqual([]);
  });
});

describe('parseVariationJson', () => {
  it('parses max_qty and prices per variation', () => {
    const html =
      '<form data-product_variations="[{&quot;attributes&quot;:{&quot;attribute_pa_rozmiar&quot;:&quot;xs&quot;},&quot;max_qty&quot;:8,&quot;display_price&quot;:899,&quot;display_regular_price&quot;:899,&quot;is_in_stock&quot;:true,&quot;variation_id&quot;:59121}]"></form>';
    const variations = parseVariationJson(html);
    expect(variations).toHaveLength(1);
    expect(variations[0]?.maxQty).toBe(8);
    expect(variations[0]?.displayPrice).toBe(899);
    expect(variations[0]?.isInStock).toBe(true);
  });

  it('returns empty for no variation data', () => {
    expect(parseVariationJson('<div></div>')).toEqual([]);
  });

  it('returns empty for invalid json', () => {
    expect(parseVariationJson('<form data-product_variations="not-json"></form>')).toEqual([]);
  });

  it('logs a warning when the variation json is invalid', () => {
    const capture = capturingLogger();
    expect(parseVariationJson('<form data-product_variations="not-json"></form>', capture.logger)).toEqual([]);
    expect(capture.records[0]?.level).toBe('warn');
    expect(capture.records[0]?.message).toBe('rever.variationJson parse failed');
  });
});

describe('parseProduct', () => {
  it('parses a simple available product with masked quantity', () => {
    const html =
      '<html><head><title>Bluza testowa – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><input type="hidden" name="product_id" value="123"><span class="woocommerce-Price-amount amount"><bdi>299&nbsp;zł</bdi></span></body></html>';
    const product = parseProduct(html, 'https://rever.com.pl/produkt/bluza-testowa/');
    expect(product.id).toBe('123');
    expect(product.title).toBe('Bluza testowa');
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]?.available).toBe(true);
    expect(product.variants[0]?.quantity).toBeNull();
    expect(product.variants[0]?.price.amount).toBe(299);
  });

  it('reads the exact stock of a simple product from the gtm data', () => {
    const html =
      '<html><head><title>Peleryna testowa – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><form class="cart"><button type="submit" name="add-to-cart" value="95079">Kup</button></form>' +
      '<input type="hidden" name="gtm4wp_product_data" value="{&quot;internal_id&quot;:95079,&quot;price&quot;:549,&quot;stocklevel&quot;:7,&quot;stockstatus&quot;:&quot;instock&quot;}"/></body></html>';
    const product = parseProduct(html, 'https://rever.com.pl/produkt/peleryna-testowa/');
    expect(product.id).toBe('95079');
    expect(product.variants[0]?.id).toBe('95079');
    expect(product.variants[0]?.available).toBe(true);
    expect(product.variants[0]?.quantity).toBe(7);
  });

  it('reads a simple product with no stock level as masked', () => {
    const html =
      '<html><head><title>Gumka testowa – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><form class="cart"><button type="submit" name="add-to-cart" value="95439">Kup</button></form>' +
      '<input type="hidden" name="gtm4wp_product_data" value="{&quot;internal_id&quot;:95439,&quot;stockstatus&quot;:&quot;instock&quot;}"/></body></html>';
    const product = parseProduct(html, 'https://rever.com.pl/produkt/gumka-testowa/');
    expect(product.id).toBe('95439');
    expect(product.variants[0]?.available).toBe(true);
    expect(product.variants[0]?.quantity).toBeNull();
  });

  it('parses a sold out simple product with quantity 0', () => {
    const html =
      '<html><head><title>Marynarka testowa – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><span class="qodef-out-of-stock">Wyprzedane</span><input type="hidden" name="product_id" value="124"><span class="woocommerce-Price-amount amount"><bdi>1999&nbsp;zł</bdi></span></body></html>';
    const product = parseProduct(html, 'https://rever.com.pl/produkt/marynarka-testowa/');
    expect(product.variants[0]?.available).toBe(false);
    expect(product.variants[0]?.quantity).toBe(0);
  });

  it('parses a variable product with per-size quantities', () => {
    const html =
      '<html><head><title>Spodnie testowe – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><form data-product_variations="[{&quot;attributes&quot;:{&quot;attribute_pa_rozmiar&quot;:&quot;m&quot;},&quot;max_qty&quot;:4,&quot;display_price&quot;:890,&quot;display_regular_price&quot;:890,&quot;is_in_stock&quot;:true,&quot;variation_id&quot;:24537}]"></form></body></html>';
    const product = parseProduct(html, 'https://rever.com.pl/produkt/spodnie-testowe/');
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]?.title).toBe('m');
    expect(product.variants[0]?.quantity).toBe(4);
  });
});

describe('parseGtmProductData', () => {
  it('reads the id, the stock level and the status', () => {
    const html =
      '<input type="hidden" name="gtm4wp_product_data" value="{&quot;internal_id&quot;:95079,&quot;stocklevel&quot;:7,&quot;stockstatus&quot;:&quot;instock&quot;}"/>';
    const data = parseGtmProductData(html);
    expect(data?.internalId).toBe(95079);
    expect(data?.stockLevel).toBe(7);
    expect(data?.stockStatus).toBe('instock');
  });

  it('keeps the stock level null when the shop does not send it', () => {
    const html =
      '<input type="hidden" name="gtm4wp_product_data" value="{&quot;internal_id&quot;:95439,&quot;stockstatus&quot;:&quot;instock&quot;}"/>';
    const data = parseGtmProductData(html);
    expect(data?.internalId).toBe(95439);
    expect(data?.stockLevel).toBeNull();
  });

  it('returns null for a missing or invalid block', () => {
    expect(parseGtmProductData('<div></div>')).toBeNull();
    expect(parseGtmProductData('<input name="gtm4wp_product_data" value="not-json"/>')).toBeNull();
  });
});

describe('parseProductId', () => {
  it('reads the hidden product_id input first', () => {
    const html = '<input type="hidden" name="product_id" value="123"/>';
    expect(parseProductId(html)).toBe('123');
  });

  it('reads the add-to-cart button value for a simple product', () => {
    const html = '<button type="submit" name="add-to-cart" value="95079">Kup</button>';
    expect(parseProductId(html)).toBe('95079');
  });

  it('falls back to the gtm internal id', () => {
    const html = '<input name="gtm4wp_product_data" value="{&quot;internal_id&quot;:95079}"/>';
    expect(parseProductId(html)).toBe('95079');
  });

  it('returns null when no id exists', () => {
    expect(parseProductId('<div></div>')).toBeNull();
  });
});

describe('resolveQuantity', () => {
  it('keeps the exact quantity when the shop tracks it', () => {
    expect(resolveQuantity(5, true)).toBe(5);
    expect(resolveQuantity(0, false)).toBe(0);
  });

  it('returns zero when the shop does not track and the product is out of stock', () => {
    expect(resolveQuantity(null, false)).toBe(0);
  });

  it('returns masked when the shop does not track and the product is in stock', () => {
    expect(resolveQuantity(null, true)).toBeNull();
  });

  it('returns null when neither the quantity nor the availability is known', () => {
    expect(resolveQuantity(null, null)).toBeNull();
  });
});
