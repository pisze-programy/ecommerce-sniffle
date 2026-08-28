import { describe, expect, it } from 'vitest';
import {
  buildCandidateConfig,
  classifyProbe,
  estimateTotal,
  hostFromUrl,
  normalizeHost,
  parseCcLine,
  parseProductsPage,
  sumProxyBytes,
} from '../../../discovery/src/common.ts';
import type { LogRecord } from '../../../packages/providers/src/logger.ts';

describe('normalizeHost', () => {
  it('removes protocol and path', () => {
    expect(normalizeHost('https://Foo.myshopify.com/robots.txt')).toBe('foo.myshopify.com');
  });

  it('removes a trailing dot', () => {
    expect(normalizeHost('foo.myshopify.com.')).toBe('foo.myshopify.com');
  });

  it('keeps a bare host', () => {
    expect(normalizeHost('bar.myshopify.com')).toBe('bar.myshopify.com');
  });
});

describe('hostFromUrl', () => {
  it('extracts the host from a url', () => {
    expect(hostFromUrl('https://000de8-2.myshopify.com/robots.txt')).toBe('000de8-2.myshopify.com');
  });
});

describe('parseCcLine', () => {
  it('parses a valid line', () => {
    const line = '{"url": "https://a.myshopify.com/", "status": "200"}';
    expect(parseCcLine(line)).toEqual({ url: 'https://a.myshopify.com/', status: '200' });
  });

  it('returns null for an empty line', () => {
    expect(parseCcLine('')).toBeNull();
  });

  it('returns null for invalid json', () => {
    expect(parseCcLine('not json')).toBeNull();
  });

  it('returns null when url or status is missing', () => {
    expect(parseCcLine('{"url": "https://a.myshopify.com/"}')).toBeNull();
  });
});

describe('classifyProbe', () => {
  it('classifies a live shopify store', () => {
    const body = JSON.stringify({ products: [{ id: 1 }, { id: 2 }] });
    expect(classifyProbe(200, body)).toEqual({
      klass: 'shopify',
      pageCount: 2,
      password: false,
    });
  });

  it('classifies an empty catalog', () => {
    const body = JSON.stringify({ products: [] });
    expect(classifyProbe(200, body)).toEqual({ klass: 'empty', pageCount: 0, password: false });
  });

  it('classifies an html response as other', () => {
    expect(classifyProbe(200, '<html><body>Hello</body></html>')).toEqual({
      klass: 'other',
      pageCount: null,
      password: false,
    });
  });

  it('flags a password page', () => {
    expect(classifyProbe(404, '<html>Please enter password</html>')).toEqual({
      klass: 'other',
      pageCount: null,
      password: true,
    });
  });

  it('classifies a non-200 as other', () => {
    expect(classifyProbe(500, 'boom')).toEqual({ klass: 'other', pageCount: null, password: false });
  });
});

describe('parseProductsPage', () => {
  it('returns the count', () => {
    const body = JSON.stringify({ products: [1, 2, 3] });
    expect(parseProductsPage(body)).toBe(3);
  });

  it('returns null for invalid json', () => {
    expect(parseProductsPage('nope')).toBeNull();
  });
});

describe('estimateTotal', () => {
  it('stops at the first short page', async () => {
    const result = await estimateTotal(3, async () => 0, 20);
    expect(result).toEqual({ count: 3, capped: false });
  });

  it('sums full pages and stops at a short page', async () => {
    const result = await estimateTotal(250, async (page) => (page === 2 ? 100 : 0), 20);
    expect(result).toEqual({ count: 350, capped: false });
  });

  it('caps at the page limit', async () => {
    const result = await estimateTotal(250, async () => 250, 3);
    expect(result).toEqual({ count: 750, capped: true });
  });

  it('stops when a page fails to parse', async () => {
    const result = await estimateTotal(250, async () => null, 20);
    expect(result).toEqual({ count: 250, capped: false });
  });
});

describe('buildCandidateConfig', () => {
  it('builds a shopify mcp config for the host', () => {
    const config = buildCandidateConfig('a.myshopify.com');
    expect(config.domain).toBe('a.myshopify.com');
    expect(config.stockSource).toBe('mcp-inventory');
    expect(config.requiresProxy).toBe(true);
    expect(config.endpoint).toBe('https://a.myshopify.com/products.json');
  });
});

describe('sumProxyBytes', () => {
  function record(partial: Partial<LogRecord>): LogRecord {
    return {
      level: 'info',
      message: 'proxy.request',
      context: {},
      timestamp: '2026-08-27T00:00:00.000Z',
      ...partial,
    };
  }

  it('sums the proxy request bytes', () => {
    const records = [
      record({ context: { via: 'proxy', requestBytes: 100, responseBytes: 200 } }),
      record({ context: { via: 'proxy', requestBytes: 50, responseBytes: 50 } }),
    ];
    expect(sumProxyBytes(records)).toBe(400);
  });

  it('ignores direct requests', () => {
    const records = [record({ context: { via: 'direct', requestBytes: 1000, responseBytes: 1000 } })];
    expect(sumProxyBytes(records)).toBe(0);
  });

  it('ignores other log records', () => {
    const records = [record({ message: 'pipeline.finished', context: { via: 'proxy' } })];
    expect(sumProxyBytes(records)).toBe(0);
  });

  it('handles missing byte fields', () => {
    const records = [record({ context: { via: 'proxy' } })];
    expect(sumProxyBytes(records)).toBe(0);
  });
});
