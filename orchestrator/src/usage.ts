import { createLogger } from '@ecommerce-sniffle/providers';
import type { Logger, LogRecord } from '@ecommerce-sniffle/providers';

export interface UsageStats {
  requests: number;
  requestBytes: number;
  responseBytes: number;
}

export interface UsageTracking {
  readonly wrapLogger: (logger: Logger) => Logger;
  readonly stats: UsageStats;
}

function numberContext(record: LogRecord, key: string): number {
  const value = record.context[key];
  return typeof value === 'number' ? value : 0;
}

function forward(record: LogRecord, logger: Logger): void {
  switch (record.level) {
    case 'debug':
      logger.debug(record.message, record.context);
      return;
    case 'info':
      logger.info(record.message, record.context);
      return;
    case 'warn':
      logger.warn(record.message, record.context);
      return;
    case 'error':
      logger.error(record.message, record.context);
      return;
  }
}

export function createUsageTracking(): UsageTracking {
  const stats: UsageStats = { requests: 0, requestBytes: 0, responseBytes: 0 };

  function wrapLogger(logger: Logger): Logger {
    const sink = (record: LogRecord): void => {
      if (record.message === 'proxy.request') {
        stats.requests += 1;
        stats.requestBytes += numberContext(record, 'requestBytes');
        stats.responseBytes += numberContext(record, 'responseBytes');
      }
      forward(record, logger);
    };
    return createLogger(sink);
  }

  return { wrapLogger, stats };
}
