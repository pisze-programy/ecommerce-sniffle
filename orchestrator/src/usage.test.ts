import { describe, expect, it } from "vitest";
import { createUsageTracking } from "./usage.ts";

function headers(record: Record<string, string>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(record)) {
    result.set(key, value);
  }
  return result;
}

describe("createUsageTracking", () => {
  it("counts requests and response bytes from content-length", async () => {
    let calls = 0;
    const tracking = createUsageTracking(async () => {
      calls += 1;
      const record = calls === 1 ? { "content-length": "1234" } : {};
      return {
        ok: true,
        status: 200,
        headers: headers(record),
        json: async () => ({}),
        text: async () => "",
      } as Response;
    });
    await tracking.fetchImpl("https://shop.pl/produkt", {
      method: "POST",
      body: "abc",
    });
    await tracking.fetchImpl("https://shop.pl/list");
    expect(tracking.stats.requests).toBe(2);
    expect(tracking.stats.responseBytes).toBe(1234);
    expect(tracking.stats.requestBytes).toBeGreaterThan(3);
  });

  it("counts the url and body bytes of a request", async () => {
    const tracking = createUsageTracking(async () => {
      return {
        ok: true,
        status: 200,
        headers: headers({}),
        json: async () => ({}),
        text: async () => "",
      } as Response;
    });
    await tracking.fetchImpl(new URL("https://shop.pl/a/b"), {
      method: "POST",
      body: new URLSearchParams({ id: "42", qty: "9" }),
    });
    expect(tracking.stats.requests).toBe(1);
    expect(tracking.stats.requestBytes).toBeGreaterThan(10);
  });

  it("does not add response bytes when content-length is missing", async () => {
    const tracking = createUsageTracking(async () => {
      return {
        ok: true,
        status: 200,
        headers: headers({}),
        json: async () => ({}),
        text: async () => "",
      } as Response;
    });
    await tracking.fetchImpl("https://shop.pl/produkt");
    expect(tracking.stats.responseBytes).toBe(0);
    expect(tracking.stats.requests).toBe(1);
  });

  it("aborts a fetch that never resolves within the timeout", async () => {
    const tracking = createUsageTracking(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
      60,
    );
    await expect(tracking.fetchImpl("https://shop.pl/produkt")).rejects.toThrow("aborted");
  });
});
