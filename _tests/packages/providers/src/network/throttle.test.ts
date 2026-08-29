import { describe, expect, it } from 'vitest';
import {
  isHtmlPage,
  isThrottleResponse,
  parseRetryAfterSeconds,
  throttleBackoffMs,
} from '../../../../../packages/providers/src/network/throttle.ts';

describe('isHtmlPage', () => {
  it('detects an html error page', () => {
    expect(isHtmlPage('<html><h1>Too many requests</h1></html>')).toBe(true);
  });

  it('detects an html page with a leading whitespace and BOM', () => {
    expect(isHtmlPage('\uFEFF  <HTML><head></head></HTML>')).toBe(true);
  });

  it('detects a doctype page', () => {
    expect(isHtmlPage('<!DOCTYPE html><html></html>')).toBe(true);
  });

  it('rejects a json body', () => {
    expect(isHtmlPage('{"added":[]}')).toBe(false);
  });

  it('rejects a plain text body', () => {
    expect(isHtmlPage('not json')).toBe(false);
  });

  it('rejects a json body that starts with an html word in a string', () => {
    expect(isHtmlPage('{"message":"<html> inside"}')).toBe(false);
  });
});

describe('isThrottleResponse', () => {
  it('treats a 429 as a throttle for any body', () => {
    expect(isThrottleResponse(429, '{"added":[]}')).toBe(true);
    expect(isThrottleResponse(429, 'plain')).toBe(true);
  });

  it('treats a 5xx with an html body as a throttle', () => {
    expect(isThrottleResponse(500, '<html><h1>blocked</h1></html>')).toBe(true);
    expect(isThrottleResponse(502, '<html></html>')).toBe(true);
    expect(isThrottleResponse(503, '<html></html>')).toBe(true);
    expect(isThrottleResponse(504, '<html></html>')).toBe(true);
  });

  it('treats a 5xx with a json body as a permanent error', () => {
    expect(isThrottleResponse(500, '{"error":"variant not available"}')).toBe(false);
  });

  it('treats a 2xx with an html body as a throttle', () => {
    expect(isThrottleResponse(200, '<html><h1>error</h1></html>')).toBe(true);
  });

  it('treats a 2xx json body as a normal response', () => {
    expect(isThrottleResponse(200, '{"added":[{"id":1}]}')).toBe(false);
  });

  it('treats a 2xx plain body as a normal response', () => {
    expect(isThrottleResponse(200, 'not json')).toBe(false);
  });

  it('treats a 4xx client error as a normal error', () => {
    expect(isThrottleResponse(422, '{"message":"wybierz wariant"}')).toBe(false);
    expect(isThrottleResponse(404, 'plain')).toBe(false);
  });
});

describe('parseRetryAfterSeconds', () => {
  const NOW = 1_700_000_000_000;

  it('reads seconds from a numeric header', () => {
    expect(parseRetryAfterSeconds({ get: () => '42' }, NOW)).toBe(42);
  });

  it('reads seconds from an http-date header', () => {
    const date = new Date(NOW + 5000).toUTCString();
    expect(parseRetryAfterSeconds({ get: () => date }, NOW)).toBe(5);
  });

  it('returns null when the header is missing', () => {
    expect(parseRetryAfterSeconds({ get: () => null }, NOW)).toBeNull();
  });

  it('returns null when the header is invalid', () => {
    expect(parseRetryAfterSeconds({ get: () => 'not a date' }, NOW)).toBeNull();
  });

  it('returns null when the header is a date in the past', () => {
    expect(parseRetryAfterSeconds({ get: () => new Date(NOW - 5000).toUTCString() }, NOW)).toBeNull();
  });

  it('returns null when the header object is missing', () => {
    expect(parseRetryAfterSeconds(undefined, NOW)).toBeNull();
  });
});

describe('throttleBackoffMs', () => {
  it('caps the wait at the max backoff', () => {
    const wait = throttleBackoffMs(10, { get: () => null }, 1_700_000_000_000, undefined);
    expect(wait).toBeLessThanOrEqual(10000);
    expect(wait).toBeGreaterThan(0);
  });

  it('never exceeds the remaining budget', () => {
    const wait = throttleBackoffMs(1, { get: () => null }, Date.now(), Date.now() + 500);
    expect(wait).toBeLessThanOrEqual(500);
  });

  it('returns zero when the budget is already spent', () => {
    const wait = throttleBackoffMs(1, { get: () => null }, Date.now(), Date.now() - 1000);
    expect(wait).toBe(0);
  });

  it('honors a valid retry-after header within the cap', () => {
    const wait = throttleBackoffMs(1, { get: () => '999999999' }, 1_700_000_000_000, undefined);
    expect(wait).toBeLessThanOrEqual(10000);
  });
});
