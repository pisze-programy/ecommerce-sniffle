import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCloudflareChallenge, findTurnstileSitekey } from '../../../../../packages/providers/src/captcha/detect.ts';

const fixture = readFileSync(
  join(__dirname, '../../../../../_internal/dumps/cf-challenge/booso.cart-add.challenge.html'),
  'utf8'
);

describe('isCloudflareChallenge', () => {
  it('detects the captured booso managed challenge', () => {
    expect(isCloudflareChallenge(fixture)).toBe(true);
  });

  it('detects a minimal managed challenge marker', () => {
    expect(isCloudflareChallenge('{"x":1} cType: \'managed\'')).toBe(true);
  });

  it('detects the verifying connection marker', () => {
    expect(isCloudflareChallenge('<title>Verifying your connection...</title>')).toBe(true);
  });

  it('returns false for a normal response', () => {
    expect(isCloudflareChallenge('{"id":1,"quantity":1}')).toBe(false);
    expect(isCloudflareChallenge('')).toBe(false);
  });
});

describe('findTurnstileSitekey', () => {
  it('finds a standalone widget sitekey', () => {
    const html = '<div class="cf-turnstile" data-sitekey="0x4AAAAAAAB2xT"></div>';
    expect(findTurnstileSitekey(html)).toBe('0x4AAAAAAAB2xT');
  });

  it('returns null for the managed challenge (no sitekey in html)', () => {
    expect(findTurnstileSitekey(fixture)).toBeNull();
  });

  it('returns null when there is no sitekey', () => {
    expect(findTurnstileSitekey('no captcha here')).toBeNull();
    expect(findTurnstileSitekey('<div data-sitekey=""></div>')).toBeNull();
  });
});
