import { ConcurrencyLimiter } from './limiter.ts';

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  limiter?: ConcurrencyLimiter
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item === undefined) {
        continue;
      }
      if (limiter === undefined) {
        results[current] = await fn(item, current);
        continue;
      }
      await limiter.acquire();
      try {
        results[current] = await fn(item, current);
      } finally {
        limiter.release();
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
