import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import type { LogRecord, Logger } from "../../logger.ts";
import {
  decodeHtml,
  parseOffer,
  parseProduct,
  parseSitemapUrls,
  parseStockBlock,
  royalwatchModule,
} from "./royalwatch.ts";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

function response(ok: boolean, status: number, body: string) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

function productHtml(stockClass: string, stockText: string, availability: string): string {
  return (
    "<html><head><title>PIAGET ALTIPLANO &amp; ROSE</title></head><body>" +
    `<script type="application/ld+json">{"@type":"Product","name":"X","offers":[{"@type":"Offer","price":"34900.00","priceCurrency":"PLN","availability":"http://schema.org/${availability}"}]}</script>` +
    `<p class="stock ${stockClass}">${stockText}</p>` +
    "</body></html>"
  );
}

describe("decodeHtml", () => {
  it("decodes entities", () => {
    expect(decodeHtml("a&amp;b")).toBe("a&b");
    expect(decodeHtml("1 199&nbsp;z&#322;")).toBe("1 199 zł");
  });
});

describe("parseSitemapUrls", () => {
  it("extracts product urls only", () => {
    const xml =
      "<urlset><url><loc>https://www.royalwatch.pl/sklep/</loc></url>" +
      "<url><loc>https://www.royalwatch.pl/produkt/piaget-altiplano/</loc></url></urlset>";
    expect(parseSitemapUrls(xml)).toEqual(["https://www.royalwatch.pl/produkt/piaget-altiplano/"]);
  });

  it("returns an empty array for no product urls", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });
});

describe("parseOffer", () => {
  it("reads price and availability from the offer", () => {
    const offer = parseOffer(
      '<script type="application/ld+json">{"offers":[{"@type":"Offer","price":"34900.00","availability":"http://schema.org/InStock"}]}</script>',
    );
    expect(offer.price).toBe(34900);
    expect(offer.available).toBe(true);
  });

  it("reads availability with escaped slashes", () => {
    const offer = parseOffer(
      '<script type="application/ld+json">{"offers":[{"@type":"Offer","price":"8900.00","availability":"http:\\/\\/schema.org\\/OutOfStock"}]}</script>',
    );
    expect(offer.available).toBe(false);
    expect(offer.price).toBe(8900);
  });

  it("marks an out of stock offer", () => {
    const offer = parseOffer(
      '<script type="application/ld+json">{"offers":[{"@type":"Offer","price":"1900.00","availability":"http://schema.org/OutOfStock"}]}</script>',
    );
    expect(offer.available).toBe(false);
  });

  it("returns nulls when the offer is missing", () => {
    expect(parseOffer("<html></html>")).toEqual({ price: null, available: null });
  });
});

describe("parseStockBlock", () => {
  it("reads the exact quantity", () => {
    expect(parseStockBlock('<p class="stock in-stock">1 in stock</p>')).toEqual({
      quantity: 1,
      available: true,
    });
  });

  it("reads a larger quantity", () => {
    expect(parseStockBlock('<p class="stock in-stock">12 in stock</p>')).toEqual({
      quantity: 12,
      available: true,
    });
  });

  it("marks an out of stock block", () => {
    expect(parseStockBlock('<p class="stock out-of-stock">out of stock</p>')).toEqual({
      quantity: null,
      available: false,
    });
  });

  it("returns defaults when the block is missing", () => {
    expect(parseStockBlock("<html></html>")).toEqual({ quantity: null, available: false });
  });
});

describe("parseProduct", () => {
  it("parses an in stock product with exact quantity", () => {
    const product = parseProduct(
      productHtml("in-stock", "1 in stock", "InStock"),
      "https://www.royalwatch.pl/produkt/piaget-altiplano/",
    );
    expect(product).not.toBeNull();
    expect(product?.id).toBe("https://www.royalwatch.pl/produkt/piaget-altiplano/");
    expect(product?.title).toBe("PIAGET ALTIPLANO & ROSE");
    expect(product?.variants).toHaveLength(1);
    const variant = product?.variants[0];
    expect(variant?.quantity).toBe(1);
    expect(variant?.available).toBe(true);
    expect(variant?.price.amount).toBe(34900);
  });

  it("parses a sold out product with quantity 0", () => {
    const product = parseProduct(
      productHtml("out-of-stock", "out of stock", "OutOfStock"),
      "https://www.royalwatch.pl/produkt/x/",
    );
    expect(product).not.toBeNull();
    const variant = product?.variants[0];
    expect(variant?.available).toBe(false);
    expect(variant?.quantity).toBe(0);
  });

  it("returns null when the offer price is missing", () => {
    expect(parseProduct("<html><body>no price</body></html>", "https://www.royalwatch.pl/produkt/x/")).toBeNull();
  });
});

describe("royalwatchModule", () => {
  const SITEMAP =
    "<urlset><url><loc>https://www.royalwatch.pl/produkt/a/</loc></url>" +
    "<url><loc>https://www.royalwatch.pl/produkt/b/</loc></url></urlset>";

  it("fetches the catalog and skips failing products with a warn log", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (url === "https://www.royalwatch.pl/product-sitemap.xml") {
          return response(true, 200, SITEMAP);
        }
        if (url === "https://www.royalwatch.pl/produkt/a/") {
          return response(true, 200, productHtml("in-stock", "1 in stock", "InStock"));
        }
        return response(false, 500, "error");
      }),
    );
    const provider = royalwatchModule.build({ logger: capture.logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.url).toBe("https://www.royalwatch.pl/produkt/a/");
    const warns = capture.records.filter((record) => record.message === "royalwatch.product fetch failed");
    expect(warns.length).toBeGreaterThan(0);
    const retryFailed = capture.records.filter((record) => record.message === "royalwatch.product retry failed");
    expect(retryFailed.length).toBeGreaterThan(0);
  });

  it("recovers a failed product on the retry pass", async () => {
    const capture = capturingLogger();
    const attempts: Record<string, number> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (url === "https://www.royalwatch.pl/product-sitemap.xml") {
          return response(true, 200, SITEMAP);
        }
        if (url === "https://www.royalwatch.pl/produkt/a/") {
          return response(true, 200, productHtml("in-stock", "1 in stock", "InStock"));
        }
        attempts[String(url)] = (attempts[String(url)] ?? 0) + 1;
        if (attempts[String(url)] === 1) {
          return response(false, 500, "error");
        }
        return response(true, 200, productHtml("in-stock", "1 in stock", "InStock"));
      }),
    );
    const provider = royalwatchModule.build({ logger: capture.logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(2);
    const retryFailed = capture.records.filter((record) => record.message === "royalwatch.product retry failed");
    expect(retryFailed).toHaveLength(0);
  });
});
