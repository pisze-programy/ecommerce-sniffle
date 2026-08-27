import { Hono } from 'hono';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { createQueueRoutes } from './queue.ts';
import { createIngestRoutes } from './ingest.ts';
import { createReadsRoutes } from './reads.ts';
import { createRunRoutes } from './run.ts';
import { createUsageRoutes } from './usage.ts';
import { createSnitchRoutes } from './snitch.ts';
import { createReportRoutes } from './report.ts';

export type { AppVariables } from './types.ts';

export function createApi(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();
  api.route('/queue', createQueueRoutes());
  api.route('/', createIngestRoutes());
  api.route('/', createReadsRoutes());
  api.route('/', createRunRoutes());
  api.route('/', createUsageRoutes());
  api.route('/', createSnitchRoutes());
  api.route('/', createReportRoutes());
  return api;
}
