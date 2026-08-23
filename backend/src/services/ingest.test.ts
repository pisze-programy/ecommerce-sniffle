import { describe, expect, it } from "vitest";
import { parseSnapshotBody } from "./ingest.ts";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shop: "sklepskolim.pl",
    snapshotAt: "2026-08-24T06:00:00.000Z",
    window: "morning",
    variants: [
      { productId: "p1", variantId: "v1", quantity: 13, price: 45, regularPrice: null, available: true },
    ],
    ...overrides,
  };
}

describe("parseSnapshotBody", () => {
  it("parses a valid snapshot", () => {
    const snapshot = parseSnapshotBody(validBody());
    expect(snapshot?.shop).toBe("sklepskolim.pl");
    expect(snapshot?.variants).toHaveLength(1);
    expect(snapshot?.variants[0]?.quantity).toBe(13);
  });

  it("accepts null quantity and price", () => {
    const snapshot = parseSnapshotBody(
      validBody({ variants: [{ productId: "p1", variantId: "v1", quantity: null, price: null, regularPrice: null, available: false }] }),
    );
    expect(snapshot?.variants[0]?.quantity).toBeNull();
    expect(snapshot?.variants[0]?.available).toBe(false);
  });

  it("rejects an invalid window", () => {
    expect(parseSnapshotBody(validBody({ window: "midday" }))).toBeNull();
  });

  it("rejects a malformed variant", () => {
    expect(
      parseSnapshotBody(validBody({ variants: [{ productId: "p1", variantId: "v1", quantity: "many" }] })),
    ).toBeNull();
  });

  it("rejects a missing variants array", () => {
    expect(parseSnapshotBody(validBody({ variants: "nope" }))).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseSnapshotBody(null)).toBeNull();
    expect(parseSnapshotBody("nope")).toBeNull();
  });
});
