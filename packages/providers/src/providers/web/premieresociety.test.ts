import { describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import type { Logger } from "../../logger.ts";
import {
  decodeHtml,
  parseProductUrls,
  parseProductInfo,
  parseProduct,
  productAndVariantIds,
} from "./premieresociety.ts";

function silentLogger(): Logger {
  return createLogger(() => {
    // discard records in tests
  });
}

const IN_STOCK_HTML =
  "<html><head><title>NECKLACE SEX MOONSTONE</title></head><body>" +
  '<script type="application/ld+json">{"@type":"Product","name":"NECKLACE SEX MOONSTONE","offers":{"@type":"Offer","priceCurrency":"PLN","price":"395","availability":"https://schema.org/InStock"}}</script>' +
  '<input type="hidden" name="stripe_product_quantity" id="stripe_product_quantity" value="98"/>' +
  "</body></html>";

const OUT_HTML =
  "<html><head><title>TEE</title></head><body>" +
  '<script type="application/ld+json">{"@type":"Product","name":"TEE","offers":{"@type":"Offer","priceCurrency":"PLN","price":"219","availability":"https://schema.org/OutOfStock"}}</script>' +
  '<input type="hidden" name="stripe_product_quantity" id="stripe_product_quantity" value="0"/>' +
  "</body></html>";

describe("decodeHtml", () => {
  it("decodes entities", () => {
    expect(decodeHtml("a&amp;b")).toBe("a&b");
  });
});

describe("parseProductUrls", () => {
  it("extracts product urls from a category page", () => {
    const html =
      '<a href="/pl/sklep/316-necklace-sex-moonstone.html">x</a>' +
      '<a href="https://premieresociety.com/pl/sklep/551-2287-basic-regular-cut-hoodie.html">y</a>' +
      '<a href="/pl/sklep?page=2">next</a>';
    const urls = parseProductUrls(html);
    expect(urls).toEqual([
      "https://premieresociety.com/pl/sklep/316-necklace-sex-moonstone.html",
      "https://premieresociety.com/pl/sklep/551-2287-basic-regular-cut-hoodie.html",
    ]);
  });

  it("dedupes repeated urls", () => {
    const html = '<a href="/pl/sklep/316-a.html">a</a><a href="/pl/sklep/316-a.html">b</a>';
    expect(parseProductUrls(html)).toHaveLength(1);
  });

  it("returns an empty array for a page without products", () => {
    expect(parseProductUrls("<html></html>")).toEqual([]);
  });
});

describe("parseProductInfo", () => {
  it("reads quantity, price and availability", () => {
    const info = parseProductInfo(IN_STOCK_HTML);
    expect(info.quantity).toBe(98);
    expect(info.price).toBe(395);
    expect(info.available).toBe(true);
  });

  it("reads a sold out product", () => {
    const info = parseProductInfo(OUT_HTML);
    expect(info.quantity).toBe(0);
    expect(info.available).toBe(false);
  });

  it("returns nulls for an unparseable page", () => {
    const info = parseProductInfo("<html></html>");
    expect(info.quantity).toBeNull();
    expect(info.price).toBeNull();
  });
});

describe("productAndVariantIds", () => {
  it("extracts the product id from a plain url", () => {
    const ids = productAndVariantIds("https://premieresociety.com/pl/sklep/316-necklace-sex-moonstone.html");
    expect(ids.productId).toBe("316");
    expect(ids.variantId).toBe("https://premieresociety.com/pl/sklep/316-necklace-sex-moonstone.html");
  });

  it("extracts the product id from a combination url", () => {
    const ids = productAndVariantIds("https://premieresociety.com/pl/sklep/551-2287-basic-hoodie.html");
    expect(ids.productId).toBe("551");
  });
});

describe("parseProduct", () => {
  it("parses an in stock product with exact quantity", () => {
    const url = "https://premieresociety.com/pl/sklep/316-necklace-sex-moonstone.html";
    const product = parseProduct(IN_STOCK_HTML, url, silentLogger());
    expect(product).not.toBeNull();
    expect(product?.id).toBe("316");
    expect(product?.title).toBe("NECKLACE SEX MOONSTONE");
    const variant = product?.variants[0];
    expect(variant?.quantity).toBe(98);
    expect(variant?.available).toBe(true);
    expect(variant?.price.amount).toBe(395);
  });

  it("marks a sold out product", () => {
    const url = "https://premieresociety.com/pl/sklep/323-1291-sparkle-tee-black.html";
    const product = parseProduct(OUT_HTML, url, silentLogger());
    const variant = product?.variants[0];
    expect(variant?.quantity).toBe(0);
    expect(variant?.available).toBe(false);
  });

  it("returns null when the page cannot be parsed", () => {
    expect(parseProduct("<html></html>", "https://premieresociety.com/pl/sklep/1-x.html", silentLogger())).toBeNull();
  });
});
