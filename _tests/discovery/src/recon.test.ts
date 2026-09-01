import { describe, expect, it } from 'vitest';
import { detectEmbeddedPatterns, detectVendor, isChallengePage } from '../../../discovery/src/recon.ts';

describe('detectVendor', () => {
  it('detects akamai from the server header', () => {
    expect(detectVendor({ server: 'AkamaiGHost' }, '')).toBe('akamai');
  });

  it('detects akamai from an akamai request id header', () => {
    expect(detectVendor({ 'x-akamai-request-id': 'abc' }, '')).toBe('akamai');
  });

  it('detects akamai from the edgesuite reference in the body', () => {
    expect(detectVendor({}, 'Reference #18.4e17655f errors.edgesuite.net')).toBe('akamai');
  });

  it('detects cloudflare from the cf-ray header', () => {
    expect(detectVendor({ 'cf-ray': 'abc-123' }, '')).toBe('cloudflare');
  });

  it('detects cloudflare from the challenge url in the body', () => {
    expect(detectVendor({}, 'challenges.cloudflare.com/turnstile')).toBe('cloudflare');
  });

  it('detects datadome from the x-datadome header', () => {
    expect(detectVendor({ 'x-datadome': 'ok' }, '')).toBe('datadome');
  });

  it('detects perimeterx from the body', () => {
    expect(detectVendor({}, 'protected by perimeterx')).toBe('perimeterx');
  });

  it('detects incapsula from the x-iinfo header', () => {
    expect(detectVendor({ 'x-iinfo': 'token' }, '')).toBe('incapsula');
  });

  it('returns none for a clean response', () => {
    expect(detectVendor({ server: 'nginx' }, '<html>shop</html>')).toBe('none');
  });
});

describe('isChallengePage', () => {
  it('flags a cloudflare verification page', () => {
    expect(isChallengePage('<title>Verifying your connection...</title>')).toBe(true);
  });

  it('flags a just a moment page', () => {
    expect(isChallengePage('<title>Just a moment...</title>')).toBe(true);
  });

  it('accepts a normal page', () => {
    expect(isChallengePage('<html><body>koszulka 99 zł</body></html>')).toBe(false);
  });
});

describe('detectEmbeddedPatterns', () => {
  it('finds json-ld and next data', () => {
    const body = '<script type="application/ld+json"></script><script id="__NEXT_DATA__"></script>';
    expect(detectEmbeddedPatterns(body)).toEqual(['jsonld', 'next']);
  });

  it('finds the nuxt payload', () => {
    expect(detectEmbeddedPatterns('window.__NUXT__={}')).toEqual(['nuxt']);
  });

  it('finds the apollo cache', () => {
    expect(detectEmbeddedPatterns('window.__APOLLO_STATE__={}')).toEqual(['apollo']);
  });

  it('finds the redux store', () => {
    expect(detectEmbeddedPatterns('window.__PRELOADED_STATE__={}')).toEqual(['redux']);
  });

  it('returns empty for a plain page', () => {
    expect(detectEmbeddedPatterns('<html><body>hello</body></html>')).toEqual([]);
  });
});
