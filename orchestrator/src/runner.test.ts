import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MODULES, buildStockRevealer, createLogger } from "@ecommerce-sniffle/providers";
import type { Logger, LogRecord, ProviderConfig, ProviderModule } from "@ecommerce-sniffle/providers";
import { isStockRevealer, runVpsPass } from "./runner.ts";

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

function silentLogger(): Logger {
  return createLogger(() => {
    // discard records in tests
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("network disabled in runner tests");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function findModule(id: string) {
  const module = ALL_MODULES.find((entry) => entry.config.id === id);
  if (module === undefined) {
    throw new Error(`missing module ${id}`);
  }
  return module;
}

function fakeMutationModule(): ProviderModule {
  const config: ProviderConfig = {
    id: "fake-mutation",
    domain: "fake.pl",
    platform: "custom",
    schedule: "30 4 * * *",
    mode: "vps-mutation",
    stockSource: "html",
    ratePerSecond: 1,
    requiresProxy: true,
    endpoint: "https://fake.pl",
    enabled: true,
  };
  const catalog = { domain: "fake.pl", fetchedAt: "2026-08-24T06:00:00.000Z", products: [] };
  return {
    config,
    build({ logger }) {
      return buildStockRevealer(config, logger, async () => catalog, async () => catalog);
    },
  };
}

describe("isStockRevealer", () => {
  it("returns true for a cart-probe provider", () => {
    const provider = findModule("booso").build({ logger: silentLogger() });
    expect(isStockRevealer(provider)).toBe(true);
  });

  it("returns false for an embedded-json provider", () => {
    const provider = findModule("forcer").build({ logger: silentLogger() });
    expect(isStockRevealer(provider)).toBe(false);
  });
});

describe("runVpsPass", () => {
  it("processes exactly the mutation providers", async () => {
    const result = await runVpsPass(silentLogger());
    expect(result.processed).toBe(9);
  });

  it("collects all not-implemented providers as failures", async () => {
    const result = await runVpsPass(silentLogger());
    expect(result.failed).toHaveLength(9);
  });

  it("reports the expected mutation provider ids", async () => {
    const result = await runVpsPass(silentLogger());
    expect([...result.failed].sort()).toEqual([
      "arustamian",
      "booso",
      "e-daag",
      "emereedivine",
      "gymglamour",
      "hdrey",
      "sklepskolim",
      "wakenbake",
      "wkdzik",
    ]);
  });

  it("stops the pass when memory is too low", async () => {
    const result = await runVpsPass(silentLogger(), { checkMemoryFn: () => false });
    expect(result.processed).toBe(0);
    expect(result.failed).toHaveLength(0);
  });

  it("logs a warning for every failed provider", async () => {
    const capture = capturingLogger();
    const result = await runVpsPass(capture.logger);
    expect(result.failed).toHaveLength(9);
    const warns = capture.records.filter((record) => record.message === "reveal provider failed");
    expect(warns).toHaveLength(9);
  });

  it("sends a snapshot for a successful reveal", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":true}' });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(capture.logger, { modules: [fakeMutationModule()] });
    expect(result.processed).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(result.ingested).toBe(1);
    expect(capture.records.some((record) => record.message === "ingest.sent")).toBe(true);
  });

  it("does not send when the ingest env is missing", async () => {
    const capture = capturingLogger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" }));
    const result = await runVpsPass(capture.logger, { modules: [fakeMutationModule()] });
    expect(result.processed).toBe(1);
    expect(result.ingested).toBe(0);
    expect(capture.records.some((record) => record.message === "ingest disabled: BACKEND_URL or INGEST_SECRET not set")).toBe(
      true,
    );
  });

  it("runs only the shops in MUTATION_SHOPS", async () => {
    vi.stubEnv("MUTATION_SHOPS", "fake-mutation");
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(capture.logger, {
      modules: [fakeMutationModule(), fakeMutationModule()],
    });
    expect(result.processed).toBe(2);
  });

  it("runs nothing when MUTATION_SHOPS has only unknown ids", async () => {
    vi.stubEnv("MUTATION_SHOPS", "unknown-shop");
    const capture = capturingLogger();
    const result = await runVpsPass(capture.logger, { modules: [fakeMutationModule()] });
    expect(result.processed).toBe(0);
  });
});
