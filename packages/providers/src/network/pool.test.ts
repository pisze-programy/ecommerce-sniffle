import { describe, expect, it } from "vitest";
import { mapPool } from "./pool.ts";

describe("mapPool", () => {
  it("runs all items and preserves the input order", async () => {
    const input = [1, 2, 3, 4, 5];
    const result = await mapPool(input, 2, async (item) => item * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("runs at most the given concurrency at once", async () => {
    let active = 0;
    let peak = 0;
    await mapPool([1, 2, 3, 4, 5, 6, 7, 8], 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3);
  });

  it("handles an empty input", async () => {
    const result = await mapPool([], 4, async (item) => item);
    expect(result).toEqual([]);
  });

  it("clamps the concurrency to at least one", async () => {
    const result = await mapPool([1, 2], 0, async (item) => item * 2);
    expect(result).toEqual([2, 4]);
  });

  it("isolates a rejecting item without stopping the other items", async () => {
    const input = [1, 2, 3, 4];
    const seen: number[] = [];
    const result = await mapPool(input, 2, async (item) => {
      if (item === 3) {
        throw new Error("boom");
      }
      seen.push(item);
      return item;
    }).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
    expect(seen.sort()).toEqual([1, 2, 4]);
  });
});
