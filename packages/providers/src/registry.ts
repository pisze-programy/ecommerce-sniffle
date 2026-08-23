import type { ProviderModule } from "./module.ts";
import { requireValue } from "./helpers.ts";

export interface ProviderRegistry {
  readonly modules: readonly ProviderModule[];
  findModule(id: string): ProviderModule | null;
  getModule(id: string): ProviderModule;
}

function assertUniqueIds(modules: readonly ProviderModule[]): void {
  const seen = new Set<string>();
  for (const module of modules) {
    if (seen.has(module.config.id)) {
      throw new Error(`Duplicate provider id: ${module.config.id}`);
    }
    seen.add(module.config.id);
  }
}

export function createRegistry(modules: readonly ProviderModule[]): ProviderRegistry {
  assertUniqueIds(modules);
  const byId = new Map<string, ProviderModule>(modules.map((module) => [module.config.id, module]));
  return {
    modules,
    findModule(id: string): ProviderModule | null {
      return byId.get(id) ?? null;
    },
    getModule(id: string): ProviderModule {
      const module = byId.get(id);
      return requireValue(module, `provider module ${id}`);
    },
  };
}
