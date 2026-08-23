import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import type { Logger, LogRecord } from "../../logger.ts";
import {
  findProduct,
  parseNuxtPayload,
  parseProduct,
  parseSitemapUrls,
  dobrerzeczyModule,
} from "./dobrerzeczy.ts";

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

function silentLogger(): Logger {
  return createLogger(() => {
    // discard records in tests
  });
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

function payload(): unknown[] {
  return [
    ["ShallowReactive", 1],
    { pinia: 3 },
    ["ShallowReactive", 4],
    { shop: 5 },
    { product: 6 },
    { _id: 6, name: 7, price: 8, sizes: 9, slug: 10, isPreorder: 11 },
    "prod-1",
    "Koszulka classic",
    50,
    [12, 17],
    "koszulka-classic",
    false,
    { size: 13, stock: 15, _id: 16 },
    { _id: 14, name: 18, __v: 19, tag: 20 },
    "size-meta-s",
    3,
    "size-entry-s",
    { size: 21, stock: 23, _id: 24 },
    "S",
    0,
    "",
    { _id: 22, name: 25, __v: 19, tag: 20 },
    "size-meta-m",
    0,
    "size-entry-m",
    "M",
  ];
}

function htmlFor(data: unknown): string {
  return `<script type="application/json" data-nuxt-data="nuxt-app" data-ssr="true" id="__NUXT_DATA__">${JSON.stringify(data)}</script>`;
}

describe("parseSitemapUrls", () => {
  it("extracts product urls only", () => {
    const xml =
      "<urlset><url><loc>https://dobrerzeczy.pl/</loc></url>" +
      "<url><loc>https://dobrerzeczy.pl/faq</loc></url>" +
      "<url><loc>https://dobrerzeczy.pl/produkt/koszulka</loc></url></urlset>";
    expect(parseSitemapUrls(xml)).toEqual(["https://dobrerzeczy.pl/produkt/koszulka"]);
  });

  it("returns an empty array for no product urls", () => {
    expect(parseSitemapUrls("<urlset></urlset>")).toEqual([]);
  });
});

describe("parseNuxtPayload", () => {
  it("parses a valid nuxt payload", () => {
    const data = parseNuxtPayload(htmlFor([["ShallowReactive", 1], { pinia: 3 }]));
    expect(data).not.toBeNull();
    expect(data?.length).toBe(2);
  });

  it("returns null when the payload script is missing", () => {
    expect(parseNuxtPayload("<html></html>")).toBeNull();
  });

  it("returns null for invalid json", () => {
    expect(parseNuxtPayload('<script id="__NUXT_DATA__">not-json</script>')).toBeNull();
  });

  it("logs a warning when the payload is invalid json", () => {
    const capture = capturingLogger();
    expect(parseNuxtPayload('<script id="__NUXT_DATA__">not-json</script>', capture.logger)).toBeNull();
    expect(capture.records[0]?.level).toBe("warn");
    expect(capture.records[0]?.message).toBe("dobrerzeczy.nuxt payload parse failed");
  });

  it("returns null for a non-array payload", () => {
    expect(parseNuxtPayload(htmlFor({ a: 1 }))).toBeNull();
  });
});

describe("findProduct", () => {
  it("finds the product object in the payload", () => {
    const product = findProduct(payload());
    expect(product).not.toBeNull();
    expect(product?.["_id"]).toBe(6);
    expect(product?.["slug"]).toBe(10);
  });
});

describe("parseProduct", () => {
  it("parses a product with exact stock per size", () => {
    const product = parseProduct(htmlFor(payload()), "https://dobrerzeczy.pl/produkt/koszulka", silentLogger());
    expect(product?.id).toBe("prod-1");
    expect(product?.title).toBe("Koszulka classic");
    expect(product?.variants).toHaveLength(2);
    const sizeS = product?.variants[0];
    expect(sizeS?.title).toBe("S");
    expect(sizeS?.quantity).toBe(3);
    expect(sizeS?.available).toBe(true);
    expect(sizeS?.price.amount).toBe(50);
    const sizeM = product?.variants[1];
    expect(sizeM?.title).toBe("M");
    expect(sizeM?.quantity).toBe(0);
    expect(sizeM?.available).toBe(false);
  });

  it("masks quantity for a preorder product", () => {
    const data = payload();
    data[11] = true;
    const product = parseProduct(htmlFor(data), "https://dobrerzeczy.pl/produkt/koszulka", silentLogger());
    expect(product?.variants[0]?.quantity).toBeNull();
    expect(product?.variants[0]?.available).toBe(true);
  });

  it("returns null when the payload is missing", () => {
    expect(parseProduct("<html></html>", "https://dobrerzeczy.pl/produkt/x", silentLogger())).toBeNull();
  });

  it("returns null when no product object exists", () => {
    expect(parseProduct(htmlFor([["ShallowReactive", 1]]), "https://dobrerzeczy.pl/produkt/x", silentLogger())).toBeNull();
  });
});

describe("dobrerzeczyModule", () => {
  const SITEMAP =
    "<urlset><url><loc>https://dobrerzeczy.pl/produkt/kubek/</loc></url></urlset>";
  const PRODUCT_HTML =
    '<html><head><title>Kubek</title></head><body><script type="application/json" id="__NUXT_DATA__">' +
    JSON.stringify(payload()) +
    "</script></body></html>";

  it("retries a rate limited sitemap and succeeds", async () => {
    const capture = capturingLogger();
    let sitemapAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (url === "https://dobrerzeczy.pl/sitemap.xml") {
          sitemapAttempts += 1;
          if (sitemapAttempts < 3) {
            return response(false, 429, "rate limited");
          }
          return response(true, 200, SITEMAP);
        }
        return response(true, 200, PRODUCT_HTML);
      }),
    );
    const provider = dobrerzeczyModule.build({ logger: capture.logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(sitemapAttempts).toBe(3);
  });

  it("logs an error when the sitemap stays rate limited", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(false, 429, "rate limited")),
    );
    const provider = dobrerzeczyModule.build({ logger: capture.logger });
    await expect(provider.fetchCatalog()).rejects.toThrow("failed with status 429");
    expect(
      capture.records.some((record) => record.message === "Provider.fetchCatalog failed"),
    ).toBe(true);
  });
});
