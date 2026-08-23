import type { Logger } from "../logger.ts";

const CREATE_URL = "https://api.2captcha.com/createTask";
const RESULT_URL = "https://api.2captcha.com/getTaskResult";
const BALANCE_URL = "https://api.2captcha.com/getBalance";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

export interface TurnstileTask {
  readonly websiteURL: string;
  readonly websiteKey: string;
  readonly action: string | null;
  readonly data: string | null;
  readonly pagedata: string | null;
}

export interface CaptchaSolution {
  readonly token: string;
  readonly userAgent: string;
}

export interface CaptchaClient {
  readonly enabled: boolean;
  solveTurnstile(task: TurnstileTask, logger: Logger): Promise<CaptchaSolution | null>;
  getBalance(logger: Logger): Promise<number | null>;
}

export interface CaptchaClientOptions {
  readonly pollIntervalMs?: number;
  readonly pollTimeoutMs?: number;
}

function apiKey(): string | null {
  if (typeof process === "undefined") {
    return null;
  }
  const value = process.env["CAPTCHA_KEY"];
  if (value === undefined || value.length === 0) {
    return null;
  }
  return value;
}

function buildTask(task: TurnstileTask): Readonly<Record<string, string>> {
  const payload: Record<string, string> = {
    type: "TurnstileTaskProxyless",
    websiteURL: task.websiteURL,
    websiteKey: task.websiteKey,
  };
  if (task.action !== null) {
    payload["action"] = task.action;
  }
  if (task.data !== null) {
    payload["data"] = task.data;
  }
  if (task.pagedata !== null) {
    payload["pagedata"] = task.pagedata;
  }
  return payload;
}

function errorOf(data: Readonly<Record<string, unknown>>, fallback: string): string {
  const description = data["errorDescription"];
  if (typeof description === "string") {
    return description;
  }
  return fallback;
}

async function createTask(
  key: string,
  task: TurnstileTask,
  logger: Logger,
): Promise<number | null> {
  try {
    const response = await fetch(CREATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: key, task: buildTask(task) }),
    });
    const data = (await response.json()) as Readonly<Record<string, unknown>>;
    if (data["errorId"] === 0 && typeof data["taskId"] === "number") {
      logger.debug("captcha.task created", { taskId: data["taskId"] });
      return data["taskId"];
    }
    logger.warn("captcha.createTask failed", { error: errorOf(data, String(data["errorId"])) });
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("captcha.createTask error", { error: message });
    return null;
  }
}

async function pollResult(
  key: string,
  taskId: number,
  logger: Logger,
  pollIntervalMs: number,
  pollTimeoutMs: number,
): Promise<CaptchaSolution | null> {
  const started = Date.now();
  while (true) {
    if (Date.now() - started > pollTimeoutMs) {
      logger.warn("captcha.poll timeout", { taskId });
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    try {
      const response = await fetch(RESULT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: key, taskId }),
      });
      const data = (await response.json()) as Readonly<Record<string, unknown>>;
      if (data["status"] === "ready") {
        const solution = data["solution"];
        if (typeof solution === "object" && solution !== null) {
          const solutionObj = solution as Readonly<Record<string, unknown>>;
          const token = typeof solutionObj["token"] === "string" ? solutionObj["token"] : null;
          const userAgent =
            typeof solutionObj["userAgent"] === "string" ? solutionObj["userAgent"] : null;
          if (token !== null && userAgent !== null) {
            return { token, userAgent };
          }
        }
        logger.warn("captcha.solution missing token", { taskId });
        return null;
      }
      if (data["status"] !== "processing") {
        logger.warn("captcha.poll failed", { taskId, error: errorOf(data, "unknown status") });
        return null;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("captcha.poll error", { taskId, error: message });
      return null;
    }
  }
}

export function createCaptchaClient(options: CaptchaClientOptions = {}): CaptchaClient {
  const key = apiKey();
  const pollIntervalMs =
    options.pollIntervalMs === undefined ? POLL_INTERVAL_MS : options.pollIntervalMs;
  const pollTimeoutMs =
    options.pollTimeoutMs === undefined ? POLL_TIMEOUT_MS : options.pollTimeoutMs;
  return {
    enabled: key !== null,
    async solveTurnstile(task: TurnstileTask, logger: Logger): Promise<CaptchaSolution | null> {
      if (key === null) {
        logger.warn("captcha disabled: CAPTCHA_KEY not set");
        return null;
      }
      const taskId = await createTask(key, task, logger);
      if (taskId === null) {
        return null;
      }
      return pollResult(key, taskId, logger, pollIntervalMs, pollTimeoutMs);
    },
    async getBalance(logger: Logger): Promise<number | null> {
      if (key === null) {
        return null;
      }
      try {
        const response = await fetch(BALANCE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientKey: key }),
        });
        const data = (await response.json()) as Readonly<Record<string, unknown>>;
        if (data["errorId"] === 0 && typeof data["balance"] === "number") {
          return data["balance"];
        }
        logger.warn("captcha.getBalance failed", { error: errorOf(data, String(data["errorId"])) });
        return null;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("captcha.getBalance error", { error: message });
        return null;
      }
    },
  };
}
