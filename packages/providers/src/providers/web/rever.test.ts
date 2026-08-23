import { describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import type { Logger, LogRecord } from "../../logger.ts";
import { decodeHtml, parsePrice, parseProduct, parseSitemapUrls, parseVariationJson } from "./rever.ts";

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

describe("decodeHtml", () => {
  it("decodes numeric entities and nbsp", () => {
    expect(decodeHtml("1 199&nbsp;<span>&#122;&#322;</span>")).toContain("zł");
    expect(decodeHtml("a&amp;b")).toBe("a&b");
  });
});

describe("parsePrice", () => {
  it("parses a PLN price", () => {
    expect(parsePrice("1 199&nbsp;&#122;&#322;")).toBe(1199);
  });

  it("parses a decimal price", () => {
    expect(parsePrice("49,99&nbsp;zł")).toBe(49.99);
  });

  it("returns null for empty input", () => {
    expect(parsePrice("")).toBeNull();
  });
});

describe("parseSitemapUrls", () => {
  it("extracts product urls", () => {
    const xml = '<urlset><url><loc>https://rever.com.pl/</loc></url><url><loc>https://rever.com.pl/produkt/bluza-a/</loc></url></urlset>';
    expect(parseSitemapUrls(xml)).toEqual(["https://rever.com.pl/produkt/bluza-a/"]);
  });

  it("returns an empty array for no product urls", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });
});

describe("parseVariationJson", () => {
  it("parses max_qty and prices per variation", () => {
    const html = '<form data-product_variations="[{&quot;attributes&quot;:{&quot;attribute_pa_rozmiar&quot;:&quot;xs&quot;},&quot;max_qty&quot;:8,&quot;display_price&quot;:899,&quot;display_regular_price&quot;:899,&quot;is_in_stock&quot;:true,&quot;variation_id&quot;:59121}]"></form>';
    const variations = parseVariationJson(html);
    expect(variations).toHaveLength(1);
    expect(variations[0]?.maxQty).toBe(8);
    expect(variations[0]?.displayPrice).toBe(899);
    expect(variations[0]?.isInStock).toBe(true);
  });

  it("returns empty for no variation data", () => {
    expect(parseVariationJson("<div></div>")).toEqual([]);
  });

  it("returns empty for invalid json", () => {
    expect(parseVariationJson('<form data-product_variations="not-json"></form>')).toEqual([]);
  });

  it("logs a warning when the variation json is invalid", () => {
    const capture = capturingLogger();
    expect(parseVariationJson('<form data-product_variations="not-json"></form>', capture.logger)).toEqual([]);
    expect(capture.records[0]?.level).toBe("warn");
    expect(capture.records[0]?.message).toBe("rever.variationJson parse failed");
  });
});

describe("parseProduct", () => {
  it("parses a simple available product with quantity 1", () => {
    const html =
      '<html><head><title>Bluza testowa – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><input type="hidden" name="product_id" value="123"><span class="woocommerce-Price-amount amount"><bdi>299&nbsp;zł</bdi></span></body></html>';
    const product = parseProduct(html, "https://rever.com.pl/produkt/bluza-testowa/");
    expect(product.id).toBe("123");
    expect(product.title).toBe("Bluza testowa");
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]?.available).toBe(true);
    expect(product.variants[0]?.quantity).toBe(1);
    expect(product.variants[0]?.price.amount).toBe(299);
  });

  it("parses a sold out simple product with quantity 0", () => {
    const html =
      '<html><head><title>Marynarka testowa – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><span class="qodef-out-of-stock">Wyprzedane</span><input type="hidden" name="product_id" value="124"><span class="woocommerce-Price-amount amount"><bdi>1999&nbsp;zł</bdi></span></body></html>';
    const product = parseProduct(html, "https://rever.com.pl/produkt/marynarka-testowa/");
    expect(product.variants[0]?.available).toBe(false);
    expect(product.variants[0]?.quantity).toBe(0);
  });

  it("parses a variable product with per-size quantities", () => {
    const html =
      '<html><head><title>Spodnie testowe – rêver Sabina Hajdo - Piórek</title></head>' +
      '<body><form data-product_variations="[{&quot;attributes&quot;:{&quot;attribute_pa_rozmiar&quot;:&quot;m&quot;},&quot;max_qty&quot;:4,&quot;display_price&quot;:890,&quot;display_regular_price&quot;:890,&quot;is_in_stock&quot;:true,&quot;variation_id&quot;:24537}]"></form></body></html>';
    const product = parseProduct(html, "https://rever.com.pl/produkt/spodnie-testowe/");
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]?.title).toBe("m");
    expect(product.variants[0]?.quantity).toBe(4);
  });
});
