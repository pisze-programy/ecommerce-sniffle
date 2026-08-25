import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import { buildEmbeddedQtyProvider, fetchMagentoCookie, parseCurrency, parseEmbeddedQty } from "./embedded-qty.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function blockHtml(price: string, productId: string, variants: string, skus: string): string {
  return (
    `...,"finalPrice":{"amount":${price}},"productId":"${productId}",` +
    `"chooseText":"Wybierz...","images":[],"index":{${variants}},"salable":[],` +
    `"canDisplayShowOutOfStockStatus":false,"channel":"website","salesChannelCode":"base","sku":{${skus}}}`
  );
}

function cardHtml(id: string, url: string, title: string): string {
  return (
    `<div class="product-item-info" id="product-item-info_${id}" data-container="product-grid">` +
    `<a href="${url}" class="product photo product-item-photo"></a>` +
    `<strong class="product name product-item-name"><a class="product-item-link" href="${url}"> ${title} </a></strong></div>`
  );
}

const PAGE_HTML =
  `<html>"currency_code":"PLN"${cardHtml("16972", "https://influcenter.pl/t-shirt-o-jak-milo", "T-shirt O JAK MIŁO!")}` +
  cardHtml("17959", "https://influcenter.pl/brelok-multiverse", "Brelok MULTIVERSE") +
  blockHtml(
    "99.99",
    "16972",
    '"16966":{"182":"24"},"16967":{"182":"14"},"16968":{"182":"15"}',
    '"16966":"INFT0362XS","16967":"INFT0360XS","16968":"INFT03600S"',
  ) +
  blockHtml(
    "29.99",
    "17959",
    '"18000":{"182":"5"}',
    '"18000":"BRMK001"',
  ) +
  `</html>`;

describe("parseCurrency", () => {
  it("parses the currency code", () => {
    expect(parseCurrency('"currency_code":"PLN"')).toBe("PLN");
  });

  it("defaults to PLN when missing", () => {
    expect(parseCurrency("<html></html>")).toBe("PLN");
  });
});

describe("parseEmbeddedQty", () => {
  it("parses products with exact quantities and skus", () => {
    const products = parseEmbeddedQty(PAGE_HTML, "https://influcenter.pl");
    expect(products).toHaveLength(2);
    const shirt = products[0];
    expect(shirt).toMatchObject({
      id: "16972",
      title: "T-shirt O JAK MIŁO!",
      url: "https://influcenter.pl/t-shirt-o-jak-milo",
      price: 99.99,
      currency: "PLN",
    });
    expect(shirt?.variants).toHaveLength(3);
    expect(shirt?.variants[0]).toEqual({ id: "16966", quantity: 24, sku: "INFT0362XS" });
    expect(shirt?.variants[1]?.quantity).toBe(14);
    expect(products[1]).toMatchObject({ id: "17959", title: "Brelok MULTIVERSE" });
    expect(products[1]?.variants[0]).toEqual({ id: "18000", quantity: 5, sku: "BRMK001" });
  });

  it("returns an empty array for a page without blocks", () => {
    expect(parseEmbeddedQty("<html>no products</html>", "https://x.pl")).toEqual([]);
  });

  it("skips cards without a matching block", () => {
    const html =
      cardHtml("1", "https://x.pl/a", "A") +
      blockHtml("10", "2", '"3":{"182":"1"}', '"3":"SKU3"');
    expect(parseEmbeddedQty(html, "https://x.pl")).toEqual([]);
  });
});

describe("fetchMagentoCookie", () => {
  it("joins every set-cookie header and cancels the body", async () => {
    const logger = createLogger(() => {});
    const headers = new Headers();
    headers.append("set-cookie", "PHPSESSID=abc123; path=/");
    headers.append("set-cookie", "X-Magento-Vary=xyz; path=/");
    const cancel = vi.fn(async () => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ headers, body: { cancel } }),
    );
    const cookie = await fetchMagentoCookie("influcenter.pl", logger);
    expect(cookie).toBe("PHPSESSID=abc123; X-Magento-Vary=xyz");
    expect(cancel).toHaveBeenCalled();
  });

  it("returns null when the shop sets no cookie", async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ headers: new Headers(), body: { cancel: vi.fn(async () => {}) } }),
    );
    expect(await fetchMagentoCookie("influcenter.pl", logger)).toBeNull();
  });
});

describe("buildEmbeddedQtyProvider", () => {
  const HOME = `<html><a href="https://influcenter.pl/gora">Góra</a><a href="https://influcenter.pl/marki">Marki</a></html>`;
  const MARKI = `<html><a href="https://influcenter.pl/marki/ekipa">Ekipa</a></html>`;
  const PAGE1 = PAGE_HTML + `<a href="https://influcenter.pl/gora?p=2">2</a>`;
  const PAGE2 =
    cardHtml("999", "https://influcenter.pl/kolejny", "Kolejny") +
    blockHtml("50", "999", '"998":{"182":"7"}', '"998":"SKU998"');

  it("builds a catalog from the nav, brands and pagination", async () => {
    const logger = createLogger(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: (() => {
          const h = new Headers();
          h.append("set-cookie", "PHPSESSID=sess; path=/");
          return h;
        })(),
        body: { cancel: vi.fn(async () => {}) },
      }),
    );
    const urlToHtml = new Map<string, string>([
      ["https://influcenter.pl/", HOME],
      ["https://influcenter.pl/marki", MARKI],
      ["https://influcenter.pl/gora", PAGE1],
      ["https://influcenter.pl/marki/ekipa", PAGE1],
      ["https://influcenter.pl/gora?p=2", PAGE2],
      ["https://influcenter.pl/marki/ekipa?p=2", PAGE2],
    ]);
    const directFetch = async (input: string | URL | Request) => {
      const url = String(input);
      const html = urlToHtml.get(url);
      if (html === undefined) {
        return { ok: false, status: 404, text: async () => "", json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return { ok: true, status: 200, text: async () => html, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const config = {
      id: "influcenter",
      domain: "influcenter.pl",
      platform: "magento" as const,
      schedule: "0 18 * * *",
      window: "both" as const,
      mode: "vps-get" as const,
      stockSource: "embedded-json" as const,
      ratePerSecond: 100,
      durationSeconds: 600,
      requiresProxy: false,
      endpoint: "https://influcenter.pl/",
      enabled: true,
    };
    const provider = buildEmbeddedQtyProvider(config, logger, directFetch);
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(3);
    const ids = catalog.products.map((product) => product.id);
    expect(ids).toContain("16972");
    expect(ids).toContain("17959");
    expect(ids).toContain("999");
    const shirt = catalog.products.find((product) => product.id === "16972");
    expect(shirt?.variants[0]?.quantity).toBe(24);
    expect(shirt?.variants[0]?.sku).toBe("INFT0362XS");
    expect(shirt?.variants[0]?.available).toBe(true);
  });

  it("rotates the cookie on a persistent 429", async () => {
    const logger = createLogger(() => {});
    const cookieFn = vi.fn().mockResolvedValue({
      headers: (() => {
        const h = new Headers();
        h.append("set-cookie", "PHPSESSID=sess; path=/");
        return h;
      })(),
      body: { cancel: vi.fn(async () => {}) },
    });
    vi.stubGlobal("fetch", cookieFn);
    let goraCalls = 0;
    const directFetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/")) {
        return { ok: true, status: 200, text: async () => HOME, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      if (url.endsWith("/marki")) {
        return { ok: true, status: 200, text: async () => MARKI, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      if (url.includes("/gora")) {
        goraCalls += 1;
        if (goraCalls === 1) {
          return { ok: false, status: 429, text: async () => "", json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
        }
        return { ok: true, status: 200, text: async () => PAGE1, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      if (url.includes("/marki/")) {
        return { ok: true, status: 200, text: async () => PAGE1, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      return { ok: false, status: 404, text: async () => "", json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const config = {
      id: "influcenter",
      domain: "influcenter.pl",
      platform: "magento" as const,
      schedule: "0 18 * * *",
      window: "both" as const,
      mode: "vps-get" as const,
      stockSource: "embedded-json" as const,
      ratePerSecond: 100,
      durationSeconds: 600,
      requiresProxy: false,
      endpoint: "https://influcenter.pl/",
      enabled: true,
    };
    const provider = buildEmbeddedQtyProvider(config, logger, directFetch);
    const catalog = await provider.fetchCatalog();
    expect(cookieFn).toHaveBeenCalledTimes(2);
    expect(catalog.products.length).toBeGreaterThan(0);
  });
});
