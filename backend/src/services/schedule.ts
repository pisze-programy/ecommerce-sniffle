// The window schedule is the single source of truth for the seeds.
// One entry means one window. The logic never hardcodes a window name.
// Add a window: add one entry, add the crons, add one VPS cron line.

export interface SeedWindow {
  readonly id: string;
  readonly seedCron: string;
  readonly summaryCron: string;
  readonly label: string;
}

export const SEED_WINDOWS: readonly SeedWindow[] = [
  { id: 'evening', seedCron: '0 16 * * *', summaryCron: '10 22 * * *', label: 'Evening' },
];

export function findSeedWindow(cron: string): SeedWindow | null {
  for (const window of SEED_WINDOWS) {
    if (window.seedCron === cron) {
      return window;
    }
  }
  return null;
}

export function findSummaryWindow(cron: string): SeedWindow | null {
  for (const window of SEED_WINDOWS) {
    if (window.summaryCron === cron) {
      return window;
    }
  }
  return null;
}
