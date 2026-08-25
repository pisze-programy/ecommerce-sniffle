import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../config.ts";
import { requireValue } from "../../helpers.ts";
import { parseGraphQLCatalog, parseStorefrontToken, parseVariantId } from "./storefront.ts";

const seembolsConfig = requireValue(PROVIDERS.find((c) => c.id === "seembols"), "config seembols");

describe("parseStorefrontToken", () => {
  it("parses the storefrontAccessTokens map format", () => {
    const html =
      'window.vtlsLiquidData.storefrontAccessTokens={"2":"864b05b0012fb2070b0ecb95130bc774"};';
    expect(parseStorefrontToken(html)).toBe("864b05b0012fb2070b0ecb95130bc774");
  });

  it("returns the first string value in the map", () => {
    const html = 'storefrontAccessTokens={"1":"first","2":"second"};';
    expect(parseStorefrontToken(html)).toBe("first");
  });

  it("returns null when the map is not valid json", () => {
    expect(parseStorefrontToken('storefrontAccessTokens={not-valid};')).toBeNull();
  });

  it("returns null when no token exists", () => {
    expect(parseStorefrontToken("<html>no token</html>")).toBeNull();
  });
});

describe("parseVariantId", () => {
  it("extracts the numeric id from a gid", () => {
    expect(parseVariantId("gid://shopify/ProductVariant/50989371949334")).toBe("50989371949334");
  });

  it("returns the input when the gid has no match", () => {
    expect(parseVariantId("plain-id")).toBe("plain-id");
  });
});

describe("parseGraphQLCatalog", () => {
  it("parses a string price amount and currency", () => {
    const payload = {
      data: {
        products: {
          edges: [
            {
              node: {
                title: "Print",
                handle: "print",
                variants: {
                  edges: [
                    {
                      node: {
                        id: "gid://shopify/ProductVariant/1",
                        quantityAvailable: 5,
                        price: { amount: "12.50", currencyCode: "USD" },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    };
    const result = parseGraphQLCatalog(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Print",
      handle: "print",
      variants: [{ id: "1", quantityAvailable: 5, price: 12.5, currency: "USD" }],
    });
  });

  it("returns an empty array for malformed payloads", () => {
    expect(parseGraphQLCatalog("nope")).toEqual([]);
    expect(parseGraphQLCatalog(null)).toEqual([]);
    expect(parseGraphQLCatalog({})).toEqual([]);
    expect(parseGraphQLCatalog({ data: null })).toEqual([]);
    expect(parseGraphQLCatalog({ data: { products: { edges: [null] } } })).toEqual([]);
  });
});

describe("seembols config", () => {
  it("is disabled for a later decision", () => {
    expect(seembolsConfig.enabled).toBe(false);
    expect(seembolsConfig.requiresProxy).toBe(false);
  });
});
