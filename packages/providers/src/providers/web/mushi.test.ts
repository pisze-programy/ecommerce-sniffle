import { describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import type { Logger } from "../../logger.ts";
import { decodeHtml, parseProductInfo, parseProduct, parseSitemapUrls } from "./mushi.ts";

function silentLogger(): Logger {
  return createLogger(() => {
    // discard records in tests
  });
}

const IN_STOCK_HTML =
  "<html><head><title>Żelki na sen &amp; Mushi</title></head><body>" +
  '<script>window.__PRODUCT__={price:{net:{value:56.9,currency:"PLN"},gross:{value:69.99,currency:"PLN"},compareAt:{value:0,currency:"PLN"},tax:23},' +
  'stock:{status:"in-stock",stock:616,sellingWhenOutOfStock:false,releaseDate:null}}</script></body></html>';

const PROMO_HTML =
  "<html><head><title>Zestaw Kapsułek</title></head><body>" +
  '<script>stock:{status:"in-stock",stock:266,sellingWhenOutOfStock:false},' +
  'gross:{value:49.99,currency:"PLN"},compareAt:{value:79.99,currency:"PLN"}</script></body></html>';

const OUT_HTML =
  "<html><head><title>Żelki na energię</title></head><body>" +
  'price:{net:{value:56.9},gross:{value:69.99,currency:"PLN"},compareAt:{value:0,currency:"PLN"}},' +
  'stock:{status:"out-of-stock",stock:0,sellingWhenOutOfStock:false}</body></html>';

describe("decodeHtml", () => {
  it("decodes entities", () => {
    expect(decodeHtml("a&amp;b")).toBe("a&b");
    expect(decodeHtml("1 199&nbsp;z&#322;")).toBe("1 199 zł");
  });
});

describe("parseSitemapUrls", () => {
  it("extracts product urls only", () => {
    const xml =
      "<urlset><url><loc>https://www.mushi.pl/</loc></url>" +
      "<url><loc>https://www.mushi.pl/produkt/zelki-na-sen</loc></url></urlset>";
    expect(parseSitemapUrls(xml)).toEqual(["https://www.mushi.pl/produkt/zelki-na-sen"]);
  });

  it("returns an empty array for no product urls", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });
});

describe("parseProductInfo", () => {
  it("reads stock, status and gross price", () => {
    const info = parseProductInfo(IN_STOCK_HTML);
    expect(info.stock).toBe(616);
    expect(info.status).toBe("in-stock");
    expect(info.sellingWhenOutOfStock).toBe(false);
    expect(info.price).toBe(69.99);
    expect(info.compareAt).toBe(0);
  });

  it("reads compareAt for a promotion", () => {
    const info = parseProductInfo(PROMO_HTML);
    expect(info.stock).toBe(266);
    expect(info.compareAt).toBe(79.99);
  });

  it("reads a sold out product", () => {
    const info = parseProductInfo(OUT_HTML);
    expect(info.stock).toBe(0);
    expect(info.status).toBe("out-of-stock");
  });

  it("returns nulls for an unparseable page", () => {
    const info = parseProductInfo("<html></html>");
    expect(info.stock).toBeNull();
    expect(info.price).toBeNull();
  });
});

describe("parseProduct", () => {
  it("parses an in stock product with exact quantity", () => {
    const product = parseProduct(IN_STOCK_HTML, "https://www.mushi.pl/produkt/zelki-na-sen", silentLogger());
    expect(product).not.toBeNull();
    expect(product?.title).toBe("Żelki na sen & Mushi");
    expect(product?.variants).toHaveLength(1);
    const variant = product?.variants[0];
    expect(variant?.quantity).toBe(616);
    expect(variant?.available).toBe(true);
    expect(variant?.price.amount).toBe(69.99);
  });

  it("sets regularPrice when a promotion is active", () => {
    const product = parseProduct(PROMO_HTML, "https://www.mushi.pl/produkt/zestaw-kapsulek", silentLogger());
    const variant = product?.variants[0];
    expect(variant?.price.amount).toBe(49.99);
    expect(variant?.regularPrice?.amount).toBe(79.99);
  });

  it("marks a sold out product", () => {
    const product = parseProduct(OUT_HTML, "https://www.mushi.pl/produkt/zelki-na-energie", silentLogger());
    const variant = product?.variants[0];
    expect(variant?.quantity).toBe(0);
    expect(variant?.available).toBe(false);
  });

  it("keeps the on-hand quantity when backorder is allowed", () => {
    const html =
      "<html><head><title>Stress Free</title></head><body>" +
      'stock:{status:"in-stock",stock:47,sellingWhenOutOfStock:true},' +
      'gross:{value:129.99,currency:"PLN"}</body></html>';
    const product = parseProduct(html, "https://www.mushi.pl/produkt/stress-free", silentLogger());
    const variant = product?.variants[0];
    expect(variant?.quantity).toBe(47);
    expect(variant?.available).toBe(true);
  });

  it("returns null when the page cannot be parsed", () => {
    expect(parseProduct("<html></html>", "https://www.mushi.pl/produkt/x", silentLogger())).toBeNull();
  });
});
