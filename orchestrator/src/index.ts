import { buildLogger } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import { runExecutorPass } from './executor.ts';
import { acquireLock, checkMemory, releaseLock, MIN_AVAILABLE_MB } from './guard.ts';
export { createDirectFetch } from './direct-fetch.ts';

export async function main(): Promise<void> {
  const logger: Logger = buildLogger();
  if (!acquireLock(logger)) {
    logger.info('orchestrator skip: another run is active');
    return;
  }
  try {
    if (!checkMemory(logger, MIN_AVAILABLE_MB)) {
      logger.error('orchestrator exit: memory too low, skip run');
      process.exitCode = 1;
      return;
    }
    logger.info('executor start');
    const result = await runExecutorPass(logger);
    logger.info('executor finish', {
      processed: result.processed,
      failed: result.failed,
    });
  } finally {
    releaseLock(logger);
  }
}

if (import.meta.main) {
  void main();
}
