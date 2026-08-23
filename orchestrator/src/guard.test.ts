import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@ecommerce-sniffle/providers";
import type { Logger, LogRecord } from "@ecommerce-sniffle/providers";
import { acquireLock, enoughMemory, releaseLock } from "./guard.ts";

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

let dir = "";

function silentLogger(): Logger {
  return createLogger(() => {
    // discard records in tests
  });
}

function lockPath(name: string): string {
  if (dir === "") {
    dir = mkdtempSync(join(tmpdir(), "ecp-guard-"));
  }
  return join(dir, name);
}

afterEach(() => {
  if (dir !== "") {
    rmSync(dir, { recursive: true, force: true });
    dir = "";
  }
});

describe("enoughMemory", () => {
  it("is true above the threshold", () => {
    expect(enoughMemory(100 * 1024 * 1024, 60)).toBe(true);
  });

  it("is true exactly at the threshold", () => {
    expect(enoughMemory(60 * 1024 * 1024, 60)).toBe(true);
  });

  it("is false below the threshold", () => {
    expect(enoughMemory(50 * 1024 * 1024, 60)).toBe(false);
  });
});

describe("lock", () => {
  it("acquires then releases", () => {
    const path = lockPath("a.lock");
    expect(acquireLock(silentLogger(), path)).toBe(true);
    releaseLock(silentLogger(), path);
    expect(acquireLock(silentLogger(), path)).toBe(true);
    releaseLock(silentLogger(), path);
  });

  it("refuses a second lock while held", () => {
    const path = lockPath("b.lock");
    expect(acquireLock(silentLogger(), path)).toBe(true);
    expect(acquireLock(silentLogger(), path)).toBe(false);
    releaseLock(silentLogger(), path);
  });

  it("removes a stale lock from a dead process", () => {
    const path = lockPath("c.lock");
    writeFileSync(path, "99999999");
    expect(acquireLock(silentLogger(), path)).toBe(true);
    releaseLock(silentLogger(), path);
  });

  it("treats an unreadable lock as stale and logs warnings", () => {
    const capture = capturingLogger();
    const path = lockPath("d.lock");
    mkdirSync(path);
    expect(acquireLock(capture.logger, path)).toBe(false);
    expect(
      capture.records.some((record) => record.message === "lock open failed"),
    ).toBe(true);
    expect(
      capture.records.some((record) => record.message === "lock read failed, treat as stale"),
    ).toBe(true);
    expect(
      capture.records.some((record) => record.message === "stale lock unlink failed"),
    ).toBe(true);
  });

  it("logs a warning when a live lock is held", () => {
    const capture = capturingLogger();
    const path = lockPath("e.lock");
    expect(acquireLock(capture.logger, path)).toBe(true);
    expect(acquireLock(capture.logger, path)).toBe(false);
    expect(
      capture.records.some((record) => record.message === "lock is held by another run"),
    ).toBe(true);
    releaseLock(capture.logger, path);
  });

  it("logs a debug record when releasing a missing lock", () => {
    const capture = capturingLogger();
    releaseLock(capture.logger, lockPath("missing.lock"));
    expect(
      capture.records.some((record) => record.message === "lock release failed"),
    ).toBe(true);
  });
});
