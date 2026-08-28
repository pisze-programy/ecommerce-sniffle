import { describe, expect, it } from 'vitest';
import { COUNTDOWN_DOMAINS, isCountdownShop } from '../../../../packages/analysis/src/countdown.ts';

describe('isCountdownShop', () => {
  it('marks every countdown domain as true', () => {
    expect(COUNTDOWN_DOMAINS).toContain('wkdzik.pl');
    expect(isCountdownShop('wkdzik.pl')).toBe(true);
    expect(isCountdownShop('laboratoriumpanidomu.pl')).toBe(true);
    expect(isCountdownShop('osmpower.pl')).toBe(true);
  });

  it('marks a normal shop as false', () => {
    expect(isCountdownShop('icon-amsterdam.com')).toBe(false);
    expect(isCountdownShop('forcer.pl')).toBe(false);
  });

  it('handles an unknown domain', () => {
    expect(isCountdownShop('nope.example')).toBe(false);
  });
});
