import { describe, expect, it } from 'vitest';
import { createUsageTracking } from '../../../orchestrator/src/usage.ts';
import { createLogger } from '@ecommerce-sniffle/providers';

describe('createUsageTracking', () => {
  it('aggregates the proxy.request records from the wrapped logger', () => {
    const tracking = createUsageTracking();
    const logger = tracking.wrapLogger(createLogger(() => {}));
    logger.info('proxy.request', { providerId: 'wkdzik', responseBytes: 500, requestBytes: 30 });
    logger.info('proxy.request', { providerId: 'wkdzik', responseBytes: 700, requestBytes: 40 });
    expect(tracking.stats.requests).toBe(2);
    expect(tracking.stats.requestBytes).toBe(70);
    expect(tracking.stats.responseBytes).toBe(1200);
  });

  it('ignores the records that are not proxy.request', () => {
    const tracking = createUsageTracking();
    const logger = tracking.wrapLogger(createLogger(() => {}));
    logger.info('other', { responseBytes: 999 });
    expect(tracking.stats.requests).toBe(0);
    expect(tracking.stats.responseBytes).toBe(0);
  });

  it('keeps the response bytes of the chunked bodies', () => {
    const tracking = createUsageTracking();
    const logger = tracking.wrapLogger(createLogger(() => {}));
    logger.info('proxy.request', { providerId: 'wkdzik', responseBytes: 390, requestBytes: 25 });
    expect(tracking.stats.responseBytes).toBe(390);
  });

  it('counts only the via=proxy records as proxy bytes', () => {
    const tracking = createUsageTracking();
    const logger = tracking.wrapLogger(createLogger(() => {}));
    logger.info('proxy.request', { providerId: 'wkdzik', via: 'proxy', responseBytes: 500, requestBytes: 30 });
    logger.info('proxy.request', { providerId: 'wkdzik', via: 'direct', responseBytes: 4000, requestBytes: 10 });
    // The direct catalog is counted in the total but not in proxy bytes.
    expect(tracking.stats.requestBytes).toBe(40);
    expect(tracking.stats.responseBytes).toBe(4500);
    expect(tracking.stats.proxyRequestBytes).toBe(30);
    expect(tracking.stats.proxyResponseBytes).toBe(500);
  });
});
