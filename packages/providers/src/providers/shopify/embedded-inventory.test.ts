import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEmbeddedInventoryProvider,
  fetchShopifyCookie,
  parseBisVariantData,
  parseRestockRocketQuantity,
  parseShopifyJsInventory,
  parseVariantInventoryData,
} from "./embedded-inventory.ts";
import { createLogger } from "../../logger.ts";
import type { LogRecord } from "../../logger.ts";
import type { DirectFetch, DirectFetchResponse } from "../../module.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const BIS_HTML =
  '<script id="bis-variant-data" type="application/json">' +
  '[{"id":53670923403593,"title":"SHORT","price":119000,"available":true,"inventory_quantity":4},' +
  '{"id":53670923436361,"title":"REGULAR","price":119000,"available":true,"inventory_quantity":0}]' +
  "</script>";

const VARIANT_INV_HTML =
  '<script type="application/json" id="variantInventoryData">' +
  '[{"id":"53967052046675","sku":"260MR500-00","inventory_quantity":93},' +
  '{"id":"53967052079443","sku":"260MR500-01","inventory_quantity":0}]' +
  "</script>";

describe("parseBisVariantData", () => {
  it("extracts inventory per variant", () => {
    const inv = parseBisVariantData(BIS_HTML);
    expect(inv.get("53670923403593")).toBe(4);
    expect(inv.get("53670923436361")).toBe(0);
    expect(inv.size).toBe(2);
  });

  it("returns an empty map for a page without the script", () => {
    expect(parseBisVariantData("<html></html>").size).toBe(0);
  });
});

describe("parseVariantInventoryData", () => {
  it("extracts inventory per variant", () => {
    const inv = parseVariantInventoryData(VARIANT_INV_HTML);
    expect(inv.get("53967052046675")).toBe(93);
    expect(inv.get("53967052079443")).toBe(0);
    expect(inv.size).toBe(2);
  });

  it("returns an empty map for a page without the script", () => {
    expect(parseVariantInventoryData("<html></html>").size).toBe(0);
  });
});

describe("parseRestockRocketQuantity", () => {
  const HTML =
    "window._RestockRocketConfig.variantsPolicy = {1:\"deny\"};\n" +
    "window._RestockRocketConfig.variantsInventoryQuantity = {100 : parseInt(\"18\"),200 : parseInt(\"0\"),300 : parseInt(\"\")};\n" +
    "window._RestockRocketConfig.variantsPreorderCount = {};";

  it("extracts quantities for variants with a number", () => {
    const inv = parseRestockRocketQuantity(HTML);
    expect(inv.get("100")).toBe(18);
    expect(inv.get("200")).toBe(0);
    expect(inv.size).toBe(2);
  });

  it("skips an empty quantity value", () => {
    const inv = parseRestockRocketQuantity(HTML);
    expect(inv.has("300")).toBe(false);
  });

  it("returns an empty map when the config is missing", () => {
    expect(parseRestockRocketQuantity("<html></html>").size).toBe(0);
  });

  it("extracts negative quantities for gift cards", () => {
    const html =
      "window._RestockRocketConfig.variantsInventoryQuantity = {400 : parseInt(\"-3\"),500 : parseInt(\"-19\")};";
    const inv = parseRestockRocketQuantity(html);
    expect(inv.get("400")).toBe(-3);
    expect(inv.get("500")).toBe(-19);
  });
});

describe("parseShopifyJsInventory", () => {
  it("maps variant ids to inventory from a js payload", () => {
    const body = JSON.stringify({
      variants: [
        { id: 111, inventory_quantity: 4 },
        { id: 222, inventory_quantity: 0 },
      ],
    });
    const inv = parseShopifyJsInventory(body);
    expect(inv.get("111")).toBe(4);
    expect(inv.get("222")).toBe(0);
    expect(inv.size).toBe(2);
  });

  it("returns an empty map for invalid json", () => {
    expect(parseShopifyJsInventory("not-json").size).toBe(0);
  });

  it("returns an empty map when variants are missing", () => {
    expect(parseShopifyJsInventory('{"id":1}').size).toBe(0);
  });
});

function jsonResponse(body: unknown, status = 200): DirectFetchResponse {
  const encoded = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => encoded,
    arrayBuffer: async () => Buffer.from(encoded).buffer as ArrayBuffer,
  };
}

function config(ratePerSecond: number) {
  return {
    id: "test",
    domain: "test-shop.pl",
    platform: "shopify" as const,
    schedule: "0 4 * * *",
    window: "both" as const,
    mode: "cf-get" as const,
    stockSource: "embedded-json" as const,
    ratePerSecond,
    durationSeconds: 60, requiresProxy: false,
    endpoint: "https://test-shop.pl/products.json",
    enabled: true,
  };
}

function catalogBody(): unknown {
  return {
    products: [
      {
        id: 1,
        handle: "one",
        title: "One",
        variants: [
          { id: 11, title: "S", price: "10.00", compare_at_price: null, available: true, inventory_quantity: null },
        ],
      },
      {
        id: 2,
        handle: "two",
        title: "Two",
        variants: [
          { id: 12, title: "S", price: "10.00", compare_at_price: null, available: true, inventory_quantity: null },
        ],
      },
      {
        id: 3,
        handle: "three",
        title: "Three",
        variants: [
          { id: 13, title: "S", price: "10.00", compare_at_price: null, available: true, inventory_quantity: null },
        ],
      },
    ],
  };
}

const ONE_HTML =
  '<script id="bis-variant-data" type="application/json">[{"id":11,"inventory_quantity":5}]</script>';
const THREE_HTML =
  '<script id="bis-variant-data" type="application/json">[{"id":13,"inventory_quantity":7}]</script>';

function makeFetch(
  handler: (url: string) => DirectFetchResponse | "throw",
): DirectFetch {
  return async (input: string | URL | Request): Promise<DirectFetchResponse> => {
    const url = String(input);
    const result = handler(url);
    if (result === "throw") {
      throw new Error("network down");
    }
    return result;
  };
}

describe("buildEmbeddedInventoryProvider", () => {
  it("enriches all products even when one page has no script", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes("/products.json")) {
        return jsonResponse(catalogBody());
      }
      if (url.includes("/products/one")) {
        return jsonResponse(ONE_HTML);
      }
      if (url.includes("/products/two")) {
        return jsonResponse("<html>no script</html>");
      }
      if (url.includes("/products/three")) {
        return jsonResponse(THREE_HTML);
      }
      return jsonResponse("not found", 404);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(3);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(5);
    expect(catalog.products[1]?.variants[0]?.quantity).toBeNull();
    expect(catalog.products[2]?.variants[0]?.quantity).toBe(7);
  });

  it("keeps a product unchanged and logs when the page fetch fails", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const fetchFn = makeFetch((url) => {
      if (url.includes("/products.json")) {
        return jsonResponse(catalogBody());
      }
      if (url.includes("/products/one")) {
        return jsonResponse(ONE_HTML);
      }
      if (url.includes("/products/two")) {
        return "throw";
      }
      if (url.includes("/products/three")) {
        return jsonResponse(THREE_HTML);
      }
      return jsonResponse("not found", 404);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[1]?.variants[0]?.quantity).toBeNull();
    const warn = records.find((record) => record.message === "embedded.product fetch failed");
    expect(warn?.level).toBe("warn");
    expect(warn?.context["productId"]).toBe("2");
  });

  it("maps a negative embedded quantity to buyable 1", async () => {
    const logger = createLogger(() => {});
    const RR_HTML = '<html>window._RestockRocketConfig.variantsInventoryQuantity = {11 : parseInt("-3")};</html>';
    const fetchFn = makeFetch((url) => {
      if (url.includes("/products.json")) {
        return jsonResponse(catalogBody());
      }
      return jsonResponse(RR_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseRestockRocketQuantity, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(1);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
  });

  it("paces fetches according to ratePerSecond", async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout.bind(globalThis);
    vi.stubGlobal(
      "setTimeout",
      ((callback: () => void, ms?: number): ReturnType<typeof setTimeout> => {
        delays.push(ms ?? 0);
        return realSetTimeout(callback, 0);
      }) as typeof setTimeout,
    );
    const logger = createLogger(() => {});
    const fetchFn = makeFetch((url) => {
      if (url.includes("/products.json")) {
        return jsonResponse(catalogBody());
      }
      return jsonResponse(ONE_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(4), logger, parseBisVariantData, fetchFn);
    await provider.fetchCatalog();
    expect(delays).toEqual([250, 250]);
  });
});

describe("fetchShopifyCookie", () => {
  it("joins every cookie from the set-cookie headers", async () => {
    const logger = createLogger(() => {});
    const headers = new Headers();
    headers.append("set-cookie", "localization=PL; path=/");
    headers.append("set-cookie", "cart_currency=PLN; path=/");
    const mockResponse = {
      headers,
      body: { cancel: async () => {} },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));
    const cookie = await fetchShopifyCookie("gymglamour.com", logger);
    expect(cookie).toBe("localization=PL; cart_currency=PLN");
  });

  it("returns null when the shop sets no cookie", async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: new Headers(),
        body: { cancel: async () => {} },
      }),
    );
    const cookie = await fetchShopifyCookie("gymglamour.com", logger);
    expect(cookie).toBeNull();
  });
});

describe("cookie rotation on a persistent 429", () => {
  it("rotates the cookie and retries after a 429", async () => {
    const records: LogRecord[] = [];
    const logger = createLogger((record) => {
      records.push(record);
    });
    const headers = new Headers();
    headers.append("set-cookie", "localization=PL; path=/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers,
        body: { cancel: async () => {} },
      }),
    );
    let pageCalls = 0;
    const fetchFn = vi.fn(async (url: unknown) => {
      if (String(url).includes("/products.json")) {
        return jsonResponse(catalogBody());
      }
      pageCalls += 1;
      if (pageCalls <= 3) {
        return jsonResponse("rate limited", 429);
      }
      return jsonResponse(ONE_HTML);
    });
    const provider = buildEmbeddedInventoryProvider(config(0), logger, parseBisVariantData, fetchFn);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(5);
    expect(
      records.some((record) => record.message === "shopify.rotation"),
    ).toBe(true);
    expect(
      records.some((record) => record.message === "shopify.cookie" && record.context["reason"] === "session-start"),
    ).toBe(true);
  });
});
