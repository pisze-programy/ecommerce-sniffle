// A throttled response carries a signal the caller must honor. This
// module classifies a response as a throttle. It also reads the
// Retry-After header safely.

// The base backoff for a throttled probe. The backoff doubles per
// retry attempt.
export const THROTTLE_BASE_BACKOFF_MS = 2000;

// The cap for a throttled probe backoff. A shop that wants more wait
// time sends Retry-After. This cap keeps the run inside the budget.
export const THROTTLE_MAX_BACKOFF_MS = 10000;

// A shop returns an HTML page for a throttled or blocked request. The
// JSON endpoint must answer JSON. An HTML body on a JSON endpoint means
// the request was blocked. The marker must be a prefix match. A JSON
// body does not start with an HTML tag.
export function isHtmlPage(text: string): boolean {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart();
  return /^<\s*(!doctype\s+)?(html|head|body|title)/i.test(trimmed);
}

// A 429 is a throttle for any body. A 5xx is a throttle only for an
// HTML body. A 5xx with a JSON body is a permanent app error. A 2xx
// with an HTML body is a throttle. A 2xx with a plain body is not.
export function isThrottleResponse(status: number, text: string): boolean {
  if (status === 429) {
    return true;
  }
  if (status >= 500 && status < 600) {
    return isHtmlPage(text);
  }
  if (status >= 200 && status < 400) {
    return isHtmlPage(text);
  }
  return false;
}

interface RetryHeaders {
  get(name: string): string | null;
}

// The Retry-After header holds seconds or an HTTP-date. This parser
// returns seconds. It returns null when the header is missing or
// invalid. A caller must never trust the raw value. A hostile value can
// sleep a task for years.
export function parseRetryAfterSeconds(headers: RetryHeaders | undefined, nowMs: number): number | null {
  if (headers === undefined) {
    return null;
  }
  const raw = headers.get('retry-after');
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) {
    return null;
  }
  const seconds = Math.ceil((dateMs - nowMs) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds;
}

// The wait for a throttled retry. It respects Retry-After when the
// header is valid. It caps the wait at the max backoff. It never
// exceeds the remaining budget.
export function throttleBackoffMs(
  attempt: number,
  headers: RetryHeaders | undefined,
  nowMs: number,
  deadlineMs: number | undefined
): number {
  const exponential = THROTTLE_BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jittered = Math.min(exponential, THROTTLE_MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5);
  const retryAfter = parseRetryAfterSeconds(headers, nowMs);
  const raw = retryAfter === null ? jittered : Math.max(jittered, retryAfter * 1000);
  const capped = Math.min(raw, THROTTLE_MAX_BACKOFF_MS);
  if (deadlineMs === undefined) {
    return capped;
  }
  const remaining = deadlineMs - nowMs;
  if (remaining <= 0) {
    return 0;
  }
  return Math.min(capped, remaining);
}
