import type { Logger } from "../logger.ts";

export type Via = "proxy" | "direct";

export interface NetworkStats {
  readonly providerId: string;
  readonly url: string;
  readonly method: string;
  readonly status: number | null;
  readonly requestBytes: number;
  readonly responseBytes: number;
  readonly elapsedMs: number;
  readonly via: Via;
}

export interface FetchResult {
  readonly ok: boolean;
  readonly status: number;
  readonly responseBytes?: number;
  readonly headers?: { get(name: string): string | null };
  readonly body?: { cancel(): Promise<void> } | null;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
}

export type WrappedFetch = (
  input: string | URL | Request,
  init?: RequestInit,
  options?: { maxBytes?: number },
) => Promise<FetchResult>;

export function requestBodyBytes(body: RequestInit["body"] | undefined): number {
  if (body === undefined || body === null) {
    return 0;
  }
  if (typeof body === "string") {
    return Buffer.byteLength(body);
  }
  if (body instanceof URLSearchParams) {
    return Buffer.byteLength(body.toString());
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  return 0;
}

export function responseBodyBytes(result: FetchResult): number {
  if (typeof result.responseBytes === "number") {
    return result.responseBytes;
  }
  const contentLength = result.headers?.get("content-length") ?? null;
  if (contentLength !== null && /^\d+$/.test(contentLength)) {
    return Number(contentLength);
  }
  return 0;
}

export function measureFetch(
  fetchFn: WrappedFetch,
  logger: Logger,
  providerId: string,
  via: Via,
): WrappedFetch {
  return async (input, init, options) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const requestBytes = requestBodyBytes(init?.body);
    const start = Date.now();
    try {
      const result = await fetchFn(input, init, options);
      const elapsedMs = Date.now() - start;
      logger.info("proxy.request", {
        providerId,
        url,
        method,
        status: result.status,
        requestBytes,
        responseBytes: responseBodyBytes(result),
        elapsedMs,
        via,
      });
      return result;
    } catch (error) {
      const elapsedMs = Date.now() - start;
      logger.info("proxy.request", {
        providerId,
        url,
        method,
        status: null,
        requestBytes,
        responseBytes: 0,
        elapsedMs,
        via,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
