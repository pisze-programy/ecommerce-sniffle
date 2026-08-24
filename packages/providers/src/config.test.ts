import { describe, expect, it } from "vitest";
import { PROVIDERS } from "./config.ts";

const EXPECTED_IDS = [
  "arustamian",
  "booso",
  "dobrerzeczy",
  "e-daag",
  "emereedivine",
  "foodsbyann",
  "forcer",
  "gymglamour",
  "hdrey",
  "laboratoriumpanidomu",
  "misbhv",
  "montiel",
  "mushi",
  "noo-ma",
  "premieresociety",
  "rever",
  "royalwatch",
  "sklepskolim",
  "wakenbake",
  "wkdzik",
].sort();

describe("PROVIDERS config", () => {
  it("defines exactly 20 providers", () => {
    expect(PROVIDERS.length).toBe(20);
  });

  it("uses unique ids", () => {
    const ids = PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the expected provider ids", () => {
    const ids = PROVIDERS.map((provider) => provider.id).sort();
    expect(ids).toEqual(EXPECTED_IDS);
  });

  it("has valid non-empty fields on every provider", () => {
    for (const provider of PROVIDERS) {
      expect(provider.domain.length).toBeGreaterThan(0);
      expect(provider.schedule.length).toBeGreaterThan(0);
      expect(provider.endpoint.length).toBeGreaterThan(0);
      expect(provider.ratePerSecond).toBeGreaterThan(0);
    }
  });

  it("uses a known platform", () => {
    const allowed = new Set(["shopify", "shoper", "woocommerce", "custom", "prestashop"]);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.platform)).toBe(true);
    }
  });

  it("uses a known stock source", () => {
    const allowed = new Set(["embedded-json", "cart-probe", "basket-reveal", "html", "boolean"]);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.stockSource)).toBe(true);
    }
  });

  it("uses a known execution mode", () => {
    const allowed = new Set(["cf-get", "vps-get", "vps-mutation"]);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.mode)).toBe(true);
    }
  });

  it("marks mutation providers as requiring a proxy", () => {
    for (const provider of PROVIDERS) {
      if (provider.mode === "vps-mutation") {
        expect(provider.requiresProxy).toBe(true);
      }
    }
  });

  it("has 9 mutation providers, 4 get providers, 7 vps-get providers", () => {
    const mutation = PROVIDERS.filter((provider) => provider.mode === "vps-mutation");
    const get = PROVIDERS.filter((provider) => provider.mode === "cf-get");
    const vpsGet = PROVIDERS.filter((provider) => provider.mode === "vps-get");
    expect(mutation.length).toBe(9);
    expect(get.length).toBe(4);
    expect(vpsGet.length).toBe(7);
  });
});
