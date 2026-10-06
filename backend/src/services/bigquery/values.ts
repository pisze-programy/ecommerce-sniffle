// Coercions for decoded BigQuery values. Reusable by any client.

export type JsonRecord = Record<string, unknown>;

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

export function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function toRecords(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: JsonRecord[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (record !== null) {
      out.push(record);
    }
  }
  return out;
}
