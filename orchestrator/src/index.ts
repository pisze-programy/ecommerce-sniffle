import { buildLogger } from "@ecommerce-sniffle/providers";
import type { Logger } from "@ecommerce-sniffle/providers";
import { runVpsPass } from "./runner.ts";
import { acquireLock, checkMemory, releaseLock, MIN_AVAILABLE_MB } from "./guard.ts";

export async function main(): Promise<void> {
  const logger: Logger = buildLogger();
  if (!acquireLock(logger)) {
    logger.info("orchestrator skip: another run is active");
    return;
  }
  try {
    if (!checkMemory(logger, MIN_AVAILABLE_MB)) {
      logger.error("orchestrator exit: memory too low, skip run");
      process.exitCode = 1;
      return;
    }
    logger.info("orchestrator start");
    const result = await runVpsPass(logger);
    logger.info("orchestrator finish", {
      providers: result.processed,
      failed: result.failed.length,
      ingested: result.ingested,
    });
  } finally {
    releaseLock(logger);
  }
}

if (import.meta.main) {
  void main();
}
