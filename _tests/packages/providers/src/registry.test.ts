import { describe, expect, it } from 'vitest';
import { createRegistry } from '../../../../packages/providers/src/registry.ts';
import { ALL_MODULES } from '../../../../packages/providers/src/index.ts';
import type { ProviderModule } from '../../../../packages/providers/src/module.ts';

const fixtureConfig = {
  id: 'fixture',
  domain: 'fixture.pl',
  platform: 'shopify' as const,
  schedule: '0 4 * * *',
  window: 'both' as const,
  mode: 'cf-get' as const,
  stockSource: 'embedded-json' as const,
  ratePerSecond: 1,
  durationSeconds: 60,
  requiresProxy: false,
  endpoint: 'https://fixture.pl/products.json',
  enabled: true,
};

const fixtureModule: ProviderModule = {
  config: fixtureConfig,
  build() {
    throw new Error('fixture build not used');
  },
};

describe('createRegistry', () => {
  it('finds a module by id', () => {
    const registry = createRegistry(ALL_MODULES);
    const module = registry.findModule('forcer');
    expect(module?.config.domain).toBe('forcer.pl');
  });

  it('returns null for an unknown id', () => {
    const registry = createRegistry(ALL_MODULES);
    expect(registry.findModule('unknown')).toBeNull();
  });

  it('gets a module by id', () => {
    const registry = createRegistry(ALL_MODULES);
    expect(registry.getModule('wkdzik').config.domain).toBe('wkdzik.pl');
  });

  it('throws when getting an unknown id', () => {
    const registry = createRegistry(ALL_MODULES);
    expect(() => registry.getModule('unknown')).toThrow('Missing required value: provider module unknown');
  });

  it('registers every module', () => {
    const registry = createRegistry(ALL_MODULES);
    expect(registry.modules).toHaveLength(55);
  });

  it('rejects duplicate ids', () => {
    expect(() => createRegistry([fixtureModule, fixtureModule])).toThrow('Duplicate provider id: fixture');
  });

  it('accepts an empty registry', () => {
    const registry = createRegistry([]);
    expect(registry.modules).toHaveLength(0);
    expect(registry.findModule('anything')).toBeNull();
  });
});
