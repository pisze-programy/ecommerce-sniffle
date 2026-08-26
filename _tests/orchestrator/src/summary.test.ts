import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@ecommerce-sniffle/providers';
import type { LogRecord, Logger } from '@ecommerce-sniffle/providers';
import { runCronSummary } from '../../../orchestrator/src/summary.ts';

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

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('runCronSummary', () => {
  it('sends an ok summary when all providers are done', async () => {
    const capture = captureLogger();
    vi.stubEnv('BACKEND_URL', 'https://backend.example');
    vi.stubEnv('INGEST_SECRET', 'secret');
    vi.stubEnv('SNITCH_URL', 'https://cf-snitch.example');
    vi.stubEnv('SNITCH_TOKEN', 'token');
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(String(url));
        if (String(url).includes('/summary/')) {
          return jsonResponse(200, {
            window: 'morning',
            day: '2026-08-25',
            done: ['forcer', 'nago'],
            failed: [],
            pending: [],
            transferBytes: 500000,
            perProvider: [
              { providerId: 'forcer', bytes: 300000 },
              { providerId: 'nago', bytes: 200000 },
            ],
          });
        }
        if (String(url).includes('/v1/report')) {
          const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
          expect(body['source']).toBe('ecommerce-pulse/vps/cron');
          expect(body['status']).toBe('ok');
          expect(body['notify']).toBe('always');
          return jsonResponse(200, {});
        }
        return jsonResponse(404, {});
      })
    );
    await runCronSummary('morning', capture.logger);
    expect(calls.some((url) => url.includes('/summary/morning/'))).toBe(true);
    expect(calls.some((url) => url.includes('/v1/report'))).toBe(true);
  });

  it('sends a failed summary with the pending list and the warn over 1MB', async () => {
    const capture = captureLogger();
    vi.stubEnv('BACKEND_URL', 'https://backend.example');
    vi.stubEnv('INGEST_SECRET', 'secret');
    vi.stubEnv('SNITCH_URL', 'https://cf-snitch.example');
    vi.stubEnv('SNITCH_TOKEN', 'token');
    let reportBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/summary/')) {
          return jsonResponse(200, {
            window: 'morning',
            day: '2026-08-25',
            done: ['forcer'],
            failed: [{ providerId: 'montiel', error: '401' }],
            pending: ['theodderside'],
            transferBytes: 1900000,
            perProvider: [
              { providerId: 'forcer', bytes: 100000 },
              { providerId: 'sklepskolim', bytes: 1900000 },
            ],
          });
        }
        if (String(url).includes('/v1/report')) {
          reportBody = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
          return jsonResponse(200, {});
        }
        return jsonResponse(404, {});
      })
    );
    await runCronSummary('morning', capture.logger);
    expect(reportBody).not.toBeNull();
    expect(reportBody?.['status']).toBe('failed');
    const message = String(reportBody?.['message'] ?? '');
    expect(message).toContain('FAILED montiel: 401');
    expect(message).toContain('PENDING: theodderside');
    expect(message).toContain('WARN sklepskolim: 1.9MB > 1MB');
  });

  it('warns when the summary query fails', async () => {
    const capture = captureLogger();
    vi.stubEnv('BACKEND_URL', 'https://backend.example');
    vi.stubEnv('INGEST_SECRET', 'secret');
    vi.stubEnv('SNITCH_URL', 'https://cf-snitch.example');
    vi.stubEnv('SNITCH_TOKEN', 'token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    await runCronSummary('evening', capture.logger);
    expect(capture.records.some((record) => record.message === 'summary query failed')).toBe(true);
  });
});
