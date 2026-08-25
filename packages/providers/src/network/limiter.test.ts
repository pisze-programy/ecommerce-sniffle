import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter } from "./limiter.ts";
import { mapPool } from "./pool.ts";

describe("ConcurrencyLimiter", () => {
  it("allows up to max concurrent acquires", async () => {
    const limiter = new ConcurrencyLimiter(3);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter["active"]).toBe(3);
  });

  it("releases a waiting acquire when a slot frees", async () => {
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

describe("mapPool with a shared limiter", () => {
  it("keeps the total concurrent calls under the limiter budget", async () => {
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

  it("shares the budget across two pools", async () => {
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
    await Promise.all([
      mapPool([1, 2, 3, 4, 5, 6], 6, fn, limiter),
      mapPool([10, 11, 12, 13, 14], 5, fn, limiter),
    ]);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
