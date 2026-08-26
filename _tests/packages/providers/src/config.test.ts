import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../../../../packages/providers/src/config.ts';

const EXPECTED_IDS = [
  'arustamian',
  'bloozie',
  'booso',
  'deehome',
  'derichgallery',
  'dobrerzeczy',
  'e-daag',
  'emereedivine',
  'foodsbyann',
  'forcer',
  'godsavequeens',
  'gymglamour',
  'hdrey',
  'icon-amsterdam',
  'influcenter',
  'laboratoriumpanidomu',
  'lexon',
  'magdabutrym',
  'misbhv',
  'monartofficial',
  'montiel',
  'mushi',
  'nago',
  'noo-ma',
  'osmpower',
  'phlov',
  'premieresociety',
  'rever',
  'royalwatch',
  'seembols',
  'shapellx',
  'sklepskolim',
  'theodderside',
  'wakenbake',
  'westwing',
  'wkdzik',
].sort();

describe('PROVIDERS config', () => {
  it('defines exactly 36 providers', () => {
    expect(PROVIDERS.length).toBe(36);
  });

  it('uses unique ids', () => {
    const ids = PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches the expected provider ids', () => {
    const ids = PROVIDERS.map((provider) => provider.id).sort();
    expect(ids).toEqual(EXPECTED_IDS);
  });

  it('has valid non-empty fields on every provider', () => {
    for (const provider of PROVIDERS) {
      expect(provider.domain.length).toBeGreaterThan(0);
      expect(provider.schedule.length).toBeGreaterThan(0);
      expect(provider.endpoint.length).toBeGreaterThan(0);
      expect(provider.ratePerSecond).toBeGreaterThan(0);
    }
  });

  it('uses a known platform', () => {
    const allowed = new Set(['shopify', 'shoper', 'woocommerce', 'custom', 'prestashop', 'magento']);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.platform)).toBe(true);
    }
  });

  it('uses a known stock source', () => {
    const allowed = new Set([
      'embedded-json',
      'cart-probe',
      'basket-reveal',
      'html',
      'boolean',
      'storefront-availability',
      'mcp-inventory',
    ]);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.stockSource)).toBe(true);
    }
  });

  it('uses a known execution mode', () => {
    const allowed = new Set(['cf-get', 'vps-get', 'vps-mutation']);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.mode)).toBe(true);
    }
  });

  it('marks mutation providers as requiring a proxy except phlov', () => {
    for (const provider of PROVIDERS) {
      if (provider.mode === 'vps-mutation' && provider.id !== 'phlov') {
        expect(provider.requiresProxy).toBe(true);
      }
    }
    const phlov = PROVIDERS.find((provider) => provider.id === 'phlov');
    expect(phlov?.requiresProxy).toBe(false);
  });

  it('has 20 mutation providers, 4 get providers, 12 vps-get providers', () => {
    const mutation = PROVIDERS.filter((provider) => provider.mode === 'vps-mutation');
    const get = PROVIDERS.filter((provider) => provider.mode === 'cf-get');
    const vpsGet = PROVIDERS.filter((provider) => provider.mode === 'vps-get');
    expect(mutation.length).toBe(20);
    expect(get.length).toBe(4);
    expect(vpsGet.length).toBe(12);
  });
});
