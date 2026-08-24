import { truncateMessage } from "@ecommerce-sniffle/providers";
import type { Logger } from "@ecommerce-sniffle/providers";

export interface Task {
  readonly taskId: string;
  readonly providerId: string;
  readonly domain: string;
  readonly mode: string;
  readonly window: string;
  readonly status: string;
  readonly attempts: number;
  readonly leaseUntil: number | null;
  readonly workerId: string | null;
  readonly maskedCount: number | null;
  readonly error: string | null;
  readonly createdAt: number;
  readonly finishedAt: number | null;
  readonly durationSeconds: number;
}

export interface QueueClient {
  claim(modes: readonly string[], workerId: string): Promise<Task | null>;
  complete(taskId: string, maskedCount: number): Promise<boolean>;
  fail(taskId: string, error: string): Promise<boolean>;
}

function parseTask(raw: unknown): Task | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Readonly<Record<string, unknown>>;
  const taskId = obj["taskId"];
  const providerId = obj["providerId"];
  const domain = obj["domain"];
  const mode = obj["mode"];
  const window = obj["window"];
  const status = obj["status"];
  const attempts = obj["attempts"];
  const createdAt = obj["createdAt"];
  const durationSeconds = obj["durationSeconds"];
  if (
    typeof taskId !== "string" ||
    typeof providerId !== "string" ||
    typeof domain !== "string" ||
    typeof mode !== "string" ||
    typeof window !== "string" ||
    typeof status !== "string" ||
    typeof attempts !== "number" ||
    typeof createdAt !== "number" ||
    typeof durationSeconds !== "number"
  ) {
    return null;
  }
  return {
    taskId,
    providerId,
    domain,
    mode,
    window,
    status,
    attempts,
    leaseUntil: typeof obj["leaseUntil"] === "number" ? obj["leaseUntil"] : null,
    workerId: typeof obj["workerId"] === "string" ? obj["workerId"] : null,
    maskedCount: typeof obj["maskedCount"] === "number" ? obj["maskedCount"] : null,
    error: typeof obj["error"] === "string" ? obj["error"] : null,
    createdAt,
    finishedAt: typeof obj["finishedAt"] === "number" ? obj["finishedAt"] : null,
    durationSeconds,
  };
}

export function createQueueClient(baseUrl: string, secret: string, logger: Logger): QueueClient {
  async function post(
    path: string,
    body: unknown,
    headers: Readonly<Record<string, string>> = {},
  ): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          ...headers,
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return true;
      }
      const text = await response.text();
      logger.warn("queue.post rejected", { path, status: response.status, error: truncateMessage(text) });
      return false;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("queue.post failed", { path, error: message });
      return false;
    }
  }

  return {
    async claim(modes, workerId) {
      try {
        const response = await fetch(`${baseUrl}/queue/claim?modes=${modes.join(",")}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "X-Worker-Id": workerId,
          },
        });
        if (!response.ok) {
          const text = await response.text();
          logger.warn("queue.claim rejected", { status: response.status, error: truncateMessage(text) });
          return null;
        }
        const data = (await response.json()) as { task: unknown };
        return parseTask(data.task);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("queue.claim failed", { error: message });
        return null;
      }
    },

    complete(taskId, maskedCount) {
      return post("/queue/complete", { taskId, maskedCount });
    },

    fail(taskId, error) {
      return post("/queue/fail", { taskId, error });
    },
  };
}
