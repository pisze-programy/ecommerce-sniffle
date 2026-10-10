import { describe, expect, it } from 'vitest';
import { buildReport } from '../../../orchestrator/src/social.ts';
import type { SocialCounts } from '../../../orchestrator/src/social.ts';

function counts(overrides: Partial<SocialCounts> = {}): SocialCounts {
  return {
    profiles: 0,
    profileDays: 0,
    posts: 0,
    stories: 0,
    reels: 0,
    sent: 0,
    failed: 0,
    ...overrides,
  };
}

describe('social buildReport', () => {
  it('stays silent on a clean run', () => {
    const report = buildReport(3, counts({ posts: 5, sent: 3 }));
    expect(report.status).toBe('ok');
    expect(report.notify).toBe('on-error');
  });

  it('reports on failure when a payload failed', () => {
    const report = buildReport(3, counts({ failed: 1 }));
    expect(report.status).toBe('failed');
    expect(report.notify).toBe('on-error');
  });
});
