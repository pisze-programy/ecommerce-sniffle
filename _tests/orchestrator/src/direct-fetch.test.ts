import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createDirectFetch, toHeaderRecord, toUrl } from '../../../orchestrator/src/direct-fetch.ts';
import { BROWSER_HEADERS } from '@ecommerce-sniffle/providers';

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe('createDirectFetch', () => {
  it('sends the browser headers by default', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ua: req.headers['user-agent'] ?? '', sec: req.headers['sec-ch-ua'] ?? '' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server has no port');
    }
    const directFetch = createDirectFetch(1000);
    const response = await directFetch(`http://127.0.0.1:${address.port}/`);
    const body = (await response.json()) as { ua: string; sec: string };
    expect(body.ua.length).toBeGreaterThan(10);
    expect(body.sec).toBe(BROWSER_HEADERS['sec-ch-ua']);
  });

  it('lets the provider header win over the browser header', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ accept: req.headers['accept'] ?? '' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server has no port');
    }
    const directFetch = createDirectFetch(1000);
    const response = await directFetch(`http://127.0.0.1:${address.port}/`, {
      headers: { Accept: 'application/json' },
    });
    const body = (await response.json()) as { accept: string };
    expect(body.accept).toBe('application/json');
  });

  it('aborts the body after the max-bytes limit', async () => {
    const server = createServer((_req, res) => {
      res.end('01234567890123456789');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server has no port');
    }
    const directFetch = createDirectFetch(1000);
    const response = await directFetch(`http://127.0.0.1:${address.port}/`, undefined, { maxBytes: 5 });
    const text = await response.text();
    expect(text.length).toBe(5);
    expect(text).toBe('01234');
  });

  it('sends the post body', async () => {
    const server = createServer((req, res) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ body: data, method: req.method }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server has no port');
    }
    const directFetch = createDirectFetch(1000);
    const response = await directFetch(`http://127.0.0.1:${address.port}/`, {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    });
    const body = (await response.json()) as { body: string; method: string };
    expect(body.method).toBe('POST');
    expect(body.body).toContain('hello');
  });

  it('rejects a request that never responds within the timeout', async () => {
    const server = createServer((_req, _res) => {
      // never answer; simulate a hung connection
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('server has no port');
    }
    const directFetch = createDirectFetch(60);
    const started = Date.now();
    await expect(directFetch(`http://127.0.0.1:${address.port}/`)).rejects.toThrow('timeout');
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('toUrl', () => {
  it('accepts a string url', () => {
    expect(toUrl('https://wkdzik.pl/products.json').toString()).toBe('https://wkdzik.pl/products.json');
  });

  it('accepts a URL instance', () => {
    const url = new URL('https://wkdzik.pl/list');
    expect(toUrl(url)).toBe(url);
  });

  it('accepts a Request and uses its url', () => {
    const request = new Request('https://wkdzik.pl/products.json');
    expect(toUrl(request).toString()).toBe('https://wkdzik.pl/products.json');
  });
});

describe('toHeaderRecord', () => {
  it('converts a Headers object', () => {
    const headers = new Headers({ 'User-Agent': 'test', Accept: 'application/json' });
    expect(toHeaderRecord(headers)).toEqual({ 'user-agent': 'test', accept: 'application/json' });
  });

  it('converts a plain record', () => {
    expect(toHeaderRecord({ Accept: 'application/json' })).toEqual({ Accept: 'application/json' });
  });

  it('returns an empty record for undefined', () => {
    expect(toHeaderRecord(undefined)).toEqual({});
  });
});
