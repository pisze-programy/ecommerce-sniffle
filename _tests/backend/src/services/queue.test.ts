import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { LogRecord, Logger } from '@ecommerce-sniffle/providers';
import { createTaskStore, enqueueProviders } from '../../../../backend/src/services/queue.ts';
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

type Row = Record<string, unknown>;

class FakeStatement implements QueueStatement {
  private args: unknown[] = [];

  constructor(
    private readonly db: FakeQueueDb,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): QueueStatement {
    this.args = values;
    return this;
  }

  async first(): Promise<unknown> {
    const rows = this.execute();
    return rows[0] ?? null;
  }

  async all(): Promise<{ results: unknown[] }> {
    return { results: this.execute() };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: this.execute().length } };
  }

  private execute(): Row[] {
    const q = this.query;
    if (q.startsWith('INSERT OR IGNORE INTO tasks')) {
      const [
        task_id,
        provider_id,
        domain,
        mode,
        window,
        status,
        attempts,
        lease_until,
        worker_id,
        masked_count,
        error,
        created_at,
        finished_at,
        duration_seconds,
      ] = this.args;
      if (this.db.tasks.has(String(task_id))) {
        return [];
      }
      this.db.tasks.set(String(task_id), {
        task_id,
        provider_id,
        domain,
        mode,
        window,
        status,
        attempts,
        lease_until,
        worker_id,
        masked_count,
        error,
        created_at,
        finished_at,
        duration_seconds,
      });
      return [];
    }
    if (q.includes("SET status = 'claimed'")) {
      const leaseUntil = this.args[0];
      const workerId = this.args[1];
      const rest = this.args.slice(2);
      const maxAttempts = rest[rest.length - 4] as number;
      const nowPending = rest[rest.length - 3] as number;
      const nowExpired = rest[rest.length - 2] as number;
      const nowInFlight = rest[rest.length - 1] as number;
      const modes = rest.slice(0, rest.length - 4) as string[];
      const all = [...this.db.tasks.values()];
      const picked = all
        .filter((t) => modes.includes(String(t['mode'])))
        .filter((t) => (t['attempts'] as number) < maxAttempts)
        .filter((t) => {
          if (t['status'] === 'pending') {
            return t['lease_until'] === null || (t['lease_until'] as number) < nowPending;
          }
          return t['status'] === 'claimed' && (t['lease_until'] as number) < nowExpired;
        })
        .filter((t) => {
          const blocked = all.some(
            (o) =>
              o['status'] === 'claimed' && (o['lease_until'] as number) >= nowInFlight && o['domain'] === t['domain']
          );
          return !blocked;
        })
        .sort((a, b) => {
          const durationA = a['duration_seconds'] as number;
          const durationB = b['duration_seconds'] as number;
          if (durationA !== durationB) {
            return durationA - durationB;
          }
          return (a['created_at'] as number) - (b['created_at'] as number);
        });
      const task = picked[0];
      if (task === undefined) {
        return [];
      }
      task['status'] = 'claimed';
      task['lease_until'] = leaseUntil;
      task['worker_id'] = workerId;
      task['attempts'] = (task['attempts'] as number) + 1;
      return [task];
    }
    if (q.includes("SET status = 'done'")) {
      const maskedCount = this.args[0];
      const finishedAt = this.args[1];
      const taskId = String(this.args[2]);
      const task = this.db.tasks.get(taskId);
      if (task !== undefined) {
        task['status'] = 'done';
        task['masked_count'] = maskedCount;
        task['finished_at'] = finishedAt;
        task['lease_until'] = null;
        task['worker_id'] = null;
      }
      return [];
    }
    if (q.includes("SET status = 'pending'") && q.includes('error')) {
      const error = String(this.args[0]);
      const leaseUntil = this.args[1];
      const taskId = String(this.args[2]);
      const task = this.db.tasks.get(taskId);
      if (task !== undefined) {
        task['status'] = 'pending';
        task['error'] = error;
        task['lease_until'] = leaseUntil;
        task['worker_id'] = null;
      }
      return [];
    }
    if (q.includes('CASE WHEN attempts')) {
      const maxAttempts = this.args[0] as number;
      const now = this.args[1] as number;
      let changes = 0;
      for (const task of this.db.tasks.values()) {
        if (task['status'] === 'claimed' && (task['lease_until'] as number) < now) {
          task['status'] = (task['attempts'] as number) >= maxAttempts ? 'dlq' : 'pending';
          task['lease_until'] = null;
          task['worker_id'] = null;
          changes += 1;
        }
      }
      return changes > 0 ? [{}] : [];
    }
    if (q.includes("SET status = 'dlq'")) {
      const maxAttempts = this.args[0] as number;
      let changes = 0;
      for (const task of this.db.tasks.values()) {
        if (
          task['status'] === 'pending' &&
          (task['attempts'] as number) >= maxAttempts &&
          task['lease_until'] === null
        ) {
          task['status'] = 'dlq';
          changes += 1;
        }
      }
      return changes > 0 ? [{}] : [];
    }
    if (q.includes('SELECT status, count')) {
      const counts: Record<string, number> = {};
      for (const task of this.db.tasks.values()) {
        const status = String(task['status']);
        counts[status] = (counts[status] ?? 0) + 1;
      }
      return Object.entries(counts).map(([status, c]) => ({ status, c }));
    }
    return [];
  }
}

class FakeQueueDb implements QueueDb {
  readonly tasks = new Map<string, Row>();

  prepare(query: string): QueueStatement {
    return new FakeStatement(this, query);
  }
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    taskId: 'morning-forcer-2026-08-24',
    providerId: 'forcer',
    domain: 'forcer.pl',
    mode: 'vps-get',
    window: 'morning',
    status: 'pending',
    attempts: 0,
    leaseUntil: null,
    workerId: null,
    maskedCount: null,
    error: null,
    createdAt: 1000,
    finishedAt: null,
    durationSeconds: 600,
    ...overrides,
  };
}

const NOW = 1_000_000;

describe('createTaskStore', () => {
  it('creates a task and claims it', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task());
    const claimed = await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    expect(claimed?.taskId).toBe('morning-forcer-2026-08-24');
    expect(claimed?.status).toBe('claimed');
    expect(claimed?.attempts).toBe(1);
    expect(db.tasks.get('morning-forcer-2026-08-24')?.['lease_until']).toBe(NOW + 1800000);
  });

  it('does not claim a task of a mode the worker does not handle', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task());
    const claimed = await store.claimTask('cf-1', 1800000, NOW, 3, ['cf-get']);
    expect(claimed).toBeNull();
  });

  it('does not claim two tasks of the same domain at once', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task({ taskId: 't1', createdAt: 1 }));
    await store.createTask(task({ taskId: 't2', createdAt: 2 }));
    const first = await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    const second = await store.claimTask('vps-2', 1800000, NOW, 3, ['vps-get']);
    expect(first?.taskId).toBe('t1');
    expect(second).toBeNull();
  });

  it('completes a claimed task', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task());
    await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    await store.completeTask('morning-forcer-2026-08-24', 0, NOW + 100);
    const counts = await store.statusCounts();
    expect(counts['done']).toBe(1);
  });

  it('claims a task whose lease has expired', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task());
    await store.claimTask('vps-1', 1000, NOW, 3, ['vps-get']);
    const reclaimed = await store.claimTask('vps-2', 1000, NOW + 5000, 3, ['vps-get']);
    expect(reclaimed?.taskId).toBe('morning-forcer-2026-08-24');
    expect(reclaimed?.workerId).toBe('vps-2');
  });

  it('claims the fastest task before a slower one', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(
      task({ taskId: 'slow', providerId: 'slow', domain: 'slow.pl', createdAt: 1, durationSeconds: 3600 })
    );
    await store.createTask(
      task({ taskId: 'fast', providerId: 'fast', domain: 'fast.pl', createdAt: 2, durationSeconds: 5 })
    );
    const first = await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    expect(first?.taskId).toBe('fast');
    const second = await store.claimTask('vps-2', 1800000, NOW, 3, ['vps-get']);
    expect(second?.taskId).toBe('slow');
  });

  it('returns a failed task to pending after the backoff', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task());
    await store.claimTask('vps-1', 1800000, NOW, 3, ['vps-get']);
    await store.failTask('morning-forcer-2026-08-24', 'masked 5', NOW, 1000);
    const duringBackoff = await store.claimTask('vps-2', 1800000, NOW + 10, 3, ['vps-get']);
    expect(duringBackoff).toBeNull();
    const afterBackoff = await store.claimTask('vps-2', 1800000, NOW + 2000, 3, ['vps-get']);
    expect(afterBackoff?.attempts).toBe(2);
    expect(db.tasks.get('morning-forcer-2026-08-24')?.['error']).toBe('masked 5');
  });

  it('reaps an expired lease back to pending', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task());
    await store.claimTask('vps-1', 1000, NOW, 3, ['vps-get']);
    const reaped = await store.reapExpired(NOW + 5000, 3);
    expect(reaped).toBe(1);
    const counts = await store.statusCounts();
    expect(counts['pending']).toBe(1);
  });

  it('reaps an exhausted task to dlq', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
    const store = createTaskStore(db, capture.logger);
    await store.createTask(task({ attempts: 2 }));
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
    await expect(store.createTask(task())).rejects.toThrow('d1 boom');
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
    const db = new FakeQueueDb();
    const count = await enqueueProviders(db, capture.logger, [MODULE as never], 'morning', '2026-08-24', NOW);
    expect(count).toBe(1);
    const store = createTaskStore(db, capture.logger);
    const statuses = await store.statusCounts();
    expect(statuses['pending']).toBe(1);
  });

  it('skips providers disabled or outside the window', async () => {
    const capture = capturingLogger();
    const db = new FakeQueueDb();
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});
