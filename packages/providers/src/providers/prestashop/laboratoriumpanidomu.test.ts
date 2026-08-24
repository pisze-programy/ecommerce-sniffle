import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import type { LogRecord, Logger } from "../../logger.ts";
import {
  buildPrestaShopCartRevealProvider,
  extractCookies,
  extractPrestaProductId,
  extractPrestaTitle,
  extractPrestaToken,
  parsePrestaCartPrice,
  parsePrestaCartQuantity,
} from "./laboratoriumpanidomu.ts";

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

const CFG = {
  id: "laboratoriumpanidomu",
  domain: "laboratoriumpanidomu.pl",
  platform: "prestashop" as const,
  schedule: "0 10 * * *",
  window: "both" as const,
  mode: "vps-mutation" as const,
  stockSource: "cart-probe" as const,
  ratePerSecond: 0,
  durationSeconds: 60, requiresProxy: true,
  endpoint: "https://laboratoriumpanidomu.pl/",
  enabled: true,
};

describe("parsePrestaCartQuantity", () => {
  it("reads the clamp message from the errors", () => {
    const text = JSON.stringify({
      hasError: true,
      errors: ['Możesz kupić tylko 958580 sztuk produktu o nazwie "X". Proszę dostosować ilość.'],
      quantity: 958580,
    });
    expect(parsePrestaCartQuantity(text)).toBe(958580);
  });

  it("reads the available quantity from the phlov message", () => {
    const text = JSON.stringify({
      hasError: true,
      errors: ["Dostępna ilość w zamówieniu dla tego produktu to 437."],
      quantity: 0,
    });
    expect(parsePrestaCartQuantity(text)).toBe(437);
  });

  it("reads a negative available quantity", () => {
    const text = JSON.stringify({
      hasError: true,
      errors: ["Dostępna ilość w zamówieniu dla tego produktu to -100."],
      quantity: 0,
    });
    expect(parsePrestaCartQuantity(text)).toBe(-100);
  });

  it("reads the quantity from the cart product", () => {
    const text = JSON.stringify({
      id_product: 1928,
      cart: { products: [{ id_product: 1928, quantity: 1000 }] },
    });
    expect(parsePrestaCartQuantity(text)).toBe(1000);
  });

  it("returns null for invalid json", () => {
    expect(parsePrestaCartQuantity("not-json")).toBeNull();
  });

  it("returns null when the cart has no products", () => {
    expect(parsePrestaCartQuantity('{"cart":{"products":[]}}')).toBeNull();
  });
});

describe("parsePrestaCartPrice", () => {
  it("reads the product price", () => {
    const text = JSON.stringify({ cart: { products: [{ id_product: 1, price: 59.99 }] } });
    expect(parsePrestaCartPrice(text)).toBe(59.99);
  });

  it("returns null when the price is missing", () => {
    expect(parsePrestaCartPrice('{"cart":{}}')).toBeNull();
  });
});

describe("extract helpers", () => {
  it("extracts the product id from a prestashop url", () => {
    expect(extractPrestaProductId("https://laboratoriumpanidomu.pl/produkty-d-lux/1928-d-lux-plyn.html")).toBe("1928");
  });

  it("extracts the csrf token", () => {
    expect(extractPrestaToken('<input type="hidden" name="token" value="abc123">')).toBe("abc123");
  });

  it("extracts cookies from set-cookie", () => {
    expect(extractCookies("PHPSESSID=abc; path=/; HttpOnly, PrestaShop-1=xyz; path=/")).toContain("PHPSESSID=abc");
    expect(extractCookies(null)).toBeNull();
  });

  it("builds a title from the url slug", () => {
    expect(extractPrestaTitle("https://laboratoriumpanidomu.pl/x/1928-d-lux-plyn-1-l.html")).toBe("d lux plyn 1 l");
  });
});

describe("buildPrestaShopCartRevealProvider reveal", () => {
  it("reveals exact stock through the cart ajax", async () => {
    const capture = capturingLogger();
    const productPage =
      '<form action="https://laboratoriumpanidomu.pl/koszyk">' +
      '<input type="hidden" name="token" value="tok123">' +
      '<input type="hidden" name="id_product" value="1928">' +
      "</form>";
    const clampJson = JSON.stringify({
      hasError: true,
      errors: ["Możesz kupić tylko 958580 sztuk"],
      quantity: 958580,
    });
    const provider = buildPrestaShopCartRevealProvider(CFG, capture.logger);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        calls.push(u);
        const body =
          u === "https://laboratoriumpanidomu.pl/"
            ? '<a href="/741-produkty-d-lux">category</a>'
            : u.includes("741-produkty-d-lux")
              ? '<a href="/produkty-d-lux/1928-d-lux-plyn.html">product</a>'
              : u.includes("produkty-d-lux/1928")
                ? productPage
                : u.includes("/koszyk")
                  ? clampJson
                  : "<html></html>";
        const text = () => Promise.resolve(body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => (u.includes("produkty-d-lux/1928") ? "PHPSESSID=abc" : null) },
          text,
          json: async () => JSON.parse(await text()),
        };
      }),
    );
    const catalog = await provider.revealStock({ productIds: [] });
    const product = catalog.products[0];
    expect(product?.variants[0]?.quantity).toBe(958580);
    expect(product?.variants[0]?.available).toBe(true);
    const postCall = calls.find((u) => u.includes("/koszyk"));
    expect(postCall).toBeDefined();
  });
});
