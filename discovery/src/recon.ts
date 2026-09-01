// Recon a shop before writing a provider. The patterns come from the
// scraperecon tool. Detect the bot protection vendor, the challenge
// pages, and the embedded data formats.

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '@ecommerce-sniffle/providers';

const execFile = promisify(execFileCb);

export type BotVendor = 'akamai' | 'cloudflare' | 'datadome' | 'perimeterx' | 'incapsula' | 'none';

export type EmbeddedPattern = 'jsonld' | 'next' | 'nuxt' | 'apollo' | 'redux';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MARKER = '__RECON_META__:';

function headerValue(headers: Readonly<Record<string, string>>, name: string): string {
  const value = headers[name.toLowerCase()];
  return value === undefined ? '' : value;
}

export function detectVendor(headers: Readonly<Record<string, string>>, body: string): BotVendor {
  const lowerBody = body.toLowerCase();
  const server = headerValue(headers, 'server').toLowerCase();
  const has = (name: string): boolean => headerValue(headers, name) !== '';
  if (
    server.includes('akamai') ||
    has('x-akamai-request-id') ||
    lowerBody.includes('edgesuite.net') ||
    lowerBody.includes('akamai')
  ) {
    return 'akamai';
  }
  if (
    server.includes('cloudflare') ||
    has('cf-ray') ||
    lowerBody.includes('challenges.cloudflare.com') ||
    lowerBody.includes('cf-browser-verification')
  ) {
    return 'cloudflare';
  }
  if (has('x-datadome') || lowerBody.includes('datadome')) {
    return 'datadome';
  }
  if (lowerBody.includes('perimeterx')) {
    return 'perimeterx';
  }
  if (has('x-iinfo') || lowerBody.includes('incapsula')) {
    return 'incapsula';
  }
  return 'none';
}

// A challenge page is a bot verification interstitial.
// It is not the real shop page. Do not parse it.
export function isChallengePage(body: string): boolean {
  return /cf-browser-verification|checking your browser|just a moment|verifying your connection|challenge-platform/i.test(
    body
  );
}

export function detectEmbeddedPatterns(body: string): readonly EmbeddedPattern[] {
  const out: EmbeddedPattern[] = [];
  if (body.includes('application/ld+json')) {
    out.push('jsonld');
  }
  if (body.includes('__NEXT_DATA__')) {
    out.push('next');
  }
  if (body.includes('__NUXT__') || body.includes('data-nuxt-data')) {
    out.push('nuxt');
  }
  if (body.includes('__APOLLO_STATE__') || body.includes('__RELAY_PAYLOADS__')) {
    out.push('apollo');
  }
  if (body.includes('__INITIAL_STATE__') || body.includes('__PRELOADED_STATE__')) {
    out.push('redux');
  }
  return out;
}

interface RawPage {
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

async function fetchRaw(url: string): Promise<RawPage> {
  const { stdout } = await execFile(
    'curl',
    [
      '-s',
      '-L',
      '--max-time',
      '15',
      '-A',
      USER_AGENT,
      '-H',
      'Accept: text/html,application/xhtml+xml;q=0.9',
      '-w',
      `\n${MARKER}%{json}`,
      url,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const markerIndex = stdout.lastIndexOf(MARKER);
  const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  const headers: Record<string, string> = {};
  let status = 0;
  if (markerIndex >= 0) {
    const meta = JSON.parse(stdout.slice(markerIndex + MARKER.length)) as {
      http_code?: number;
      header_json?: Record<string, string[]>;
    };
    status = meta.http_code === undefined ? 0 : meta.http_code;
    const headerJson = meta.header_json === undefined ? {} : meta.header_json;
    for (const name of Object.keys(headerJson)) {
      const values = headerJson[name];
      headers[name] = values === undefined ? '' : values.join('; ');
    }
  }
  return { status, body, headers };
}

export interface ReconReport {
  readonly url: string;
  readonly status: number;
  readonly vendor: BotVendor;
  readonly challenged: boolean;
  readonly patterns: readonly EmbeddedPattern[];
  readonly robotsSitemaps: number;
}

export async function fetchRecon(url: string, logger: Logger): Promise<ReconReport> {
  const page = await fetchRaw(url);
  const vendor = detectVendor(page.headers, page.body);
  const challenged = isChallengePage(page.body);
  const patterns = detectEmbeddedPatterns(page.body);
  let robotsSitemaps = 0;
  const robotsUrl = url.replace(/\/+$/, '') + '/robots.txt';
  try {
    const robots = await fetchRaw(robotsUrl);
    const matches = robots.body.match(/^Sitemap:\s*\S+/gim);
    robotsSitemaps = matches === null ? 0 : matches.length;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('recon.robots failed', { url: robotsUrl, error: message });
  }
  return { url, status: page.status, vendor, challenged, patterns, robotsSitemaps };
}
