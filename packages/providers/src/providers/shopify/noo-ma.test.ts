import { describe, expect, it } from "vitest";
import { parseNooMaVariantQuantity } from "./noo-ma.ts";

describe("parseNooMaVariantQuantity", () => {
  it("maps the embedded variant id to its quantity", () => {
    const html =
      "product: {\n" +
      "  id: 11020816679179,\n" +
      "  variant: {\n" +
      "    id: 53305303499019,\n" +
      "    title: \"Powder Pink\",\n" +
      "    inventory_quantity: 4\n" +
      "  }\n" +
      "}";
    const inv = parseNooMaVariantQuantity(html);
    expect(inv.get("53305303499019")).toBe(4);
  });

  it("returns an empty map when the marker is missing", () => {
    expect(parseNooMaVariantQuantity("<html></html>").size).toBe(0);
  });

  it("maps zero quantity as sold out", () => {
    const html = "variant: { id: 1, inventory_quantity: 0 }";
    const inv = parseNooMaVariantQuantity(html);
    expect(inv.get("1")).toBe(0);
  });
});
