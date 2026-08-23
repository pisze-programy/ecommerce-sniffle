import { describe, expect, it } from "vitest";
import { assertNonEmptyString, assertPositiveInteger, isNullish, requireValue, truncateMessage } from "./helpers.ts";

describe("isNullish", () => {
  it("returns true for null", () => {
    expect(isNullish(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isNullish(undefined)).toBe(true);
  });

  it("returns false for 0", () => {
    expect(isNullish(0)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isNullish("")).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isNullish({})).toBe(false);
  });

  it("returns false for a boolean false", () => {
    expect(isNullish(false)).toBe(false);
  });
});

describe("requireValue", () => {
  it("returns the value when present", () => {
    expect(requireValue("abc", "field")).toBe("abc");
  });

  it("accepts 0 as a present value", () => {
    expect(requireValue(0, "field")).toBe(0);
  });

  it("accepts false as a present value", () => {
    expect(requireValue(false, "field")).toBe(false);
  });

  it("throws when the value is null", () => {
    expect(() => requireValue(null, "field")).toThrow("Missing required value: field");
  });

  it("throws when the value is undefined", () => {
    expect(() => requireValue(undefined, "field")).toThrow("Missing required value: field");
  });
});

describe("assertPositiveInteger", () => {
  it("returns a positive integer unchanged", () => {
    expect(assertPositiveInteger(5, "field")).toBe(5);
  });

  it("rejects zero", () => {
    expect(() => assertPositiveInteger(0, "field")).toThrow("Invalid positive integer for field");
  });

  it("rejects a negative number", () => {
    expect(() => assertPositiveInteger(-2, "field")).toThrow();
  });

  it("rejects a float", () => {
    expect(() => assertPositiveInteger(1.5, "field")).toThrow();
  });

  it("rejects a non-number", () => {
    expect(() => assertPositiveInteger(Number.NaN, "field")).toThrow();
  });
});

describe("assertNonEmptyString", () => {
  it("returns a non-empty string unchanged", () => {
    expect(assertNonEmptyString("value", "field")).toBe("value");
  });

  it("rejects an empty string", () => {
    expect(() => assertNonEmptyString("", "field")).toThrow("Invalid empty string for field");
  });
});

describe("truncateMessage", () => {
  it("returns a short message unchanged", () => {
    expect(truncateMessage("short")).toBe("short");
  });

  it("truncates a long message", () => {
    const long = "x".repeat(1000);
    const result = truncateMessage(long);
    expect(result.length).toBeLessThan(long.length);
    expect(result.endsWith("...")).toBe(true);
    expect(result).toBe(`${"x".repeat(300)}...`);
  });
});
