import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import { nagoModule } from "./nago.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nagoModule", () => {
  it("reveals exact stock from the restock rocket map", async () => {
    const logger = createLogger(() => {});
    const rr =
      "window._RestockRocketConfig.variantsInventoryQuantity = {100 : parseInt(\"8\"),200 : parseInt(\"13\")};";
    const catalogJson = JSON.stringify({
      products: [
        {
          id: 1,
          handle: "longsleeve",
          title: "Longsleeve",
          variants: [
            { id: 100, title: "S", price: "100", compare_at_price: null, available: true, inventory_quantity: null },
            { id: 200, title: "M", price: "100", compare_at_price: null, available: true, inventory_quantity: null },
          ],
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        const body = u.includes("products.json") ? catalogJson : `<html>${rr}</html>`;
        const text = () => Promise.resolve(body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text,
          json: async () => JSON.parse(await text()),
        };
      }),
    );
    const provider = nagoModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0]?.variants[0]?.quantity).toBe(8);
    expect(catalog.products[0]?.variants[1]?.quantity).toBe(13);
    expect(catalog.products[0]?.variants[1]?.available).toBe(true);
  });

  it("keeps a product unchanged when the map is missing", async () => {
    const logger = createLogger(() => {});
    const catalogJson = JSON.stringify({
      products: [
        {
          id: 1,
          handle: "x",
          title: "X",
          variants: [
            { id: 100, title: "S", price: "10", compare_at_price: null, available: true, inventory_quantity: null },
          ],
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        const body = u.includes("products.json") ? catalogJson : "<html>no map</html>";
        const text = () => Promise.resolve(body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text,
          json: async () => JSON.parse(await text()),
        };
      }),
    );
    const provider = nagoModule.build({ logger });
    const catalog = await provider.fetchCatalog();
    expect(catalog.products[0]?.variants[0]?.quantity).toBeNull();
  });
});
