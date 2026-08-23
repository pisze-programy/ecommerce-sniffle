import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.ts";
import type { LogRecord } from "./logger.ts";

interface Capture {
  readonly records: LogRecord[];
  readonly sink: (record: LogRecord) => void;
}

function captureSink(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    sink(record: LogRecord): void {
      records.push(record);
    },
  };
}

describe("createLogger", () => {
  it("emits all levels in order", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink);
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");
    expect(capture.records.map((record) => record.level)).toEqual(["debug", "info", "warn", "error"]);
  });

  it("attaches the message", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink);
    logger.info("hello");
    expect(capture.records[0]?.message).toBe("hello");
  });

  it("attaches context as given", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink);
    logger.info("msg", { domain: "x.pl", count: 3, flag: true, missing: null });
    expect(capture.records[0]?.context).toEqual({ domain: "x.pl", count: 3, flag: true, missing: null });
  });

  it("defaults context to an empty object", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink);
    logger.info("msg");
    expect(capture.records[0]?.context).toEqual({});
  });

  it("includes an ISO timestamp", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink);
    logger.info("msg");
    expect(capture.records[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("filters records below the minimum level", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink, "warn");
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");
    expect(capture.records.map((record) => record.level)).toEqual(["warn", "error"]);
  });

  it("filters everything when the minimum level is error", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink, "error");
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");
    expect(capture.records.map((record) => record.level)).toEqual(["error"]);
  });

  it("keeps debug records at the default level", () => {
    const capture = captureSink();
    const logger = createLogger(capture.sink);
    logger.debug("debug message");
    expect(capture.records).toHaveLength(1);
  });
});
