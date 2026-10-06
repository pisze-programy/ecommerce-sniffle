// BigQuery REST client. Runs one query and reads every result page.
// Reusable by any feature that needs BigQuery.

import type { Logger } from '@ecommerce-sniffle/providers';

const QUERY_TIMEOUT_MS = 120000;
const POLL_DELAY_MS = 5000;
const MAX_POLLS = 24;
const MAX_RESULTS = 20000;
const MAX_PAGES = 200;

// A single job must never scan more than this. The measured scans are about
// 22 GB (core), 19 GB (static) and 56 GB (surfaces). 80 GB leaves room for
// table growth and stops an accidental full scan of the 131 GB table.
export const MAX_BYTES_BILLED = '80000000000';

export interface BqField {
  readonly name?: unknown;
  readonly type?: unknown;
  readonly mode?: unknown;
  readonly fields?: readonly BqField[];
}

export interface BqCell {
  readonly v?: unknown;
}

export interface BqRow {
  readonly f?: readonly BqCell[];
}

export interface BqError {
  readonly reason?: unknown;
  readonly message?: unknown;
}

export interface BqJob {
  readonly jobReference?: { readonly jobId?: string };
  readonly jobComplete?: boolean;
  readonly schema?: { readonly fields?: readonly BqField[] };
  readonly rows?: readonly BqRow[];
  readonly pageToken?: string;
  readonly totalBytesProcessed?: string;
  readonly errors?: readonly BqError[];
}

export interface BqPollOptions {
  readonly maxPolls?: number;
  readonly pollDelayMs?: number;
}

type Json = Record<string, unknown>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// BigQuery returns job errors as an array. A finished job can hold errors
// and no rows. Read the first message so the caller sees a failure.
function firstError(job: BqJob): string | null {
  if (job.errors === undefined || job.errors.length === 0) {
    return null;
  }
  const first = job.errors[0];
  if (first === undefined || typeof first.message !== 'string' || first.message.length === 0) {
    return 'query failed';
  }
  return first.message;
}

async function runQuery(project: string, token: string, sql: string, dryRun: boolean): Promise<BqJob> {
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      dryRun,
      maximumBytesBilled: MAX_BYTES_BILLED,
      maxResults: MAX_RESULTS,
      timeoutMs: QUERY_TIMEOUT_MS,
    }),
  });
  if (!response.ok) {
    throw new Error(`BigQuery HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return (await response.json()) as BqJob;
}

async function getPage(project: string, token: string, jobId: string, pageToken: string): Promise<BqJob> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${jobId}?location=US&maxResults=${MAX_RESULTS}&pageToken=${encodeURIComponent(pageToken)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`BigQuery page HTTP ${response.status}`);
  }
  return (await response.json()) as BqJob;
}

async function awaitJob(
  project: string,
  token: string,
  jobId: string,
  logger: Logger,
  options: BqPollOptions
): Promise<BqJob> {
  const maxPolls = options.maxPolls === undefined ? MAX_POLLS : options.maxPolls;
  const pollDelayMs = options.pollDelayMs === undefined ? POLL_DELAY_MS : options.pollDelayMs;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    await sleep(pollDelayMs);
    const response = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${jobId}?location=US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new Error(`BigQuery poll HTTP ${response.status}`);
    }
    const job = (await response.json()) as BqJob;
    if (job.jobComplete === true) {
      return job;
    }
    logger.info('bigquery.pollWait', { attempt, jobId });
  }
  throw new Error(`query ${jobId} still running after ${maxPolls} polls`);
}

// Runs a query, waits for the job and reads every page of the result.
// The label names the calling job in the log records.
export async function runQueryAll(
  project: string,
  token: string,
  sql: string,
  logger: Logger,
  options: BqPollOptions,
  label: string
): Promise<BqJob> {
  const dry = await runQuery(project, token, sql, true);
  logger.info('bigquery.queryPlanned', {
    label,
    bytes: dry.totalBytesProcessed === undefined ? '0' : dry.totalBytesProcessed,
  });
  let current = await runQuery(project, token, sql, false);
  if (current.jobComplete !== true) {
    const jobId = current.jobReference?.jobId === undefined ? '' : current.jobReference.jobId;
    if (jobId.length === 0) {
      throw new Error('query returned no job id');
    }
    current = await awaitJob(project, token, jobId, logger, options);
  }
  const jobError = firstError(current);
  if (jobError !== null) {
    throw new Error(jobError);
  }
  const rows: BqRow[] = current.rows === undefined ? [] : [...current.rows];
  let pageToken = current.pageToken;
  let pages = 1;
  while (typeof pageToken === 'string' && pageToken.length > 0 && pages < MAX_PAGES) {
    const jobId = current.jobReference?.jobId === undefined ? '' : current.jobReference.jobId;
    if (jobId.length === 0) {
      break;
    }
    const page = await getPage(project, token, jobId, pageToken);
    const pageError = firstError(page);
    if (pageError !== null) {
      throw new Error(pageError);
    }
    if (page.rows !== undefined) {
      rows.push(...page.rows);
    }
    pageToken = page.pageToken;
    pages += 1;
  }
  if (typeof pageToken === 'string' && pageToken.length > 0) {
    throw new Error(`result holds more than ${MAX_PAGES} pages`);
  }
  return { ...current, rows };
}

function decodeValue(field: BqField, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object' && value !== null && 'v' in value) {
    return decodeValue(field, (value as { v?: unknown }).v);
  }
  if (field.mode === 'REPEATED' && Array.isArray(value)) {
    return value.map((entry) => decodeValue({ ...field, mode: 'NULLABLE' }, entry));
  }
  if (field.type === 'RECORD' && typeof value === 'object' && value !== null && 'f' in value) {
    const record = value as { f?: readonly BqCell[] };
    const cells = record.f === undefined ? [] : record.f;
    const out: Json = {};
    const sub = field.fields === undefined ? [] : field.fields;
    for (let i = 0; i < sub.length; i += 1) {
      const name = typeof sub[i]?.name === 'string' ? (sub[i]?.name as string) : `${i}`;
      const subField = sub[i];
      out[name] = decodeValue(subField === undefined ? {} : subField, cells[i]?.v);
    }
    return out;
  }
  return value;
}

// Turns one API row into a plain object keyed by the schema field names.
export function decodeRow(fields: readonly BqField[], line: BqRow): Json {
  const row: Json = {};
  const cells = line.f === undefined ? [] : line.f;
  for (let i = 0; i < fields.length; i += 1) {
    const name = typeof fields[i]?.name === 'string' ? (fields[i]?.name as string) : `${i}`;
    const field = fields[i];
    row[name] = decodeValue(field === undefined ? {} : field, cells[i]?.v);
  }
  return row;
}
