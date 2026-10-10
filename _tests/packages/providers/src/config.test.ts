import { describe, expect, it } from 'vitest';
import { PROVIDERS, validateConfig } from '../../../../packages/providers/src/config.ts';
import type { ProviderConfig } from '../../../../packages/providers/src/types.ts';

const EXPECTED_IDS = [
  'acewarsaw',
  'arustamian',
  'bloozie',
  'booso',
  'dawidpodsiadlo',
  'deehome',
  'derichgallery',
  'deynncosmetics',
  'divesmed',
  'dobrerzeczy',
  'dresscodecrew',
  'e-daag',
  'emereedivine',
  'foodsbyann',
  'forcer',
  'godsavequeens',
  'gymglamour',
  'hdrey',
  'holy',
  'huel',
  'icedstuff',
  'icon-amsterdam',
  'influcenter',
  'kfd',
  'korczakisyn',
  'laboratoriumpanidomu',
  'lecollet',
  'lexon',
  'marlehome',
  'magdabutrym',
  'marionis',
  'misbhv',
  'momentous',
  'monartofficial',
  'montiel',
  'mushi',
  'nago',
  'noo-ma',
  'ooponka',
  'osmpower',
  'phlov',
  'premieresociety',
  'rever',
  'royalwatch',
  'seembols',
  'sfd',
  'shapellx',
  'sklepskolim',
  'sodastream',
  'theodderside',
  'wakenbake',
  'westwing',
  'wkdzik',
  '33mata',
  'berecords',
  'beaumont',
  'brokies',
  'fagata',
  'friendzstore',
  'islandrecords',
  'mualasklep',
  'papitoenergy',
  'patandrub',
  'risky',
  'royaljewellery',
  'sanah',
  'wojanshop',
  'wasalaa',
  'zerosklep',
].sort();

describe('PROVIDERS config', () => {
  it('defines exactly 69 providers', () => {
    expect(PROVIDERS.length).toBe(69);
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
    const allowed = new Set(['shopify', 'shoper', 'woocommerce', 'custom', 'prestashop', 'magento', 'idosell']);
    for (const provider of PROVIDERS) {
      expect(allowed.has(provider.platform)).toBe(true);
    }
  });

  it('uses a known stock source', () => {
    const allowed = new Set([
      'embedded-json',
      'embedded-quantity',
      'embedded-graphql',
      'cache-stock',
      'cart-probe',
      'basket-reveal',
      'html',
      'boolean',
      'storefront-availability',
      'mcp-inventory',
      'ucp-inventory',
      'xml-inventory',
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

  it('has 38 mutation providers, 9 get providers, 22 vps-get providers', () => {
    const mutation = PROVIDERS.filter((provider) => provider.mode === 'vps-mutation');
    const get = PROVIDERS.filter((provider) => provider.mode === 'cf-get');
    const vpsGet = PROVIDERS.filter((provider) => provider.mode === 'vps-get');
    expect(mutation.length).toBe(38);
    expect(get.length).toBe(9);
    expect(vpsGet.length).toBe(22);
  });

  it('paces every shoper basket provider at 5 requests per second', () => {
    const shoper = PROVIDERS.filter((provider) => provider.platform === 'shoper' && provider.mode === 'vps-mutation');
    expect(shoper.length).toBeGreaterThan(0);
    for (const provider of shoper) {
      expect(provider.ratePerSecond, provider.id).toBe(5);
    }
  });

  it('keeps the sklepskolim cache provider on the direct V2 shape', () => {
    const provider = PROVIDERS.find((entry) => entry.id === 'sklepskolim');
    expect(provider?.stockSource).toBe('cache-stock');
    expect(provider?.mode).toBe('vps-get');
    expect(provider?.requiresProxy).toBe(false);
    expect(provider?.durationSeconds).toBe(1200);
    expect(provider?.adaptiveRate).toBeUndefined();
  });

  it('enables the adaptive rate for the heavy shoper shops', () => {
    const heavy = new Set(['wkdzik', 'e-daag']);
    for (const provider of PROVIDERS) {
      if (heavy.has(provider.id)) {
        expect(provider.adaptiveRate, provider.id).toBeDefined();
      } else {
        expect(provider.adaptiveRate, provider.id).toBeUndefined();
      }
    }
  });

  it('adds duplicate product ids only to the two shops with clones', () => {
    for (const provider of PROVIDERS) {
      const ids = provider.duplicateProductIds;
      if (provider.id === 'wasalaa') {
        expect(ids, provider.id).toHaveLength(82);
      } else if (provider.id === 'ooponka') {
        expect(ids, provider.id).toHaveLength(30);
      } else {
        expect(ids, provider.id).toBeUndefined();
      }
    }
  });

  it('excludes the faulty korczakisyn products only on korczakisyn', () => {
    for (const provider of PROVIDERS) {
      const ids = provider.excludedProductIds;
      if (provider.id === 'korczakisyn') {
        expect(ids).toEqual(['597', '596', '632', '290']);
      } else {
        expect(ids, provider.id).toBeUndefined();
      }
    }
  });

  it('sets the combined product tag only on the two shops with combined listings', () => {
    for (const provider of PROVIDERS) {
      const tag = provider.combinedProductTag;
      if (provider.id === 'wasalaa' || provider.id === 'ooponka') {
        expect(tag, provider.id).toBe('combinedParentProduct');
      } else {
        expect(tag, provider.id).toBeUndefined();
      }
    }
  });

  it('adds expected masked variant ids only to the untracked shops', () => {
    for (const provider of PROVIDERS) {
      const ids = provider.expectedMaskedVariantIds;
      if (provider.id === 'rever') {
        expect(ids, provider.id).toHaveLength(28);
      } else if (provider.id === 'misbhv') {
        expect(ids, provider.id).toEqual(['53573630099795']);
      } else {
        expect(ids, provider.id).toBeUndefined();
      }
    }
  });
});

describe('validateConfig adaptive rate', () => {
  const base: ProviderConfig = {
    id: 'test',
    domain: 'test.pl',
    platform: 'shoper',
    schedule: '* * * * *',
    window: 'both',
    mode: 'vps-mutation',
    stockSource: 'basket-reveal',
    ratePerSecond: 5,
    durationSeconds: 70,
    requiresProxy: true,
    endpoint: 'https://test.pl/webapi/front/pl_PL/products/PLN/list',
    enabled: true,
  };

  it('accepts a valid adaptive rate block', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 0.5,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 2,
        backoffFactor: 0.5,
        recoveryStep: 0.1,
        recoveryCount: 20,
      },
    };
    expect(validateConfig(config).adaptiveRate).toBeDefined();
  });

  it('accepts a config without an adaptive rate block', () => {
    expect(validateConfig(base).adaptiveRate).toBeUndefined();
  });

  it('rejects a fractional backoff factor at or above one', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 0.5,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 2,
        backoffFactor: 1,
        recoveryStep: 0.1,
        recoveryCount: 20,
      },
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it('rejects a non-positive min rate', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 0,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 2,
        backoffFactor: 0.5,
        recoveryStep: 0.1,
        recoveryCount: 20,
      },
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it('rejects an inverted min and max', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 4,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 2,
        backoffFactor: 0.5,
        recoveryStep: 0.1,
        recoveryCount: 20,
      },
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it('rejects a start rate above the max', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 0.5,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 5,
        backoffFactor: 0.5,
        recoveryStep: 0.1,
        recoveryCount: 20,
      },
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it('rejects a non-positive recovery count', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 0.5,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 2,
        backoffFactor: 0.5,
        recoveryStep: 0.1,
        recoveryCount: 0,
      },
    };
    expect(() => validateConfig(config)).toThrow();
  });

  it('rejects a non-finite recovery step', () => {
    const config = {
      ...base,
      adaptiveRate: {
        minRequestsPerSecond: 0.5,
        maxRequestsPerSecond: 3,
        startRequestsPerSecond: 2,
        backoffFactor: 0.5,
        recoveryStep: Number.NaN,
        recoveryCount: 20,
      },
    };
    expect(() => validateConfig(config)).toThrow();
  });
});
