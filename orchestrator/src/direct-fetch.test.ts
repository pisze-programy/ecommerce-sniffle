import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createDirectFetch, toHeaderRecord, toUrl } from "./direct-fetch.ts";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe("createDirectFetch", () => {
  it("rejects a request that never responds within the timeout", async () => {
    const server = createServer((_req, _res) => {
      // never answer; simulate a hung connection
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("server has no port");
    }
    const directFetch = createDirectFetch(60);
    const started = Date.now();
    await expect(directFetch(`http://127.0.0.1:${address.port}/`)).rejects.toThrow("timeout");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});


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
