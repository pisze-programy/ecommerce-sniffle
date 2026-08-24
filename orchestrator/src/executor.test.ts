import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProvider, createLogger } from "@ecommerce-sniffle/providers";
import type { Catalog, LogRecord, Logger, ProviderModule } from "@ecommerce-sniffle/providers";
import { runExecutorPass } from "./executor.ts";
import type { QueueClient, Task } from "./queue-client.ts";

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

function task(overrides: Partial<Task> = {}): Task {
  return {
    taskId: "morning-forcer-2026-08-24",
    providerId: "fake-get",
    domain: "fake.pl",
    mode: "vps-get",
    window: "morning",
    status: "claimed",
    attempts: 1,
    leaseUntil: 999999999,
    workerId: "test",
    maskedCount: null,
    error: null,
    createdAt: 1000,
    finishedAt: null,
    ...overrides,
  };
}

function fakeGetModule(catalog: Catalog): ProviderModule {
  const config = {
    id: "fake-get",
    domain: "fake.pl",
    platform: "custom" as const,
    schedule: "0 5 * * *",
    mode: "vps-get" as const,
    window: "both" as const,
    stockSource: "html" as const,
    ratePerSecond: 1,
    requiresProxy: false,
    endpoint: "https://fake.pl",
    enabled: true,
  };
  return {
    config,
    build({ logger }) {
      return buildProvider(config, logger, async () => catalog);
    },
  };
}

function fakeQueue(sequence: Array<Task | null>): QueueClient & { calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  return {
    calls,
    async claim() {
      const value = sequence[index];
      index += 1;
      if (value === null || value === undefined) {
        return null;
      }
      calls.push(`claim:${value.taskId}`);
      return value;
    },
    async complete(taskId, maskedCount) {
      calls.push(`complete:${taskId}:${String(maskedCount)}`);
      return true;
    },
    async fail(taskId, error) {
      calls.push(`fail:${taskId}:${error}`);
      return true;
    },
  };
}

function emptyCatalog(): Catalog {
  return { domain: "fake.pl", fetchedAt: "2026-08-24T06:00:00.000Z", products: [] };
}

describe("runExecutorPass", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("executes a claimed task and completes it", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":true}' });
    vi.stubGlobal("fetch", fetchMock);
    const queue = fakeQueue([task()]);
    const result = await runExecutorPass(capture.logger, {
      queueClient: queue,
      modules: [fakeGetModule(emptyCatalog())],
    });
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(queue.calls).toEqual([
      "claim:morning-forcer-2026-08-24",
      "complete:morning-forcer-2026-08-24:0",
    ]);
    expect(capture.records.some((record) => record.message === "task done")).toBe(true);
  });

  it("fails a task that produces masked variants", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const catalog = {
      domain: "fake.pl",
      fetchedAt: "2026-08-24T06:00:00.000Z",
      products: [
        {
          id: "1",
          title: "X",
          url: "https://fake.pl/p/x",
          variants: [
            { id: "1", title: "S", sku: null, price: { amount: 1, currency: "PLN" }, regularPrice: null, available: true, quantity: null },
          ],
        },
      ],
    };
    const queue = fakeQueue([task()]);
    const result = await runExecutorPass(capture.logger, {
      queueClient: queue,
      modules: [fakeGetModule(catalog)],
    });
    expect(result.failed).toBe(1);
    expect(queue.calls.some((call) => call.startsWith("fail:morning-forcer-2026-08-24:masked"))).toBe(true);
    const record = capture.records.find((r) => r.message === "task masked");
    expect(record?.context["masked"]).toBe(1);
  });

  it("fails a task when the provider is unknown", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const queue = fakeQueue([task({ providerId: "ghost" })]);
    const result = await runExecutorPass(capture.logger, {
      queueClient: queue,
      modules: [fakeGetModule(emptyCatalog())],
    });
    expect(result.failed).toBe(1);
    expect(queue.calls.some((call) => call.startsWith("fail:morning-forcer-2026-08-24:unknown provider"))).toBe(true);
  });

  it("stops when the queue has no tasks", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const queue = fakeQueue([null]);
    const result = await runExecutorPass(capture.logger, {
      queueClient: queue,
      modules: [fakeGetModule(emptyCatalog())],
    });
    expect(result.processed).toBe(0);
  });

  it("stops when memory is low", async () => {
    vi.stubEnv("BACKEND_URL", "https://backend.example.com");
    vi.stubEnv("INGEST_SECRET", "s3cret");
    const capture = capturingLogger();
    const queue = fakeQueue([task()]);
    const result = await runExecutorPass(capture.logger, {
      queueClient: queue,
      modules: [fakeGetModule(emptyCatalog())],
      checkMemoryFn: () => false,
    });
    expect(result.processed).toBe(0);
    expect(
      capture.records.some((record) => record.message === "memory low, stop executor"),
    ).toBe(true);
  });

  it("returns early when the ingest env is missing", async () => {
    const capture = capturingLogger();
    const queue = fakeQueue([task()]);
    const result = await runExecutorPass(capture.logger, { queueClient: queue });
    expect(result.processed).toBe(0);
    expect(
      capture.records.some((record) => record.message === "executor disabled: BACKEND_URL or INGEST_SECRET not set"),
    ).toBe(true);
  });
});
