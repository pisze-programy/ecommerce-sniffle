import { describe, expect, it } from 'vitest';
import { moneyCompact, plural } from '../../../../backend/src/services/report/format.ts';

describe('moneyCompact', () => {
  it('shortens millions', () => {
    expect(moneyCompact(45200000)).toBe('45,2 mln zł');
    expect(moneyCompact(1059623)).toBe('1,06 mln zł');
  });

  it('shortens large thousands', () => {
    expect(moneyCompact(458201)).toBe('458 tys. zł');
    expect(moneyCompact(15273)).toBe('15,3 tys. zł');
  });

  it('keeps small amounts exact', () => {
    expect(moneyCompact(115)).toContain('115');
    expect(moneyCompact(0)).toContain('0');
  });
});

describe('plural', () => {
  it('picks the Polish unit word', () => {
    expect(plural(1, 'produkt', 'produkty', 'produktów')).toBe('produkt');
    expect(plural(3, 'produkt', 'produkty', 'produktów')).toBe('produkty');
    expect(plural(5, 'produkt', 'produkty', 'produktów')).toBe('produktów');
    expect(plural(12, 'produkt', 'produkty', 'produktów')).toBe('produktów');
    expect(plural(22, 'produkt', 'produkty', 'produktów')).toBe('produkty');
    expect(plural(340, 'produkt', 'produkty', 'produktów')).toBe('produktów');
  });
});
