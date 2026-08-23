export function isNullish(value: unknown): boolean {
  return value === null || value === undefined;
}

export function requireValue<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

export function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid positive integer for ${name}: ${String(value)}`);
  }
  return value;
}

export function assertNonEmptyString(value: string, name: string): string {
  if (value.length === 0) {
    throw new Error(`Invalid empty string for ${name}`);
  }
  return value;
}

export function truncateMessage(message: string, maxLength: number = 300): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength)}...`;
}
