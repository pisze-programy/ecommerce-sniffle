import type { Context } from 'hono';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';

export function isAuthorized(c: Context<{ Bindings: Env; Variables: AppVariables }>): boolean {
  const secret = c.env.INGEST_SECRET;
  const auth = c.req.header('Authorization');
  return secret !== undefined && secret.length > 0 && auth === `Bearer ${secret}`;
}
