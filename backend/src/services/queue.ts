import type { Logger, ProviderModule } from '@ecommerce-sniffle/providers';

export interface QueueStatement {
  bind(...values: unknown[]): QueueStatement;
  first(): Promise<unknown>;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<unknown>;
}

export interface QueueDb {
  prepare(query: string): QueueStatement;
}

export interface Task {
  readonly taskId: string;
  readonly providerId: string;
  readonly domain: string;
  readonly mode: string;
  readonly window: string;
  readonly status: string;
  readonly attempts: number;
  readonly leaseUntil: number | null;
  readonly workerId: string | null;
  readonly maskedCount: number | null;
  readonly error: string | null;
  readonly createdAt: number;
  readonly finishedAt: number | null;
  readonly durationSeconds: number;
}

export interface TaskStore {
  createTask(task: Task): Promise<void>;
  claimTask(
    workerId: string,
    leaseMs: number,
    now: number,
    maxAttempts: number,
    modes: readonly string[]
  ): Promise<Task | null>;
  completeTask(taskId: string, maskedCount: number | null, now: number): Promise<void>;
  failTask(taskId: string, error: string, now: number, backoffMs: number, maxAttempts: number): Promise<void>;
  reapExpired(now: number, maxAttempts: number): Promise<number>;
  statusCounts(): Promise<Record<string, number>>;
}

function rowToTask(row: unknown): Task | null {
  if (typeof row !== 'object' || row === null) {
    return null;
  }
  const obj = row as Readonly<Record<string, unknown>>;
  const taskId = obj['task_id'];
  const providerId = obj['provider_id'];
  const domain = obj['domain'];
  const mode = obj['mode'];
  const window = obj['window'];
  const status = obj['status'];
  const attempts = obj['attempts'];
  const createdAt = obj['created_at'];
  const durationSeconds = obj['duration_seconds'];
  if (
    typeof taskId !== 'string' ||
    typeof providerId !== 'string' ||
    typeof domain !== 'string' ||
    typeof mode !== 'string' ||
    typeof window !== 'string' ||
    typeof status !== 'string' ||
    typeof attempts !== 'number' ||
    typeof createdAt !== 'number' ||
    typeof durationSeconds !== 'number'
  ) {
    return null;
  }
  return {
    taskId,
    providerId,
    domain,
    mode,
    window,
    status,
    attempts,
    leaseUntil: typeof obj['lease_until'] === 'number' ? obj['lease_until'] : null,
    workerId: typeof obj['worker_id'] === 'string' ? obj['worker_id'] : null,
    maskedCount: typeof obj['masked_count'] === 'number' ? obj['masked_count'] : null,
    error: typeof obj['error'] === 'string' ? obj['error'] : null,
    createdAt,
    finishedAt: typeof obj['finished_at'] === 'number' ? obj['finished_at'] : null,
    durationSeconds,
  };
}

export function createTaskStore(db: QueueDb, logger: Logger): TaskStore {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO tasks (task_id, provider_id, domain, mode, window, status, attempts, lease_until, worker_id, masked_count, error, created_at, finished_at, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const complete = db.prepare(
    "UPDATE tasks SET status = 'done', masked_count = ?, finished_at = ?, lease_until = NULL, worker_id = NULL WHERE task_id = ?"
  );
  const fail = db.prepare(
    'UPDATE tasks SET ' +
      "status = CASE WHEN attempts >= ? THEN 'dlq' ELSE 'pending' END, " +
      'lease_until = CASE WHEN attempts >= ? THEN NULL ELSE ? END, ' +
      'error = ?, worker_id = NULL ' +
      'WHERE task_id = ?'
  );
  const reap = db.prepare(
    "UPDATE tasks SET status = CASE WHEN attempts >= ? THEN 'dlq' ELSE 'pending' END, " +
      "lease_until = NULL, worker_id = NULL WHERE status = 'claimed' AND lease_until < ?"
  );
  const reapPending = db.prepare(
    "UPDATE tasks SET status = 'dlq' WHERE status = 'pending' AND attempts >= ? " +
      'AND (lease_until IS NULL OR lease_until < ?)'
  );
  const counts = db.prepare('SELECT status, count(*) AS c FROM tasks GROUP BY status');

  return {
    async createTask(task: Task): Promise<void> {
      try {
        await insert
          .bind(
            task.taskId,
            task.providerId,
            task.domain,
            task.mode,
            task.window,
            task.status,
            task.attempts,
            task.leaseUntil,
            task.workerId,
            task.maskedCount,
            task.error,
            task.createdAt,
            task.finishedAt,
            task.durationSeconds
          )
          .run();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('queue.createTask failed', { taskId: task.taskId, error: message });
        throw error;
      }
    },

    async claimTask(workerId, leaseMs, now, maxAttempts, modes): Promise<Task | null> {
      try {
        const placeholders = modes.map(() => '?').join(', ');
        const claim = db.prepare(
          "UPDATE tasks SET status = 'claimed', lease_until = ?, worker_id = ?, attempts = attempts + 1 " +
            'WHERE task_id = (' +
            'SELECT task_id FROM tasks ' +
            `WHERE mode IN (${placeholders}) AND attempts < ? AND (` +
            "status = 'pending' AND (lease_until IS NULL OR lease_until < ?)" +
            " OR (status = 'claimed' AND lease_until < ?)" +
            ') AND domain NOT IN (' +
            "SELECT domain FROM tasks WHERE status = 'claimed' AND lease_until >= ?" +
            ') ORDER BY duration_seconds ASC, created_at ASC LIMIT 1' +
            ') RETURNING task_id, provider_id, domain, mode, window, status, attempts, lease_until, worker_id, masked_count, error, created_at, finished_at, duration_seconds'
        );
        const row = await claim.bind(now + leaseMs, workerId, ...modes, maxAttempts, now, now, now).first();
        return rowToTask(row);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('queue.claimTask failed', { workerId, error: message });
        throw error;
      }
    },

    async completeTask(taskId, maskedCount, now): Promise<void> {
      try {
        await complete.bind(maskedCount, now, taskId).run();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('queue.completeTask failed', { taskId, error: message });
        throw error;
      }
    },

    async failTask(taskId, error, now, backoffMs, maxAttempts): Promise<void> {
      try {
        await fail.bind(maxAttempts, maxAttempts, now + backoffMs, error, taskId).run();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('queue.failTask failed', { taskId, error: message });
        throw error;
      }
    },

    async reapExpired(now, maxAttempts): Promise<number> {
      try {
        const first = (await reap.bind(maxAttempts, now).run()) as { meta: { changes: number } };
        const second = (await reapPending.bind(maxAttempts, now).run()) as { meta: { changes: number } };
        return first.meta.changes + second.meta.changes;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('queue.reapExpired failed', { error: message });
        throw error;
      }
    },

    async statusCounts(): Promise<Record<string, number>> {
      try {
        const result = await counts.all();
        const output: Record<string, number> = {};
        for (const row of result.results) {
          if (typeof row !== 'object' || row === null) {
            continue;
          }
          const obj = row as Readonly<Record<string, unknown>>;
          const status = obj['status'];
          const count = obj['c'];
          if (typeof status === 'string' && typeof count === 'number') {
            output[status] = count;
          }
        }
        return output;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('queue.statusCounts failed', { error: message });
        throw error;
      }
    },
  };
}

export async function enqueueProviders(
  db: QueueDb,
  logger: Logger,
  modules: readonly ProviderModule[],
  window: 'morning' | 'evening',
  day: string,
  now: number
): Promise<number> {
  const store = createTaskStore(db, logger);
  let count = 0;
  for (const module of modules) {
    if (!module.config.enabled) {
      continue;
    }
    const inWindow = module.config.window === 'both' || module.config.window === window;
    if (!inWindow) {
      continue;
    }
    const task: Task = {
      taskId: `${window}-${module.config.id}-${day}`,
      providerId: module.config.id,
      domain: module.config.domain,
      mode: module.config.mode,
      window,
      status: 'pending',
      attempts: 0,
      leaseUntil: null,
      workerId: null,
      maskedCount: null,
      error: null,
      createdAt: now,
      finishedAt: null,
      durationSeconds: module.config.durationSeconds,
    };
    await store.createTask(task);
    count += 1;
  }
  return count;
}
