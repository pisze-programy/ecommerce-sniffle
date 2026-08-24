import { describe, expect, it } from "vitest";
import { parseIdoSellSizes, parseIdoSellProductId, parseIdoSellPrice } from "./foodsbyann.ts";

describe("parseIdoSellSizes", () => {
  it("parses exact amount per size", () => {
    const html = '"sizes":{ "uniw": { "type":"uniw", "name":"uniw", "amount":992 } }';
    const sizes = parseIdoSellSizes(html);
    expect(sizes).toEqual([{ id: "uniw", amount: 992 }]);
  });

  it("parses multiple sizes", () => {
    const html = '"sizes":{ "U": { "type":"U", "amount":126 }, "V": { "type":"V", "amount":189 } }';
    const sizes = parseIdoSellSizes(html);
    expect(sizes).toEqual([
      { id: "U", amount: 126 },
      { id: "V", amount: 189 },
    ]);
  });

  it("reads zero amount as sold out", () => {
    const sizes = parseIdoSellSizes('"sizes":{ "uniw": { "type":"uniw", "amount":0 } }');
    expect(sizes[0]?.amount).toBe(0);
  });

  it("returns an empty array when sizes are missing", () => {
    expect(parseIdoSellSizes("<html></html>")).toEqual([]);
  });
});

describe("parseIdoSellProductId", () => {
  it("extracts the id from a product url", () => {
    expect(parseIdoSellProductId("https://foodsbyann.com/product-pol-1711-Levann.html")).toBe("1711");
  });

  it("falls back to the url", () => {
    expect(parseIdoSellProductId("https://foodsbyann.com/other")).toBe("https://foodsbyann.com/other");
  });
});

describe("parseIdoSellPrice", () => {
  it("parses the gross price", () => {
    expect(parseIdoSellPrice('"price":"59.99"')).toBe(59.99);
  });

  it("returns zero when the price is missing", () => {
    expect(parseIdoSellPrice("<html></html>")).toBe(0);
  });
});
