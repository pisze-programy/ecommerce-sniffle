export class ConcurrencyLimiter {
  private active = 0;
  private readonly max: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.active += 1;
  }

  release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next !== undefined) {
      next();
    }
  }
}

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A probe outcome steers the adaptive rate. A success raises the rate.
// A throttle lowers the rate. A neutral outcome holds the rate. An
// empty basket add is neutral. It is not a success. A shop that
// degrades into empty adds must not raise the rate.
export type RateOutcome = 'success' | 'throttle' | 'neutral';

export class RateLimiter {
  private intervalMs: number;
  private nextAllowed = 0;

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / requestsPerSecond;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const target = Math.max(this.nextAllowed, now);
    this.nextAllowed = target + this.intervalMs;
    if (target > now) {
      await delayMs(target - now);
    }
  }

  // The fixed limiter has no adaptive state. The report is a no-op.
  report(_outcome: RateOutcome): void {}
}

// The shop tells us its real limit through throttles. This limiter
// listens and self-tunes. A throttle multiplies the rate down. A run
// of clean successes raises the rate by one step. The rate stays
// between the configured floor and ceiling.
//
// How to use it:
// - Create one limiter per shop.
// - Set the rate bounds in the shop config block `adaptiveRate`.
// - The block must satisfy: min <= start <= max.
// - `backoffFactor` must be between 0 and 1.
// - `recoveryCount` must be a positive integer.
// - Feed each probe outcome with report().
// - A throttle lowers the rate.
// - A success raises the rate after a clean run.
// - A neutral outcome holds the rate.
export class AdaptiveRateLimiter {
  private rate: number;
  private cleanStreak = 0;
  private nextAllowed = 0;
  private readonly min: number;
  private readonly max: number;
  private readonly backoffFactor: number;
  private readonly recoveryStep: number;
  private readonly recoveryCount: number;

  constructor(config: {
    readonly minRequestsPerSecond: number;
    readonly maxRequestsPerSecond: number;
    readonly startRequestsPerSecond: number;
    readonly backoffFactor: number;
    readonly recoveryStep: number;
    readonly recoveryCount: number;
  }) {
    this.min = config.minRequestsPerSecond;
    this.max = config.maxRequestsPerSecond;
    this.rate = Math.min(Math.max(config.startRequestsPerSecond, this.min), this.max);
    this.backoffFactor = config.backoffFactor;
    this.recoveryStep = config.recoveryStep;
    this.recoveryCount = Math.max(1, config.recoveryCount);
  }

  currentRate(): number {
    return this.rate;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const intervalMs = 1000 / this.rate;
    const target = Math.max(this.nextAllowed, now);
    this.nextAllowed = target + intervalMs;
    if (target > now) {
      await delayMs(target - now);
    }
  }

  report(outcome: RateOutcome): void {
    if (outcome === 'throttle') {
      this.rate = Math.max(this.min, this.rate * this.backoffFactor);
      this.cleanStreak = 0;
      return;
    }
    if (outcome === 'success') {
      this.cleanStreak += 1;
      if (this.cleanStreak >= this.recoveryCount) {
        this.rate = Math.min(this.max, this.rate + this.recoveryStep);
        this.cleanStreak = 0;
      }
      return;
    }
    // A neutral outcome holds the rate. It does not reset the streak.
  }
}
