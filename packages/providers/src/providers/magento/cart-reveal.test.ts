import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import {
  buildMagentoCartRevealProvider,
  extractMagentoFormKey,
  extractMagentoProductId,
  parseMagentoCartQty,
} from "./cart-reveal.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CFG = {
  id: "sklepbazy",
  domain: "sklepbazy.pl",
  platform: "custom" as const,
  schedule: "40 4 * * *",
  window: "both" as const,
  mode: "vps-mutation" as const,
  stockSource: "cart-probe" as const,
  ratePerSecond: 1,
  durationSeconds: 60, requiresProxy: true,
  endpoint: "https://sklepbazy.pl/",
  enabled: true,
};

describe("parseMagentoCartQty", () => {
  it("reads the clamped quantity from the cart input", () => {
    expect(parseMagentoCartQty('<input name="cart[123][qty]" value="726">')).toBe(726);
  });

  it("returns null when the cart has no qty input", () => {
    expect(parseMagentoCartQty("<html>empty cart</html>")).toBeNull();
  });
});

describe("extract helpers", () => {
  it("extracts the form key", () => {
    expect(extractMagentoFormKey('<input name="form_key" type="hidden" value="abc123">')).toBe("abc123");
  });

  it("extracts the product id", () => {
    expect(extractMagentoProductId('data-product-id="17917"')).toBe("17917");
  });
});

describe("buildMagentoCartRevealProvider reveal", () => {
  it("reveals exact stock through the magento cart", async () => {
    const logger = createLogger(() => {});
    const productPage =
      '<input name="form_key" type="hidden" value="fk123">' +
      'data-product-id="17917"' +
      '<form id="product_addtocart_form" action="https://sklepbazy.pl/checkout/cart/add/uenc/abc/product/17917/">';
    const cartPage = '<input name="cart[55][qty]" value="726">';
    const home =
      '<a href="https://sklepbazy.pl/akcesoria">akcesoria</a>';
    const category =
      '<a href="https://sklepbazy.pl/skarpety-blue-doodle">Skarpety</a>';
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url);
        calls.push(u);
        const body =
          u === "https://sklepbazy.pl/"
            ? home
            : u.includes("/akcesoria")
              ? category
              : u.includes("/skarpety-blue-doodle") && init?.method !== "POST"
                ? productPage
                : u.includes("/checkout/cart/add/")
                  ? cartPage
                  : "<html></html>";
        return {
          ok: true,
          status: 200,
          headers: { get: () => "PHPSESSID=xyz" },
          text: async () => body,
          json: async () => JSON.parse(body),
        };
      }),
    );
    const provider = buildMagentoCartRevealProvider(CFG, logger);
    const catalog = await provider.revealStock({ productIds: [] });
    const product = catalog.products[0];
    expect(product?.variants[0]?.quantity).toBe(726);
    expect(calls.some((c) => c.includes("/checkout/cart/add/"))).toBe(true);
  });
});
