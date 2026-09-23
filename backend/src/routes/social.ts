// Social module routes. See docs/INSTAGRAM.md.
// The VPS reads the target list and sends the collected payload.

import { Hono } from 'hono';
import type { SocialTarget } from '@ecommerce-sniffle/providers/social';
import type { Env } from '../env/types.ts';
import type { AppVariables } from './types.ts';
import { isAuthorized } from './auth.ts';
import { parseSocialPayload } from '../services/social/parse.ts';
import { applySocialPayload } from '../services/social/run.ts';

export function createSocialRoutes(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const api = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  api.get('/social/targets', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('social-targets unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const storage = c.get('storage');
    const store = await storage.readEntityStore();
    const profiles = await storage.readSocialProfiles();
    const userIdByHandle = new Map(profiles.map((profile) => [profile.handle, profile.userId]));

    const domainByEntity = new Map<string, string>();
    for (const module of c.get('modules')) {
      if (module.config.enabled && module.config.entityId !== undefined) {
        domainByEntity.set(module.config.entityId, module.config.domain);
      }
    }

    const targets: SocialTarget[] = [];
    const push = async (
      handle: string,
      ownerKind: 'entity' | 'person',
      ownerId: string,
      seedDay: string | null
    ): Promise<void> => {
      const userId = userIdByHandle.get(handle);
      let sinceEpoch: number | null = null;
      if (userId !== undefined) {
        const newest = await storage.readSocialPosts([userId], '', '', 1);
        const takenAt = newest[0]?.takenAt;
        if (takenAt !== undefined) {
          const parsed = Date.parse(takenAt);
          if (!Number.isNaN(parsed)) {
            sinceEpoch = Math.floor(parsed / 1000);
          }
        }
      }
      targets.push({ handle, ownerKind, ownerId, seedDay, sinceEpoch });
    };

    const entitySeed = new Map<string, string | null>();
    for (const entity of store.entities) {
      const domain = domainByEntity.get(entity.id);
      const seedDay = domain === undefined ? null : await storage.readFirstSeed(domain);
      entitySeed.set(entity.id, seedDay);
      for (const link of entity.socials) {
        if (link.platform === 'instagram') {
          await push(link.handle, 'entity', entity.id, seedDay);
        }
      }
    }
    for (const person of store.persons) {
      // A person has no shop seed. Use the earliest seed of the related
      // shops as the backfill floor.
      const seeds: string[] = [];
      for (const relation of store.personRelations) {
        if (relation.personId !== person.id) {
          continue;
        }
        const seed = entitySeed.get(relation.entityId);
        if (seed !== undefined && seed !== null) {
          seeds.push(seed);
        }
      }
      seeds.sort();
      const seedDay = seeds.length === 0 ? null : (seeds[0] ?? null);
      for (const link of person.socials) {
        if (link.platform === 'instagram') {
          await push(link.handle, 'person', person.id, seedDay);
        }
      }
    }
    return c.json({ targets });
  });

  api.post('/ingest-social', async (c) => {
    if (!isAuthorized(c)) {
      c.get('logger').warn('ingest-social unauthorized');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const body = await c.req.json().catch(() => null);
    const payload = parseSocialPayload(body);
    if (payload === null) {
      c.get('logger').warn('ingest-social invalid payload');
      return c.json({ error: 'invalid payload' }, 400);
    }
    const result = await applySocialPayload(
      c.get('storage'),
      c.get('logger'),
      payload,
      c.env.MEDIA === undefined ? null : c.env.MEDIA
    );
    c.get('logger').info('ingest-social done', { ...result });
    return c.json({ ok: true, ...result });
  });

  return api;
}
