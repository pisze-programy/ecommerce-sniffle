import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../../packages/providers/src/logger.ts';
import type { LogRecord, Logger } from '../../../../../packages/providers/src/logger.ts';
import { createCaptchaClient } from '../../../../../packages/providers/src/captcha/client.ts';
import type { TurnstileTask } from '../../../../../packages/providers/src/captcha/client.ts';

interface Capture {
  readonly records: LogRecord[];
  readonly logger: Logger;
}

function capturingLogger(): Capture {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

const TASK: TurnstileTask = {
  websiteURL: 'https://booso.pl/cart/add.js',
  websiteKey: '0x4AAAAAAA_sitekey',
  action: 'managed',
  data: 'cdata-1',
  pagedata: 'pagedata-1',
};

describe('createCaptchaClient', () => {
  beforeEach(() => {
    vi.stubEnv('CAPTCHA_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is enabled when the key is set', () => {
    expect(createCaptchaClient().enabled).toBe(true);
  });

  it('is disabled and logs when the key is missing', async () => {
    vi.stubEnv('CAPTCHA_KEY', '');
    const capture = capturingLogger();
    const client = createCaptchaClient({ pollIntervalMs: 50, pollTimeoutMs: 200 });
    expect(client.enabled).toBe(false);
    const solution = await client.solveTurnstile(TASK, capture.logger);
    expect(solution).toBeNull();
    expect(capture.records[0]?.level).toBe('warn');
    expect(capture.records[0]?.message).toBe('captcha disabled: CAPTCHA_KEY not set');
  });

  it('solves a turnstile task end to end', async () => {
    const capture = capturingLogger();
    let resultCalls = 0;
    const fetchMock = vi.fn(async (url: unknown) => {
      if (url === 'https://api.2captcha.com/createTask') {
        return jsonResponse({ errorId: 0, taskId: 123 });
      }
      resultCalls += 1;
      if (resultCalls === 1) {
        return jsonResponse({ errorId: 0, status: 'processing' });
      }
      return jsonResponse({
        errorId: 0,
        status: 'ready',
        solution: { token: '0.token', userAgent: 'Chrome/126' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = createCaptchaClient({ pollIntervalMs: 30, pollTimeoutMs: 1000 });
    const solution = await client.solveTurnstile(TASK, capture.logger);
    expect(solution?.token).toBe('0.token');
    expect(solution?.userAgent).toBe('Chrome/126');
    expect(resultCalls).toBeGreaterThanOrEqual(2);
  });

  it('sends the optional task params in the createTask body', async () => {
    const capture = capturingLogger();
    let createBody = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init: RequestInit | undefined) => {
        if (url === 'https://api.2captcha.com/createTask') {
          createBody = String(init?.body);
          return jsonResponse({ errorId: 0, taskId: 1 });
        }
        return jsonResponse({ errorId: 0, status: 'ready', solution: { token: 't', userAgent: 'ua' } });
      })
    );
    const client = createCaptchaClient({ pollIntervalMs: 30, pollTimeoutMs: 1000 });
    await client.solveTurnstile(TASK, capture.logger);
    expect(createBody).toContain('"action":"managed"');
    expect(createBody).toContain('"data":"cdata-1"');
    expect(createBody).toContain('"pagedata":"pagedata-1"');
    expect(createBody).toContain('"websiteKey":"0x4AAAAAAA_sitekey"');
  });

  it('logs and returns null when createTask fails', async () => {
    const capture = capturingLogger();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ errorId: 15, errorDescription: 'bad key' })));
    const client = createCaptchaClient({ pollIntervalMs: 30, pollTimeoutMs: 500 });
    const solution = await client.solveTurnstile(TASK, capture.logger);
    expect(solution).toBeNull();
    expect(capture.records.some((record) => record.message === 'captcha.createTask failed')).toBe(true);
  });

  it('returns null when the poll times out', async () => {
    const capture = capturingLogger();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (url === 'https://api.2captcha.com/createTask') {
          return jsonResponse({ errorId: 0, taskId: 999 });
        }
        return jsonResponse({ errorId: 0, status: 'processing' });
      })
    );
    const client = createCaptchaClient({ pollIntervalMs: 30, pollTimeoutMs: 150 });
    const solution = await client.solveTurnstile(TASK, capture.logger);
    expect(solution).toBeNull();
    expect(capture.records.some((record) => record.message === 'captcha.poll timeout')).toBe(true);
  });

  it('reads the balance', async () => {
    const capture = capturingLogger();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ errorId: 0, balance: 2.99 })));
    const client = createCaptchaClient();
    const balance = await client.getBalance(capture.logger);
    expect(balance).toBe(2.99);
  });

  it('logs when the balance call fails', async () => {
    const capture = capturingLogger();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ errorId: 10, errorDescription: 'no access' })));
    const client = createCaptchaClient();
    const balance = await client.getBalance(capture.logger);
    expect(balance).toBeNull();
    expect(capture.records.some((record) => record.message === 'captcha.getBalance failed')).toBe(true);
  });
});
