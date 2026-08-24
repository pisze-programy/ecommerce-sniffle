import { request } from "node:https";
import type { DirectFetch } from "@ecommerce-sniffle/providers";

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

export function createDirectFetch(): DirectFetch {
  return (input: string | URL | Request, init?: RequestInit) => {
    const url = toUrl(input);
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        {
          method: init?.method ?? "GET",
          headers: toHeaderRecord(init?.headers),
        },
        (res) => {
          const status = res.statusCode ?? 0;
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({
              ok: status >= 200 && status < 300,
              status,
              json: async () => JSON.parse(body),
              text: async () => body,
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  };
}
