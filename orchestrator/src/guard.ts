import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { freemem } from "node:os";
import type { Logger } from "@ecommerce-sniffle/providers";

export const MIN_AVAILABLE_MB = 60;
export const LOCK_PATH = "/tmp/ecommerce-sniffle-orchestrator.lock";

export function readAvailableMemory(logger: Logger): number {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    const match = /MemAvailable:\s+(\d+) kB/.exec(meminfo);
    if (match !== null) {
      return Number(match[1]) * 1024;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug("meminfo read failed, fall back to os.freemem", { error: message });
  }
  return freemem();
}

export function enoughMemory(availableBytes: number, minimumMb: number): boolean {
  return availableBytes >= minimumMb * 1024 * 1024;
}

export function checkMemory(logger: Logger, minimumMb: number = MIN_AVAILABLE_MB): boolean {
  const availableBytes = readAvailableMemory(logger);
  const ok = enoughMemory(availableBytes, minimumMb);
  if (!ok) {
    logger.error("available memory too low", { availableBytes, minimumMb });
  } else {
    logger.debug("memory ok", { availableBytes });
  }
  return ok;
}

export function readProcessRss(logger: Logger): number {
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    const match = /VmRSS:\s+(\d+) kB/.exec(status);
    if (match !== null) {
      return Number(match[1]) * 1024;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug("process rss read failed", { error: message });
  }
  return 0;
}

function staleLock(lockPath: string, logger: Logger): boolean {
  let pid = Number.NaN;
  try {
    pid = Number.parseInt(readFileSync(lockPath, "utf8").trim(), 10);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("lock read failed, treat as stale", { lockPath, error: message });
    return true;
  }
  if (Number.isNaN(pid)) {
    logger.warn("lock has no pid, treat as stale", { lockPath });
    return true;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug("lock owner is not alive, lock is stale", { lockPath, pid, error: message });
    return true;
  }
}

export function acquireLock(logger: Logger, lockPath: string = LOCK_PATH): boolean {
  try {
    const fd = openSync(lockPath, "wx");
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    logger.debug("lock acquired", { lockPath });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("lock open failed", { lockPath, error: message });
    if (staleLock(lockPath, logger)) {
      try {
        unlinkSync(lockPath);
        logger.debug("stale lock removed", { lockPath });
        try {
          const fd = openSync(lockPath, "wx");
          writeFileSync(fd, String(process.pid));
          closeSync(fd);
          logger.debug("lock acquired", { lockPath });
          return true;
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          logger.warn("lock is held by another run", { lockPath, error: retryMessage });
          return false;
        }
      } catch (unlinkError) {
        const unlinkMessage = unlinkError instanceof Error ? unlinkError.message : String(unlinkError);
        logger.warn("stale lock unlink failed", { lockPath, error: unlinkMessage });
        return false;
      }
    }
    logger.warn("lock is held by another run", { lockPath, error: message });
    return false;
  }
}

export function releaseLock(logger: Logger, lockPath: string = LOCK_PATH): void {
  try {
    unlinkSync(lockPath);
    logger.debug("lock released", { lockPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug("lock release failed", { lockPath, error: message });
  }
}
