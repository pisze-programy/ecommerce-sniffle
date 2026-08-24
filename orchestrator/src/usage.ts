import { DIRECT_FETCH_TIMEOUT_MS } from "./direct-fetch.ts";

const REQUEST_HEADER_BYTES = 512;

export interface UsageStats {
  requests: number;
  requestBytes: number;
  responseBytes: number;
}

export interface UsageTracking {
  readonly fetchImpl: typeof fetch;
  readonly stats: UsageStats;
}

function requestBodyBytes(init: RequestInit | undefined): number {
  const body = init?.body;
  if (body === undefined) {
    return 0;
  }
  if (typeof body === "string") {
    return body.length;
  }
  if (body instanceof URLSearchParams) {
    return body.toString().length;
  }
  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }
  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }
  return 0;
}

function inputUrlBytes(input: Parameters<typeof fetch>[0]): number {
  if (typeof input === "string") {
    return input.length;
  }
  if (input instanceof URL) {
    return input.toString().length;
  }
  return input.url.length;
}

export function createUsageTracking(
  baseFetch: typeof fetch,
  timeoutMs: number = DIRECT_FETCH_TIMEOUT_MS,
): UsageTracking {
  const stats: UsageStats = { requests: 0, requestBytes: 0, responseBytes: 0 };
  const fetchImpl: typeof fetch = async (input, init) => {
    stats.requests += 1;
    stats.requestBytes += inputUrlBytes(input) + requestBodyBytes(init) + REQUEST_HEADER_BYTES;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let response: Response;
    try {
      response = await baseFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const responseHeaders = response.headers;
    if (responseHeaders !== undefined && responseHeaders !== null) {
      const contentLength = responseHeaders.get("content-length");
      if (contentLength !== null) {
        const length = Number(contentLength);
        if (!Number.isNaN(length)) {
          stats.responseBytes += length;
        }
      }
    }
    return response;
  };
  return { fetchImpl, stats };
}
