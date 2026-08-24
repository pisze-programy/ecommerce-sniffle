import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import type { ClientRequest } from "node:http";
import type { DirectFetch, DirectFetchResponse, DirectFetchOptions } from "@ecommerce-sniffle/providers";
import { BROWSER_HEADERS } from "@ecommerce-sniffle/providers";

const HTTP_AGENT = new HttpAgent({ keepAlive: true });
const HTTPS_AGENT = new HttpsAgent({ keepAlive: true });

export function toUrl(input: string | URL | Request): URL {
  if (input instanceof URL) {
    return input;
  }
  if (typeof input === "string") {
    return new URL(input);
  }
  return new URL(input.url);
}

export function toHeaderRecord(headers: RequestInit["headers"] | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  if (headers === undefined) {
    return record;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    for (const pair of headers) {
      record[pair[0]] = pair[1];
    }
    return record;
  }
  for (const key of Object.keys(headers)) {
    record[key] = headers[key] ?? "";
  }
  return record;
}

export const DIRECT_FETCH_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 5;

function decompress(body: Buffer, encoding: string | undefined): Buffer {
  if (encoding === "gzip") {
    try {
      return gunzipSync(body);
    } catch {
      return body;
    }
  }
  if (encoding === "deflate") {
    try {
      return inflateSync(body);
    } catch {
      return body;
    }
  }
  if (encoding === "br") {
    try {
      return brotliDecompressSync(body);
    } catch {
      return body;
    }
  }
  return body;
}

export function createDirectFetch(timeoutMs: number = DIRECT_FETCH_TIMEOUT_MS): DirectFetch {
  function fetchOnce(
    url: URL,
    method: string,
    headers: Record<string, string>,
    redirectsLeft: number,
    maxBytes: number | null,
    resolve: (value: DirectFetchResponse) => void,
    reject: (reason?: unknown) => void,
  ): void {
    const requestFn = url.protocol === "http:" ? httpRequest : httpsRequest;
    const agent = url.protocol === "http:" ? HTTP_AGENT : HTTPS_AGENT;
    const req: ClientRequest = requestFn(
      url,
      { method, headers, agent },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location !== undefined && redirectsLeft > 0) {
          res.resume();
          const next = new URL(location, url);
          fetchOnce(next, method, headers, redirectsLeft - 1, maxBytes, resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let settled = false;
        const finish = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          let buffer = decompress(Buffer.concat(chunks), res.headers["content-encoding"]);
          if (maxBytes !== null && buffer.length > maxBytes) {
            buffer = buffer.subarray(0, maxBytes);
          }
          const body = buffer.toString("utf8");
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(body),
            text: async () => body,
            arrayBuffer: async () => buffer.buffer as ArrayBuffer,
          });
        };
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          received += chunk.length;
          if (maxBytes !== null && received >= maxBytes) {
            finish();
            res.destroy();
          }
        });
        res.on("end", finish);
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    req.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.on("close", () => {
      clearTimeout(timer);
    });
    req.end();
  }

  return (input: string | URL | Request, init?: RequestInit, options?: DirectFetchOptions) => {
    const url = toUrl(input);
    const method = init?.method ?? "GET";
    const headers: Record<string, string> = { ...BROWSER_HEADERS, ...toHeaderRecord(init?.headers) };
    const hasEncoding = Object.keys(headers).some((key) => key.toLowerCase() === "accept-encoding");
    if (!hasEncoding) {
      headers["Accept-Encoding"] = "gzip";
    }
    const maxBytes = options?.maxBytes === undefined ? null : options.maxBytes;
    return new Promise<DirectFetchResponse>((resolve, reject) => {
      fetchOnce(url, method, headers, MAX_REDIRECTS, maxBytes, resolve, reject);
    });
  };
}
