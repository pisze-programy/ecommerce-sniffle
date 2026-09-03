// In-memory emulation of the D1 task store for tests.
// It handles the tasks SQL. Any other SQL returns an empty result.
// It also serves the storage no-op path (readLatestSnapshot etc.).

import type { QueueDb, QueueStatement, Task } from '../../../../backend/src/services/queue.ts';
import type { D1Like, D1Statement } from '../../../../backend/src/services/storage.ts';

export type Row = Record<string, unknown>;

class FakeStatement implements QueueStatement, D1Statement {
  private args: unknown[] = [];

  constructor(
    private readonly db: MemoryQueueDb,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): FakeStatement {
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
    if (q.includes('SET status = CASE') && q.includes('lease_until = CASE')) {
      const maxAttempts = this.args[0] as number;
      const leaseUntil = this.args[2];
      const error = String(this.args[3]);
      const taskId = String(this.args[4]);
      const task = this.db.tasks.get(taskId);
      if (task !== undefined) {
        if ((task['attempts'] as number) >= maxAttempts) {
          task['status'] = 'dlq';
          task['lease_until'] = null;
        } else {
          task['status'] = 'pending';
          task['lease_until'] = leaseUntil;
        }
        task['error'] = error;
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
      const now = this.args[1] as number;
      let changes = 0;
      for (const task of this.db.tasks.values()) {
        if (
          task['status'] === 'pending' &&
          (task['attempts'] as number) >= maxAttempts &&
          (task['lease_until'] === null || (task['lease_until'] as number) < now)
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

export class MemoryQueueDb implements QueueDb, D1Like {
  readonly tasks = new Map<string, Row>();

  prepare(query: string): FakeStatement {
    return new FakeStatement(this, query);
  }

  async batch(): Promise<unknown> {
    return null;
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
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
