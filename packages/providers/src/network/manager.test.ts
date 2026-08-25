import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../logger.ts";
import type { LogRecord, Logger } from "../logger.ts";
import {
  measureFetch,
  requestBodyBytes,
  responseBodyBytes,
} from "./manager.ts";

function captureLogger(): { records: LogRecord[]; logger: Logger } {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

describe("requestBodyBytes", () => {
  it("counts string bodies", () => {
    expect(requestBodyBytes("id=1&quantity=2")).toBe(15);
  });

  it("counts URLSearchParams bodies", () => {
    const body = new URLSearchParams();
    body.set("id", "1");
    body.set("quantity", "2");
    expect(requestBodyBytes(body)).toBe(15);
  });

  it("counts ArrayBuffer bodies", () => {
    const buffer = new ArrayBuffer(10);
    expect(requestBodyBytes(buffer)).toBe(10);
  });

  it("counts typed array bodies", () => {
    expect(requestBodyBytes(new Uint8Array(7))).toBe(7);
  });

  it("returns zero for no body", () => {
    expect(requestBodyBytes(undefined)).toBe(0);
    expect(requestBodyBytes(null)).toBe(0);
  });
});

describe("responseBodyBytes", () => {
  it("uses the responseBytes field when present", () => {
    const result = {
      ok: true,
      status: 200,
      responseBytes: 512,
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    };
    expect(responseBodyBytes(result)).toBe(512);
  });

  it("uses the content-length header", () => {
    const result = {
      ok: true,
      status: 200,
      headers: { get: () => "2048" },
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    };
    expect(responseBodyBytes(result)).toBe(2048);
  });

  it("returns zero when no size is known", () => {
    const result = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    };
    expect(responseBodyBytes(result)).toBe(0);
  });
});

describe("measureFetch", () => {
  it("logs one info line per call with the transfer and time", async () => {
    const capture = captureLogger();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "128" },
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    });
    const measured = measureFetch(fetchFn, capture.logger, "godsavequeens", "proxy");
    await measured("https://x.pl/cart/add.js", { method: "POST", body: "id=1" });
    expect(capture.records).toHaveLength(1);
    const record = capture.records[0] as LogRecord;
    expect(record.level).toBe("info");
    expect(record.message).toBe("proxy.request");
    const context = record.context;
    expect(context["providerId"]).toBe("godsavequeens");
    expect(context["url"]).toBe("https://x.pl/cart/add.js");
    expect(context["method"]).toBe("POST");
    expect(context["status"]).toBe(200);
    expect(context["requestBytes"]).toBe(4);
    expect(context["responseBytes"]).toBe(128);
    expect(context["via"]).toBe("proxy");
    expect(typeof context["elapsedMs"]).toBe("number");
  });

  it("logs the direct via and the error path on failure", async () => {
    const capture = captureLogger();
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));
    const measured = measureFetch(fetchFn, capture.logger, "forcer", "direct");
    await expect(measured("https://x.pl/")).rejects.toThrow("network down");
    expect(capture.records).toHaveLength(1);
    const record = capture.records[0] as LogRecord;
    const context = record.context;
    expect(context["status"]).toBeNull();
    expect(context["via"]).toBe("direct");
    expect(context["responseBytes"]).toBe(0);
    expect(context["error"]).toBe("network down");
  });

  it("passes the response through unchanged", async () => {
    const capture = captureLogger();
    const expected = {
      ok: true,
      status: 200,
      headers: { get: () => "1" },
      text: async () => "hello",
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => null,
    };
    const fetchFn = vi.fn().mockResolvedValue(expected);
    const measured = measureFetch(fetchFn, capture.logger, "lexon", "direct");
    const result = await measured("https://x.pl/");
    expect(result).toBe(expected);
    expect(await result.text()).toBe("hello");
  });
});
