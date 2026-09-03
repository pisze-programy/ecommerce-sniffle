import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { LogRecord, Logger } from '@ecommerce-sniffle/providers';
import { createTaskStore, enqueueProviders } from '../../../../backend/src/services/queue.ts';
import { makeTask, MemoryQueueDb, Row } from './memory-queue-db.ts';
import type { QueueDb, QueueStatement, Task } from '../../../../backend/src/services/queue.ts';

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

const NOW = 1_000_000;

describe('createTaskStore', () => {
  it('creates a task and claims it', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask());
    const claimed = await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    expect(claimed?.taskId).toBe('morning-forcer-2026-08-24');
    expect(claimed?.status).toBe('claimed');
    expect(claimed?.attempts).toBe(1);
    expect(db.tasks.get('morning-forcer-2026-08-24')?.['lease_until']).toBe(NOW + 1800000);
  });

  it('does not claim a task of a mode the worker does not handle', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask());
    const claimed = await store.claimTask('cf-1', 1800000, NOW, 3, ['cf-get']);
    expect(claimed).toBeNull();
  });

  it('does not claim two tasks of the same domain at once', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask({ taskId: 't1', createdAt: 1 }));
    await store.createTask(makeTask({ taskId: 't2', createdAt: 2 }));
    const first = await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    const second = await store.claimTask('vps-2', 1800000, NOW, 3, ['vps-get']);
    expect(first?.taskId).toBe('t1');
    expect(second).toBeNull();
  });

  it('completes a claimed task', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask());
    await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    await store.completeTask('morning-forcer-2026-08-24', 0, NOW + 100);
    const counts = await store.statusCounts();
    expect(counts['done']).toBe(1);
  });

  it('claims a task whose lease has expired', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask());
    await store.claimTask('vps-1', 1000, NOW, 3, ['vps-get']);
    const reclaimed = await store.claimTask('vps-2', 1000, NOW + 5000, 3, ['vps-get']);
    expect(reclaimed?.taskId).toBe('morning-forcer-2026-08-24');
    expect(reclaimed?.workerId).toBe('vps-2');
  });

  it('claims the fastest task before a slower one', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(
      makeTask({ taskId: 'slow', providerId: 'slow', domain: 'slow.pl', createdAt: 1, durationSeconds: 3600 })
    );
    await store.createTask(
      makeTask({ taskId: 'fast', providerId: 'fast', domain: 'fast.pl', createdAt: 2, durationSeconds: 5 })
    );
    const first = await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    expect(first?.taskId).toBe('fast');
    const second = await store.claimTask('vps-2', 1800000, NOW, 3, ['vps-get']);
    expect(second?.taskId).toBe('slow');
  });

  it('returns a failed task to pending after the backoff', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask());
    await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    await store.failTask('morning-forcer-2026-08-24', 'masked 5', NOW, 1000, 3);
    const duringBackoff = await store.claimTask('vps-2', 1800000, NOW + 10, 3, ['vps-get']);
    expect(duringBackoff).toBeNull();
    const afterBackoff = await store.claimTask('vps-2', 1800000, NOW + 2000, 3, ['vps-get']);
    expect(afterBackoff?.attempts).toBe(2);
    expect(db.tasks.get('morning-forcer-2026-08-24')?.['error']).toBe('masked 5');
  });

  it('moves a task to dlq when it fails at the max attempt', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask({ attempts: 2 }));
    await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    await store.failTask('morning-forcer-2026-08-24', 'final error', NOW, 1000, 3);
    const counts = await store.statusCounts();
    expect(counts['dlq']).toBe(1);
    const row = db.tasks.get('morning-forcer-2026-08-24');
    expect(row?.['status']).toBe('dlq');
    expect(row?.['lease_until']).toBeNull();
    expect(row?.['worker_id']).toBeNull();
  });

  it('keeps a below-max failed task in pending with a lease', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask({ attempts: 1 }));
    await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    await store.failTask('morning-forcer-2026-08-24', 'retry', NOW, 1000, 3);
    const row = db.tasks.get('morning-forcer-2026-08-24');
    expect(row?.['status']).toBe('pending');
    expect(row?.['lease_until']).toBe(NOW + 1000);
  });

  it('reaps a stuck pending task with an expired lease to dlq', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask({ attempts: 3, leaseUntil: NOW - 5000, status: 'pending' }));
    const reaped = await store.reapExpired(NOW, 3);
    expect(reaped).toBe(1);
    const counts = await store.statusCounts();
    expect(counts['dlq']).toBe(1);
  });

  it('does not reap a task that is still in backoff', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask({ attempts: 3, leaseUntil: NOW + 10000, status: 'pending' }));
    const reaped = await store.reapExpired(NOW, 3);
    expect(reaped).toBe(0);
    const counts = await store.statusCounts();
    expect(counts['pending']).toBe(1);
  });

  it('reaps an expired lease back to pending', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask());
    await store.claimTask('vps-1', 1000, NOW, 3, ['vps-get']);
    const reaped = await store.reapExpired(NOW + 5000, 3);
    expect(reaped).toBe(1);
    const counts = await store.statusCounts();
    expect(counts['pending']).toBe(1);
  });

  it('reaps an exhausted task to dlq', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(makeTask({ attempts: 2 }));
    await store.claimTask('vps-1', 1000, NOW, 3, ['vps-get']);
    await store.reapExpired(NOW + 5000, 3);
    const counts = await store.statusCounts();
    expect(counts['dlq']).toBe(1);
  });

  it('logs an error when createTask fails', async () => {
    const capture = capturingLogger();
    const failing = (): QueueDb => ({
      prepare(): QueueStatement {
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async all() {
            return { results: [] };
          },
          async run() {
            throw new Error('d1 boom');
          },
        };
      },
    });
    const store = createTaskStore(failing(), capture.logger);
    await expect(store.createTask(makeTask())).rejects.toThrow('d1 boom');
    const record = capture.records.find((r) => r.message === 'queue.createTask failed');
    expect(record?.level).toBe('error');
  });
});

describe('enqueueProviders', () => {
  const MODULE = {
    config: {
      id: 'forcer',
      domain: 'forcer.pl',
      mode: 'vps-get',
      window: 'both',
      enabled: true,
    },
  };

  it('enqueues providers that match the window', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const count = await enqueueProviders(db, capture.logger, [MODULE as never], 'morning', '2026-08-24', NOW);
    expect(count).toBe(1);
    const store = createTaskStore(db, capture.logger);
    const statuses = await store.statusCounts();
    expect(statuses['pending']).toBe(1);
  });

  it('skips providers disabled or outside the window', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const disabled = { ...MODULE, config: { ...MODULE.config, enabled: false } };
    const wrongWindow = { ...MODULE, config: { ...MODULE.config, window: 'evening' } };
    const count = await enqueueProviders(
      db,
      capture.logger,
      [disabled as never, wrongWindow as never],
      'morning',
      '2026-08-24',
      NOW
    );
    expect(count).toBe(0);
  });

  it('enqueues cf-get providers', async () => {
    const capture = capturingLogger();
    const db = new MemoryQueueDb();
    const cf = { ...MODULE, config: { ...MODULE.config, mode: 'cf-get' } };
    const count = await enqueueProviders(db, capture.logger, [cf as never], 'morning', '2026-08-24', NOW);
    expect(count).toBe(1);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
