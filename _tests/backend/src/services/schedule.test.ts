import { describe, expect, it } from 'vitest';
import { SEED_WINDOWS, findSeedWindow, findSummaryWindow } from '../../../../backend/src/services/schedule.ts';

describe('findSeedWindow', () => {
  it('returns the window for a registered seed cron', () => {
    const window = findSeedWindow('0 16 * * *');
    expect(window).not.toBeNull();
    expect(window?.id).toBe('evening');
  });

  it('returns null for a summary cron', () => {
    expect(findSeedWindow('10 22 * * *')).toBeNull();
  });

  it('returns null for an unknown cron', () => {
    expect(findSeedWindow('0 4 * * *')).toBeNull();
  });
});

describe('findSummaryWindow', () => {
  it('returns the window for a registered summary cron', () => {
    const window = findSummaryWindow('10 22 * * *');
    expect(window).not.toBeNull();
    expect(window?.id).toBe('evening');
  });

  it('returns null for a seed cron', () => {
    expect(findSummaryWindow('0 16 * * *')).toBeNull();
  });

  it('returns null for an unknown cron', () => {
    expect(findSummaryWindow('15 3 * * *')).toBeNull();
  });
});

describe('SEED_WINDOWS', () => {
  it('keeps every id, seed cron and summary cron unique', () => {
    const ids = SEED_WINDOWS.map((window) => window.id);
    const seedCrons = SEED_WINDOWS.map((window) => window.seedCron);
    const summaryCrons = SEED_WINDOWS.map((window) => window.summaryCron);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(seedCrons).size).toBe(seedCrons.length);
    expect(new Set(summaryCrons).size).toBe(summaryCrons.length);
  });

  it('has no empty labels', () => {
    for (const window of SEED_WINDOWS) {
      expect(window.label.length).toBeGreaterThan(0);
    }
  });
});
