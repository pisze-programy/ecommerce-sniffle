import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { LogRecord, Logger } from '@ecommerce-sniffle/providers';
import { cronReport, sendReport, taskReport } from '../../../orchestrator/src/snitch.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function captureLogger(): { records: LogRecord[]; logger: Logger } {
  const records: LogRecord[] = [];
  return {
    records,
    logger: createLogger((record) => {
      records.push(record);
    }),
  };
}

describe('sendReport', () => {
  it('sends a report with the token, source and notify', async () => {
    const capture = captureLogger();
    vi.stubEnv('SNITCH_URL', 'https://cf-snitch.dev-4cb.workers.dev');
    vi.stubEnv('SNITCH_TOKEN', 'token-123');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await sendReport(
      {
        source: 'ecommerce-pulse/vps/godsavequeens',
        status: 'failed',
        data: { webshareBytes: 100 },
        notify: 'on-error',
      },
      capture.logger
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cf-snitch.dev-4cb.workers.dev/v1/report');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token-123');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['source']).toBe('ecommerce-pulse/vps/godsavequeens');
    expect(body['status']).toBe('failed');
    expect(body['notify']).toBe('on-error');
    expect(body['data']).toEqual({ webshareBytes: 100 });
  });

  it('warns when the snitch is not configured', async () => {
    const capture = captureLogger();
    vi.stubEnv('SNITCH_URL', '');
    vi.stubEnv('SNITCH_TOKEN', '');
    await sendReport(
      { source: 'ecommerce-pulse/vps/lexon', status: 'ok', data: {}, notify: 'on-error' },
      capture.logger
    );
    expect(capture.records.some((record) => record.message === 'snitch not configured')).toBe(true);
  });

  it('warns when the report is rejected', async () => {
    const capture = captureLogger();
    vi.stubEnv('SNITCH_URL', 'https://cf-snitch.example');
    vi.stubEnv('SNITCH_TOKEN', 'token-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await sendReport(
      { source: 'ecommerce-pulse/vps/forcer', status: 'ok', data: {}, notify: 'on-error' },
      capture.logger
    );
    expect(capture.records.some((record) => record.message === 'snitch report failed')).toBe(true);
  });
});

describe('taskReport', () => {
  it('builds an on-error report without a message', () => {
    const report = taskReport('wkdzik', 'ok', { elapsedMs: 100 });
    expect(report.source).toBe('ecommerce-pulse/vps/wkdzik');
    expect(report.status).toBe('ok');
    expect(report.notify).toBe('on-error');
    expect(report.message).toBeUndefined();
  });

  it('builds an on-error report with a message', () => {
    const report = taskReport('montiel', 'failed', { elapsedMs: 10 }, '401');
    expect(report.message).toBe('401');
  });
});

describe('cronReport', () => {
  it('builds an always report with the window', () => {
    const report = cronReport('morning', 'failed', { done: 10, pending: 1 }, 'PENDING: theodderside');
    expect(report.source).toBe('ecommerce-pulse/vps');
    expect(report.notify).toBe('always');
    expect(report.data).toEqual({ window: 'morning', done: 10, pending: 1 });
    expect(report.message).toBe('PENDING: theodderside');
  });
});
