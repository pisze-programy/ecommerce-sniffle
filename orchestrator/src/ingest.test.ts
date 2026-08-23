import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@ecommerce-sniffle/providers";
import type { Catalog, Logger, LogRecord } from "@ecommerce-sniffle/providers";
import { readIngestConfig, catalogToIngestSnapshot, sendSnapshot } from "./ingest.ts";

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

function jsonResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

const CONFIG = { backendUrl: "https://backend.example.com", secret: "s3cret" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readIngestConfig", () => {
  it("returns config when both env vars are set", () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    expect(readIngestConfig()).toEqual(CONFIG);
  });

  it("returns null when backend url is missing", () => {
    vi.stubEnv("BACKEND_URL", "");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    expect(readIngestConfig()).toBeNull();
  });

  it("returns null when the secret is missing", () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "");
    expect(readIngestConfig()).toBeNull();
  });
});

describe("catalogToIngestSnapshot", () => {
  it("builds a snapshot from a catalog", () => {
    const catalog: Catalog = {
      domain: "sklepskolim.pl",
      fetchedAt: "2026-08-24T06:00:00.000Z",
      products: [
        {
          id: "39",
          title: "Kubek",
          url: "https://sklepskolim.pl/pl/p/kubek/39",
          variants: [
            {
              id: "47",
              title: "default",
              sku: null,
              price: { amount: 45, currency: "PLN" },
              regularPrice: null,
              available: true,
              quantity: 13,
            },
          ],
        },
      ],
    };
    const snapshot = catalogToIngestSnapshot(catalog);
    expect(snapshot.shop).toBe("sklepskolim.pl");
    expect(snapshot.variants).toHaveLength(1);
    expect(snapshot.variants[0]?.quantity).toBe(13);
  });
});

describe("sendSnapshot", () => {
  it("sends the snapshot and returns true on success", async () => {
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, '{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = catalogToIngestSnapshot({
      domain: "sklepskolim.pl",
      fetchedAt: "2026-08-24T06:00:00.000Z",
      products: [],
    });
    const sent = await sendSnapshot(snapshot, CONFIG, capture.logger);
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer s3cret");
    expect(capture.records.some((record) => record.message === "ingest.sent")).toBe(true);
  });

  it("logs and returns false when the backend rejects", async () => {
    const capture = capturingLogger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, "unauthorized")));
    const snapshot = catalogToIngestSnapshot({
      domain: "sklepskolim.pl",
      fetchedAt: "2026-08-24T06:00:00.000Z",
      products: [],
    });
    const sent = await sendSnapshot(snapshot, CONFIG, capture.logger);
    expect(sent).toBe(false);
    expect(capture.records.some((record) => record.message === "ingest.rejected")).toBe(true);
  });

  it("logs and returns false on a network error", async () => {
    const capture = capturingLogger();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const snapshot = catalogToIngestSnapshot({
      domain: "sklepskolim.pl",
      fetchedAt: "2026-08-24T06:00:00.000Z",
      products: [],
    });
    const sent = await sendSnapshot(snapshot, CONFIG, capture.logger);
    expect(sent).toBe(false);
    expect(capture.records.some((record) => record.message === "ingest.failed")).toBe(true);
  });
});
