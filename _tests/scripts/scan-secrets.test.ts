import { describe, expect, it } from 'vitest';
import { isPlaceholder, scanDiff } from '../../scripts/scan-secrets.mjs';

// Secret-like values, built at runtime. A literal whole value must not
// appear in the source, or the scanner would flag this test file itself.
const TOKEN = 'dead'.repeat(8);
const PRIVATE_KEY = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const AWS_KEY = 'AKIA' + '1234567890ABCDEF';

function diff(file: string, added: string): string {
  return ['diff --git a/x b/x', `+++ b/${file}`, '@@ -0,0 +1 @@', `+${added}`].join('\n');
}

describe('isPlaceholder', () => {
  it('accepts one repeated character', () => {
    expect(isPlaceholder('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
  });

  it('accepts a value with a placeholder word', () => {
    expect(isPlaceholder('test-shop')).toBe(true);
  });

  it('rejects a mixed hex value', () => {
    expect(isPlaceholder(TOKEN)).toBe(false);
  });

  it('rejects an empty value', () => {
    expect(isPlaceholder('')).toBe(false);
  });
});

describe('scanDiff', () => {
  it('flags a storefront token', () => {
    const findings = scanDiff(diff('a.ts', `storefrontAccessToken = "${TOKEN}"`));
    expect(findings).toEqual([{ file: 'a.ts', rule: 'storefront token' }]);
  });

  it('ignores a placeholder storefront token', () => {
    const findings = scanDiff(diff('a.ts', 'storefrontAccessToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'));
    expect(findings).toEqual([]);
  });

  it('flags a private key header', () => {
    const findings = scanDiff(diff('a.ts', PRIVATE_KEY));
    expect(findings).toEqual([{ file: 'a.ts', rule: 'private key' }]);
  });

  it('flags an aws access key', () => {
    const findings = scanDiff(diff('a.ts', `key = "${AWS_KEY}"`));
    expect(findings).toEqual([{ file: 'a.ts', rule: 'aws access key' }]);
  });

  it('ignores removed lines', () => {
    const text = ['+++ b/a.ts', '@@ -1 +0,0 @@', `-storefrontAccessToken = "${TOKEN}"`].join('\n');
    expect(scanDiff(text)).toEqual([]);
  });

  it('ignores a plain line', () => {
    expect(scanDiff(diff('a.ts', 'const value = 1;'))).toEqual([]);
  });
});
