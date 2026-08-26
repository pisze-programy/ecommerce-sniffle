import type { Logger } from '../logger.ts';

export type Via = 'proxy' | 'direct';

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
  options?: { maxBytes?: number }
) => Promise<FetchResult>;

export function requestBodyBytes(body: RequestInit['body'] | undefined): number {
  if (body === undefined || body === null) {
    return 0;
  }
  if (typeof body === 'string') {
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
  if (typeof result.responseBytes === 'number') {
    return result.responseBytes;
  }
  const contentLength = result.headers?.get('content-length') ?? null;
  if (contentLength !== null && /^\d+$/.test(contentLength)) {
    return Number(contentLength);
  }
  return 0;
}

export function measureFetch(fetchFn: WrappedFetch, logger: Logger, providerId: string, via: Via): WrappedFetch {
  return async (input, init, options) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const requestBytes = requestBodyBytes(init?.body);
    const start = Date.now();

    function emit(status: number | null, responseBytes: number, error: string | null): void {
      const elapsedMs = Date.now() - start;
      logger.info('proxy.request', {
        providerId,
        url,
        method,
        status,
        requestBytes,
        responseBytes,
        elapsedMs,
        via,
        ...(error === null ? {} : { error }),
      });
    }

    try {
      const result = await fetchFn(input, init, options);
      const wireBytes = responseBodyBytes(result);
      if (wireBytes > 0) {
        emit(result.status, wireBytes, null);
        return result;
      }
      // The response has no content-length (chunked). Count the body on consumption.
      const originalText = typeof result.text === 'function' ? result.text.bind(result) : null;
      const originalArrayBuffer = typeof result.arrayBuffer === 'function' ? result.arrayBuffer.bind(result) : null;
      const originalJson = typeof result.json === 'function' ? result.json.bind(result) : null;
      let bodyBytes = 0;
      const countedResult: FetchResult = {
        ...result,
        ok: result.ok,
        status: result.status,
        ...(result.headers === undefined ? {} : { headers: result.headers }),
        text:
          originalText === null
            ? async () => ''
            : async () => {
                const text = await originalText();
                bodyBytes = Buffer.byteLength(text);
                emit(result.status, bodyBytes, null);
                return text;
              },
        arrayBuffer:
          originalArrayBuffer === null
            ? async () => new ArrayBuffer(0)
            : async () => {
                const buffer = await originalArrayBuffer();
                bodyBytes = buffer.byteLength;
                emit(result.status, bodyBytes, null);
                return buffer;
              },
        json:
          originalJson === null
            ? async () => null
            : async () => {
                const data = await originalJson();
                bodyBytes = Buffer.byteLength(JSON.stringify(data));
                emit(result.status, bodyBytes, null);
                return data;
              },
        body:
          result.body === null || result.body === undefined
            ? null
            : {
                cancel: async () => {
                  await result.body?.cancel();
                  emit(result.status, bodyBytes, null);
                },
              },
      };
      return countedResult;
    } catch (error) {
      emit(null, 0, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}
