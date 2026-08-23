import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_MODULES, createLogger } from "@ecommerce-sniffle/providers";
import type { Logger, LogRecord } from "@ecommerce-sniffle/providers";
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
});

function findModule(id: string) {
  const module = ALL_MODULES.find((entry) => entry.config.id === id);
  if (module === undefined) {
    throw new Error(`missing module ${id}`);
  }
  return module;
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
});
