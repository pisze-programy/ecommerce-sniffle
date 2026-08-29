import { describe, expect, it } from 'vitest';
import { AdaptiveRateLimiter, RateLimiter } from '../../../../../packages/providers/src/network/limiter.ts';
import type { AdaptiveRateConfig } from '../../../../../packages/providers/src/types.ts';

const CONFIG: AdaptiveRateConfig = {
  minRequestsPerSecond: 0.5,
  maxRequestsPerSecond: 3,
  startRequestsPerSecond: 2,
  backoffFactor: 0.5,
  recoveryStep: 0.1,
  recoveryCount: 4,
};

describe('AdaptiveRateLimiter', () => {
  it('starts at the configured start rate', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    expect(limiter.currentRate()).toBe(2);
  });

  it('clamps the start rate to the bounds', () => {
    const limiter = new AdaptiveRateLimiter({ ...CONFIG, startRequestsPerSecond: 99 });
    expect(limiter.currentRate()).toBe(3);
    const floor = new AdaptiveRateLimiter({ ...CONFIG, startRequestsPerSecond: 0.01 });
    expect(floor.currentRate()).toBe(0.5);
  });

  it('multiplies the rate down on a throttle', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    limiter.report('throttle');
    expect(limiter.currentRate()).toBe(1);
  });

  it('clamps the rate at the floor on repeated throttles', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    limiter.report('throttle');
    limiter.report('throttle');
    limiter.report('throttle');
    expect(limiter.currentRate()).toBe(0.5);
  });

  it('holds the rate on a neutral outcome', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    limiter.report('throttle');
    limiter.report('neutral');
    limiter.report('neutral');
    expect(limiter.currentRate()).toBe(1);
  });

  it('raises the rate after a run of clean successes', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    limiter.report('throttle');
    for (let i = 0; i < 4; i += 1) {
      limiter.report('success');
    }
    expect(limiter.currentRate()).toBe(1.1);
  });

  it('resets the clean streak on a throttle', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    limiter.report('throttle');
    limiter.report('success');
    limiter.report('success');
    limiter.report('throttle');
    limiter.report('success');
    limiter.report('success');
    limiter.report('success');
    expect(limiter.currentRate()).toBe(0.5);
    limiter.report('success');
    expect(limiter.currentRate()).toBe(0.6);
  });

  it('clamps the rate at the ceiling on recovery', () => {
    const limiter = new AdaptiveRateLimiter(CONFIG);
    for (let i = 0; i < 100; i += 1) {
      limiter.report('success');
    }
    expect(limiter.currentRate()).toBe(3);
  });

  it('paces acquires at the current rate', async () => {
    const limiter = new AdaptiveRateLimiter({ ...CONFIG, startRequestsPerSecond: 10 });
    const t0 = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
  });
});

describe('RateLimiter report', () => {
  it('keeps the fixed rate unchanged on any report', async () => {
    const limiter = new RateLimiter(5);
    limiter.report('throttle');
    limiter.report('success');
    limiter.report('neutral');
    const t0 = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
  });
});
