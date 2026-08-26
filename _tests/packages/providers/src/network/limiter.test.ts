import { describe, expect, it } from 'vitest';
import { ConcurrencyLimiter, RateLimiter } from '../../../../../packages/providers/src/network/limiter.ts';
import { mapPool } from '../../../../../packages/providers/src/network/pool.ts';

describe('RateLimiter', () => {
  it('paces acquires to the configured rate', async () => {
    const limiter = new RateLimiter(10);
    const t0 = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(190);
  });

  it('does not delay the first acquire', async () => {
    const limiter = new RateLimiter(1);
    const t0 = Date.now();
    await limiter.acquire();
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe('ConcurrencyLimiter', () => {
  it('allows up to max concurrent acquires', async () => {
    const limiter = new ConcurrencyLimiter(3);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter['active']).toBe(3);
  });

  it('releases a waiting acquire when a slot frees', async () => {
    const limiter = new ConcurrencyLimiter(1);
    await limiter.acquire();
    let released = false;
    const waiting = limiter.acquire().then(() => {
      released = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(released).toBe(false);
    limiter.release();
    await waiting;
    expect(released).toBe(true);
  });
});

describe('mapPool with a shared limiter', () => {
  it('keeps the total concurrent calls under the limiter budget', async () => {
    const limiter = new ConcurrencyLimiter(3);
    let active = 0;
    let peak = 0;
    const fn = async (item: number): Promise<number> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item;
    };
    await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 8, fn, limiter);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3);
  });

  it('shares the budget across two pools', async () => {
    const limiter = new ConcurrencyLimiter(4);
    let active = 0;
    let peak = 0;
    const fn = async (item: number): Promise<number> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 4));
      active -= 1;
      return item;
    };
    await Promise.all([mapPool([1, 2, 3, 4, 5, 6], 6, fn, limiter), mapPool([10, 11, 12, 13, 14], 5, fn, limiter)]);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
