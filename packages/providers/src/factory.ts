import type { Logger } from './logger.ts';
import type { Catalog, Provider, ProviderConfig, StockRevealTarget, StockRevealer } from './types.ts';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function buildProvider(
  config: ProviderConfig,
  logger: Logger,
  fetchCatalogImpl: () => Promise<Catalog>
): Provider {
  return {
    config,
    async fetchCatalog(): Promise<Catalog> {
      try {
        return await fetchCatalogImpl();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Provider.fetchCatalog failed', {
          providerId: config.id,
          domain: config.domain,
          error: message,
        });
        throw error;
      }
    },
  };
}

export function buildStockRevealer(
  config: ProviderConfig,
  logger: Logger,
  fetchCatalogImpl: () => Promise<Catalog>,
  revealStockImpl: (target: StockRevealTarget) => Promise<Catalog>
): StockRevealer {
  const base = buildProvider(config, logger, fetchCatalogImpl);
  return {
    ...base,
    async revealStock(target: StockRevealTarget): Promise<Catalog> {
      try {
        return await revealStockImpl(target);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Provider.revealStock failed', {
          providerId: config.id,
          domain: config.domain,
          error: message,
        });
        throw error;
      }
    },
  };
}

export function notImplemented(config: ProviderConfig): never {
  throw new ProviderError(`Provider ${config.id} is not implemented`, config.id);
}
