import { money } from '../report-components.ts';

export function fmtDate(value: string | null): string {
  if (value === null || value.length === 0) {
    return '-';
  }
  return value.slice(0, 16).replace('T', ' ');
}

export function addDays(day: string, delta: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return day;
  }
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function dayBefore(day: string): string {
  return addDays(day, -1);
}

export function dayAfter(day: string): string {
  return addDays(day, 1);
}

export function pctChange(prev: number, curr: number): number | null {
  if (prev === 0) {
    return null;
  }
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

export function countOrDash(n: number, unit: string): string {
  if (n === 0) {
    return '--';
  }
  const value = `${n} ${unit}`.trim();
  return value;
}

export function moneyOrDash(amount: number): string {
  if (amount === 0) {
    return '--';
  }
  return money(amount);
}
