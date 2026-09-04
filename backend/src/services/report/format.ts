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

// Polish unit word: 1 produkt, 3 produkty, 5 produktów, 12 produktów.
export function plural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count)) % 100;
  if (n >= 12 && n <= 14) {
    return many;
  }
  const last = n % 10;
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
}

// Short money for card values: 1,06 mln zł, 458,2 tys. zł.
// Exact grosze move to the sub-caption.
export function moneyCompact(amount: number): string {
  const fmt = (value: number): string => value.toLocaleString('pl-PL', { maximumFractionDigits: value >= 100 ? 0 : 1 });
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} mln zł`;
  }
  if (Math.abs(amount) >= 10000) {
    return `${fmt(amount / 1000)} tys. zł`;
  }
  return money(amount);
}
