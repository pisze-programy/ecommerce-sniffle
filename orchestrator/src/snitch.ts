import type { Logger } from '@ecommerce-sniffle/providers';

export type SnitchStatus = 'ok' | 'failed';

export interface SnitchReport {
  readonly source: string;
  readonly status: SnitchStatus;
  readonly data: Readonly<Record<string, number | string | boolean | null>>;
  readonly message?: string;
  readonly notify: 'always' | 'on-error';
}

export async function sendReport(report: SnitchReport, logger: Logger): Promise<void> {
  const url = process.env['SNITCH_URL'] ?? '';
  const token = process.env['SNITCH_TOKEN'] ?? '';
  if (url.length === 0 || token.length === 0) {
    logger.warn('snitch not configured', { source: report.source });
    return;
  }
  try {
    const response = await fetch(`${url}/v1/report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: report.source,
        status: report.status,
        data: report.data,
        message: report.message,
        notify: report.notify,
      }),
    });
    if (!response.ok) {
      logger.warn('snitch report failed', { source: report.source, status: response.status });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('snitch report error', { source: report.source, error: message });
  }
}

export function taskReport(
  providerId: string,
  status: SnitchStatus,
  data: Readonly<Record<string, number | string | boolean | null>>,
  message?: string
): SnitchReport {
  if (message === undefined) {
    return {
      source: `ecommerce-pulse/vps/${providerId}`,
      status,
      data,
      notify: 'on-error',
    };
  }
  return {
    source: `ecommerce-pulse/vps/${providerId}`,
    status,
    data,
    message,
    notify: 'on-error',
  };
}

export function cronReport(
  window: string,
  status: SnitchStatus,
  data: Readonly<Record<string, number | string | boolean | null>>,
  message: string
): SnitchReport {
  return {
    source: 'ecommerce-pulse/vps/cron',
    status,
    data: { window, ...data },
    message,
    notify: 'always',
  };
}
