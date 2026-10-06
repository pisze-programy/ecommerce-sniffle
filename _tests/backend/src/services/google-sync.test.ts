import { describe, expect, it } from 'vitest';
import { googleSyncDue } from '../../../../backend/src/index.ts';
import type { StateReader } from '../../../../backend/src/index.ts';

function stateWith(last: string | null): StateReader {
  return { get: async () => last };
}

describe('googleSyncDue', () => {
  it('runs when the marker is absent', async () => {
    expect(await googleSyncDue(stateWith(null), 'k', 7, '2026-10-02')).toBe(true);
  });

  it('waits when the marker is younger than the window', async () => {
    expect(await googleSyncDue(stateWith('2026-09-30'), 'k', 7, '2026-10-02')).toBe(false);
  });

  it('runs when the marker reaches the window', async () => {
    expect(await googleSyncDue(stateWith('2026-09-25'), 'k', 7, '2026-10-02')).toBe(true);
  });

  it('runs when the marker is older than the window', async () => {
    expect(await googleSyncDue(stateWith('2026-08-01'), 'k', 7, '2026-10-02')).toBe(true);
  });
});
