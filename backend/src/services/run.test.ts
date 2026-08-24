import { describe, expect, it } from "vitest";
import { buildProvider, createLogger } from "@ecommerce-sniffle/providers";
import type { Logger, LogRecord, Provider, ProviderConfig, ProviderModule } from "@ecommerce-sniffle/providers";
import { runGetPipeline } from "./run.ts";

import type { D1Like, D1Statement } from "./storage.ts";

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
    // discard
  });
}

class EmptyD1 implements D1Like {
  prepare(_query: string): D1Statement {
    return {
      bind(): D1Statement {
        return this;
      },
      async all() {
        return { results: [] };
      },
      async first() {
        return null;
      },
    };
  }

  async batch(): Promise<unknown> {
    return null;
  }
}

function config(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: "mock",
    domain: "mock.pl",
    platform: "custom",
    schedule: "0 4 * * *",
    window: "both" as const,
    mode: "cf-get",
    stockSource: "html",
    ratePerSecond: 1,
    requiresProxy: false,
    endpoint: "https://mock.pl",
    enabled: true,
    ...overrides,
  };
}

function okModule(configValue: ProviderConfig): ProviderModule {
  const provider = buildProvider(configValue, silentLogger(), async () => ({
    domain: configValue.domain,
    fetchedAt: "2026-08-24T06:00:00.000Z",
    products: [],
  }));
  return {
    config: configValue,
    build(): Provider {
      return provider;
    },
  };
}

function failingModule(configValue: ProviderConfig): ProviderModule {
  return {
    config: configValue,
    build({ logger }): Provider {
      return buildProvider(configValue, logger, async () => {
        throw new Error("boom");
      });
    },
  };
}

describe("runGetPipeline", () => {
  it("runs only enabled cf-get providers", async () => {
    const modules = [
      okModule(config({ id: "a", domain: "a.pl" })),
      okModule(config({ id: "b", domain: "b.pl", mode: "vps-mutation" })),
      okModule(config({ id: "c", domain: "c.pl", enabled: false })),
    ];
    const db = new EmptyD1();
    const results = await runGetPipeline(db, silentLogger(), modules);
    expect(results).toHaveLength(1);
    expect(results[0]?.providerId).toBe("a");
    expect(results[0]?.ok).toBe(true);
  });

  it("collects provider failures without aborting the loop", async () => {
    const modules = [
      failingModule(config({ id: "bad", domain: "bad.pl" })),
      okModule(config({ id: "good", domain: "good.pl" })),
    ];
    const db = new EmptyD1();
    const results = await runGetPipeline(db, silentLogger(), modules);
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toBe("boom");
    expect(results[1]?.ok).toBe(true);
  });

  it("logs an error record when a provider fails", async () => {
    const capture = capturingLogger();
    const modules = [failingModule(config({ id: "bad", domain: "bad.pl" }))];
    const db = new EmptyD1();
    const results = await runGetPipeline(db, capture.logger, modules);
    expect(results[0]?.ok).toBe(false);
    const errorRecord = capture.records.find((record) => record.message === "runGetPipeline provider failed");
    expect(errorRecord?.level).toBe("error");
    expect(errorRecord?.context?.["providerId"]).toBe("bad");
  });
});
