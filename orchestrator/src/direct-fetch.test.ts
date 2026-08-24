import { describe, expect, it } from "vitest";
import { toUrl, toHeaderRecord } from "./direct-fetch.ts";

describe("toUrl", () => {
  it("accepts a string url", () => {
    expect(toUrl("https://wkdzik.pl/products.json").toString()).toBe("https://wkdzik.pl/products.json");
  });

  it("accepts a URL instance", () => {
    const url = new URL("https://wkdzik.pl/list");
    expect(toUrl(url)).toBe(url);
  });

  it("accepts a Request and uses its url", () => {
    const request = new Request("https://wkdzik.pl/products.json");
    expect(toUrl(request).toString()).toBe("https://wkdzik.pl/products.json");
  });
});

describe("toHeaderRecord", () => {
  it("converts a Headers object", () => {
    const headers = new Headers({ "User-Agent": "test", Accept: "application/json" });
    expect(toHeaderRecord(headers)).toEqual({ "user-agent": "test", accept: "application/json" });
  });

  it("converts a plain record", () => {
    expect(toHeaderRecord({ Accept: "application/json" })).toEqual({ Accept: "application/json" });
  });

  it("returns an empty record for undefined", () => {
    expect(toHeaderRecord(undefined)).toEqual({});
  });
});
