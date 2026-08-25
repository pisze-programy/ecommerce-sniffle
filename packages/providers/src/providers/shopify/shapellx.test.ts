import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import {
  parseGraphQLCatalog,
  parseStorefrontToken,
  parseVariantId,
  shapellxModule,
} from "./shapellx.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function graphQLBody(): string {
  return JSON.stringify({
    data: {
      products: {
        edges: [
          {
            node: {
              title: "Bare Essentials Bra",
              handle: "underwire-push-up-bra",
              variants: {
                edges: [
                  {
                    node: {
                      id: "gid://shopify/ProductVariant/42919576829994",
                      quantityAvailable: 45,
                      price: { amount: 129.0 },
                    },
                  },
                  {
                    node: {
                      id: "gid://shopify/ProductVariant/42919576899999",
                      quantityAvailable: 0,
                      price: { amount: 129.0 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
}

describe("parseStorefrontToken", () => {
  it("extracts the token from the page", () => {
    const html = '{"storefrontAccessToken": "abc123", "other": 1}';
    expect(parseStorefrontToken(html)).toBe("abc123");
  });

  it("returns null when the token is missing", () => {
    expect(parseStorefrontToken("<html></html>")).toBeNull();
  });
});

describe("parseVariantId", () => {
  it("strips the gid prefix", () => {
    expect(parseVariantId("gid://shopify/ProductVariant/42919576829994")).toBe("42919576829994");
  });

  it("keeps a non-gid value", () => {
    expect(parseVariantId("123")).toBe("123");
  });
});

describe("parseGraphQLCatalog", () => {
  it("parses the products and variants", () => {
    const products = parseGraphQLCatalog(JSON.parse(graphQLBody()));
    expect(products).toHaveLength(1);
    const product = products[0];
    expect(product?.title).toBe("Bare Essentials Bra");
    expect(product?.handle).toBe("underwire-push-up-bra");
    expect(product?.variants).toHaveLength(2);
    expect(product?.variants[0]?.id).toBe("42919576829994");
    expect(product?.variants[0]?.quantityAvailable).toBe(45);
    expect(product?.variants[0]?.price).toBe(129.0);
    expect(product?.variants[1]?.quantityAvailable).toBe(0);
  });

  it("returns an empty array for invalid payloads", () => {
    expect(parseGraphQLCatalog(null)).toEqual([]);
    expect(parseGraphQLCatalog({})).toEqual([]);
    expect(parseGraphQLCatalog("nope")).toEqual([]);
  });
});

describe("shapellxModule", () => {
  it("builds a catalog with exact quantity from the storefront api", async () => {
    const logger = createLogger(() => {});
    const calls: unknown[] = [];
    const directFetch = async (
      input: string | URL | Request,
      _init?: RequestInit,
      _options?: { maxBytes?: number },
    ) => {
      const url = String(input);
      calls.push(url);
      if (String(url).includes("/api/")) {
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(graphQLBody()),
          text: async () => graphQLBody(),
          arrayBuffer: async () => Buffer.from(graphQLBody()).buffer as ArrayBuffer,
        };
      }
      const html = '{"storefrontAccessToken": "abc123"}';
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(html),
        text: async () => html,
        arrayBuffer: async () => Buffer.from(html).buffer as ArrayBuffer,
      };
    };
    const provider = shapellxModule.build({ logger, directFetch });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(45);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(0);
    expect(catalog.products[0]?.variants[0]?.available).toBe(true);
    expect(catalog.products[0]?.url).toContain("underwire-push-up-bra");
  });
});
