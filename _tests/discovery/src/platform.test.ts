import { describe, expect, it } from 'vitest';
import { detectPlatform, detectPlatformFromCdn } from '../../../discovery/src/platform.ts';

describe('detectPlatform', () => {
  it('detects shopify from the cdn', () => {
    const html = '<html><link rel="stylesheet" href="https://cdn.shopify.com/s/files/1/x.css"></html>';
    expect(detectPlatform(200, html)).toBe('shopify');
  });

  it('detects shopify from the generator meta', () => {
    const html = '<meta name="generator" content="Shopify" />';
    expect(detectPlatform(200, html)).toBe('shopify');
  });

  it('detects shoper from a signature', () => {
    const html = '<script src="https://a.myshopapp.eu/shopapi"></script>';
    expect(detectPlatform(200, html)).toBe('shoper');
  });

  it('detects prestashop from the generator meta', () => {
    const html = '<meta name="generator" content="PrestaShop" />';
    expect(detectPlatform(200, html)).toBe('prestashop');
  });

  it('detects woocommerce from wp-content and woo', () => {
    const html = '<link href="https://x.pl/wp-content/plugins/woocommerce/woo.css">';
    expect(detectPlatform(200, html)).toBe('woocommerce');
  });

  it('detects wordpress from wp-content alone', () => {
    const html = '<link href="https://x.pl/wp-content/themes/t.css">';
    expect(detectPlatform(200, html)).toBe('wordpress');
  });

  it('detects wix from wixstatic', () => {
    const html = '<script src="https://static.wixstatic.com/x.js"></script>';
    expect(detectPlatform(200, html)).toBe('wix');
  });

  it('returns other for a non-200 status', () => {
    expect(detectPlatform(503, '<html>maintenance</html>')).toBe('other');
  });

  it('returns other for an unknown page', () => {
    expect(detectPlatform(200, '<html><body>hello</body></html>')).toBe('other');
  });
});

describe('detectPlatformFromCdn', () => {
  it('detects shopify from the cdn host', () => {
    expect(detectPlatformFromCdn('cdn.shopify.com')).toBe('shopify');
  });

  it('detects shoper from the cdn host', () => {
    expect(detectPlatformFromCdn('x.iai-shop.com')).toBe('shoper');
  });

  it('returns null for an unknown host', () => {
    expect(detectPlatformFromCdn('cdn.empik.com')).toBeNull();
  });
});
