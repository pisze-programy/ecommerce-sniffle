import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../logger.ts";
import type { LogRecord, Logger } from "../../logger.ts";
import {
  parseChangeResponse,
  applyOutcome,
  probeVariantStock,
} from "./cart-probe.ts";
import type { Variant } from "../../types.ts";

interface Capture {
  readonly records: LogRecord[];
  readonly logger: Logger;
}

function capturingLogger(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: string, setCookie: string | null = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => setCookie },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

const CLAMPED =
  '{"status":422,"message":"Tylko 19 poz. dodano do koszyka z powodu dostępności.","description":"Tylko 19 poz. dodano do koszyka z powodu dostępności."}';
const SOLD_OUT = `{"status":422,"message":"Produkt 'koszulka dziecięca' został już wyprzedany.","description":"Produkt 'koszulka dziecięca' został już wyprzedany."}`;
const SUCCESS =
  '{"items":[{"id":54030862188885,"quantity":12,"variant_id":54030862188885,"title":"T-shirt Baby - S"}]}';

describe("parseChangeResponse", () => {
  it("reads the clamped quantity from a polish message", () => {
    const capture = capturingLogger();
    expect(parseChangeResponse(CLAMPED, capture.logger)).toEqual({ quantity: 19, available: true });
  });

  it("reads a larger clamped quantity", () => {
    const capture = capturingLogger();
    expect(
      parseChangeResponse('{"message":"Tylko 70 poz. dodano do koszyka z powodu dostępności."}', capture.logger),
    ).toEqual({ quantity: 70, available: true });
  });

  it("reads a clamped quantity in the pozycja format", () => {
    const capture = capturingLogger();
    expect(
      parseChangeResponse('{"message":"Tylko 1 pozycja"}', capture.logger),
    ).toEqual({ quantity: 1, available: true });
  });

  it("marks a sold out variant with quantity 0", () => {
    const capture = capturingLogger();
    expect(parseChangeResponse(SOLD_OUT, capture.logger)).toEqual({ quantity: 0, available: false });
  });

  it("reads the quantity from a success cart payload", () => {
    const capture = capturingLogger();
    expect(parseChangeResponse(SUCCESS, capture.logger)).toEqual({ quantity: 12, available: true });
  });

  it("returns unknown for an unrecognized payload", () => {
    const capture = capturingLogger();
    expect(parseChangeResponse("not json at all", capture.logger)).toEqual({
      quantity: null,
      available: null,
    });
    expect(parseChangeResponse('{"status":422,"message":"coś poszło nie tak"}', capture.logger)).toEqual({
      quantity: null,
      available: null,
    });
  });

  it("logs a warning when the payload is not valid json", () => {
    const capture = capturingLogger();
    parseChangeResponse("not json at all", capture.logger);
    expect(capture.records).toHaveLength(1);
    expect(capture.records[0]?.level).toBe("warn");
    expect(capture.records[0]?.message).toBe("cartprobe.change response parse failed");
  });
});

describe("probeVariantStock", () => {
  it("logs a warning when the cart add fails", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, '{"message":"error"}')),
    );
    const outcome = await probeVariantStock("wakenbake.pl", "54030862188885", capture.logger);
    expect(outcome).toEqual({ quantity: null, available: null });
    const addWarns = capture.records.filter((record) => record.message === "cartprobe.add failed");
    expect(addWarns.length).toBeGreaterThan(0);
  });

  it("logs a warning when the cart change fails", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, '{"id":1}', "cart=abc"))
        .mockRejectedValueOnce(new Error("network down")),
    );
    const outcome = await probeVariantStock("wakenbake.pl", "54030862188885", capture.logger);
    expect(outcome).toEqual({ quantity: null, available: null });
    const changeWarns = capture.records.filter((record) => record.message === "cartprobe.change failed");
    expect(changeWarns.length).toBeGreaterThan(0);
  });

  it("blocks and logs when the cart add hits a cloudflare challenge", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(429, "<title>Verifying your connection...</title>")),
    );
    const outcome = await probeVariantStock("booso.pl", "1", capture.logger);
    expect(outcome).toEqual({ quantity: null, available: null });
    expect(
      capture.records.some((record) => record.message === "cartprobe.challenge blocked"),
    ).toBe(true);
  });

  it("blocks and logs when the cart change hits a cloudflare challenge", async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, '{"id":1}', "cart=abc"))
        .mockResolvedValueOnce(jsonResponse(429, "<title>Verifying your connection...</title>")),
    );
    const outcome = await probeVariantStock("booso.pl", "1", capture.logger);
    expect(outcome).toEqual({ quantity: null, available: null });
    expect(
      capture.records.some((record) => record.message === "cartprobe.challenge blocked"),
    ).toBe(true);
  });
});

describe("applyOutcome", () => {
  it("keeps the original variant when the outcome is unknown", () => {
    const variant: Variant = {
      id: "1",
      title: "S",
      sku: null,
      price: { amount: 100, currency: "PLN" },
      regularPrice: null,
      available: true,
      quantity: null,
    };
    expect(applyOutcome(variant, { quantity: null, available: null })).toEqual(variant);
  });

  it("overwrites quantity and availability from the outcome", () => {
    const variant: Variant = {
      id: "1",
      title: "S",
      sku: null,
      price: { amount: 100, currency: "PLN" },
      regularPrice: null,
      available: false,
      quantity: null,
    };
    const updated = applyOutcome(variant, { quantity: 12, available: true });
    expect(updated.quantity).toBe(12);
    expect(updated.available).toBe(true);
  });
});
