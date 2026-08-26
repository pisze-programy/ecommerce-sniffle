import type { Hono } from 'hono';
import type { ProviderModule } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import type { Env } from '../env/types.ts';
import type { D1Like, Storage } from '../services/storage.ts';

export interface AppVariables {
  readonly storage: Storage;
  readonly db: D1Like;
  readonly logger: Logger;
  readonly modules: readonly ProviderModule[];
}

export type ApiApp = Hono<{ Bindings: Env; Variables: AppVariables }>;

export type ApiRoute = ApiApp;
