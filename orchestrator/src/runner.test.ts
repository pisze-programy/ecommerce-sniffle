import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_MODULES,
  buildProvider,
  buildStockRevealer,
  createLogger,
} from "@ecommerce-sniffle/providers";
import type { Logger, LogRecord, ProviderConfig, ProviderModule } from "@ecommerce-sniffle/providers";
import { isStockRevealer, runVpsPass } from "./runner.ts";
import type { VpsPassOptions } from "./runner.ts";

function networkDisabledFetch(): NonNullable<VpsPassOptions["directFetch"]> {
  return () => Promise.reject(new Error("network disabled"));
}

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
    window: "both" as const,
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

function fakeGetModule(): ProviderModule {
  const config: ProviderConfig = {
    id: "fake-get",
    domain: "get.pl",
    platform: "custom",
    schedule: "0 5 * * *",
    window: "both" as const,
    mode: "vps-get",
    stockSource: "html",
    ratePerSecond: 1,
    requiresProxy: false,
    endpoint: "https://get.pl",
    enabled: true,
  };
  const catalog = { domain: "get.pl", fetchedAt: "2026-08-24T06:00:00.000Z", products: [] };
  return {
    config,
    build({ logger }) {
      return buildProvider(config, logger, async () => catalog);
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
  it("processes exactly the vps providers", async () => {
    const result = await runVpsPass(silentLogger(), { directFetch: networkDisabledFetch() });
    expect(result.processed).toBe(15);
  });

  it("collects all not-implemented providers as failures", async () => {
    const result = await runVpsPass(silentLogger(), { directFetch: networkDisabledFetch() });
    expect(result.failed).toHaveLength(15);
  });

  it("reports the expected vps provider ids", async () => {
    const result = await runVpsPass(silentLogger(), { directFetch: networkDisabledFetch() });
    expect([...result.failed].sort()).toEqual([
      "arustamian",
      "dobrerzeczy",
      "e-daag",
      "emereedivine",
      "foodsbyann",
      "forcer",
      "gymglamour",
      "laboratoriumpanidomu",
      "magdabutrym",
      "misbhv",
      "montiel",
      "noo-ma",
      "phlov",
      "sklepskolim",
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
    const result = await runVpsPass(capture.logger, { directFetch: networkDisabledFetch() });
    expect(result.failed).toHaveLength(15);
    const warns = capture.records.filter((record) => record.message === "run provider failed");
    expect(warns).toHaveLength(15);
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

  it("fetches and ingests a vps-get provider", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":true}' });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(capture.logger, { modules: [fakeGetModule()] });
    expect(result.processed).toBe(1);
    expect(result.failed).toHaveLength(0);
    expect(result.ingested).toBe(1);
    expect(capture.records.some((record) => record.message === "ingest.sent")).toBe(true);
  });

  it("runs only the vps-get shops in VPS_GET_SHOPS", async () => {
    vi.stubEnv("VPS_GET_SHOPS", "fake-get");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(silentLogger(), { modules: [fakeGetModule()] });
    expect(result.processed).toBe(1);
  });

  it("runs nothing when VPS_GET_SHOPS has only unknown ids", async () => {
    vi.stubEnv("VPS_GET_SHOPS", "unknown-shop");
    const result = await runVpsPass(silentLogger(), { modules: [fakeGetModule()] });
    expect(result.processed).toBe(0);
  });

  it("keeps MUTATION_SHOPS and VPS_GET_SHOPS filters separate", async () => {
    vi.stubEnv("MUTATION_SHOPS", "fake-mutation");
    vi.stubEnv("VPS_GET_SHOPS", "fake-get");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(silentLogger(), {
      modules: [fakeMutationModule(), fakeGetModule()],
    });
    expect(result.processed).toBe(2);
  });

  it("skips vps-get providers when only MUTATION_SHOPS is set", async () => {
    vi.stubEnv("MUTATION_SHOPS", "fake-mutation");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(silentLogger(), {
      modules: [fakeMutationModule(), fakeGetModule()],
    });
    expect(result.processed).toBe(1);
  });

  it("skips mutation providers when only VPS_GET_SHOPS is set", async () => {
    vi.stubEnv("VPS_GET_SHOPS", "fake-get");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runVpsPass(silentLogger(), {
      modules: [fakeMutationModule(), fakeGetModule()],
    });
    expect(result.processed).toBe(1);
  });

  it("logs a failed vps-get provider", async () => {
    const capture = capturingLogger();
    const failing = (): ProviderModule => {
      const config: ProviderConfig = {
        id: "fake-get-fail",
        domain: "fail.pl",
        platform: "custom",
        schedule: "0 5 * * *",
        window: "both" as const,
        mode: "vps-get",
        stockSource: "html",
        ratePerSecond: 1,
        requiresProxy: false,
        endpoint: "https://fail.pl",
        enabled: true,
      };
      return {
        config,
        build({ logger }) {
          return buildProvider(config, logger, async () => {
            throw new Error("catalog boom");
          });
        },
      };
    };
    const result = await runVpsPass(capture.logger, {
      modules: [failing()],
      directFetch: networkDisabledFetch(),
    });
    expect(result.processed).toBe(1);
    expect(result.failed).toEqual(["fake-get-fail"]);
    const warn = capture.records.find((record) => record.message === "run provider failed");
    expect(warn?.context["providerId"]).toBe("fake-get-fail");
    expect(warn?.context["error"]).toBe("catalog boom");
  });

  it("does not pass directFetch to a vps-get provider that requires the proxy", async () => {
    const proxyGet = (): ProviderModule => {
      const config: ProviderConfig = {
        id: "fake-proxy-get",
        domain: "proxy.pl",
        platform: "custom",
        schedule: "0 6 * * *",
        window: "both" as const,
        mode: "vps-get",
        stockSource: "html",
        ratePerSecond: 1,
        requiresProxy: true,
        endpoint: "https://proxy.pl",
        enabled: true,
      };
      const catalog = { domain: "proxy.pl", fetchedAt: "2026-08-24T06:00:00.000Z", products: [] };
      return {
        config,
        build({ logger, directFetch }) {
          if (directFetch !== undefined) {
            throw new Error("proxy get must not receive directFetch");
          }
          return buildProvider(config, logger, async () => catalog);
        },
      };
    };
    const result = await runVpsPass(silentLogger(), {
      modules: [proxyGet()],
      directFetch: networkDisabledFetch(),
    });
    expect(result.processed).toBe(1);
    expect(result.failed).toHaveLength(0);
  });
});
