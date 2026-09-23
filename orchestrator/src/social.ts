// The VPS social run. See docs/INSTAGRAM.md.
// The run reads the target list, collects the data, and sends it back.
// A failure sends a snitch report with the reason.

import { buildLogger } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import { collectSocial } from '@ecommerce-sniffle/providers/social';
import type { SocialTarget } from '@ecommerce-sniffle/providers/social';
import { cronReport, sendReport } from './snitch.ts';

interface BackendConfig {
  readonly url: string;
  readonly secret: string;
}

function readConfig(): BackendConfig | null {
  const url = process.env['BACKEND_URL'];
  const secret = process.env['INGEST_SECRET'];
  if (url === undefined || url.length === 0 || secret === undefined || secret.length === 0) {
    return null;
  }
  return { url, secret };
}

async function readTargets(config: BackendConfig, logger: Logger): Promise<readonly SocialTarget[]> {
  const response = await fetch(`${config.url}/social/targets`, {
    headers: { Authorization: `Bearer ${config.secret}` },
  });
  if (!response.ok) {
    logger.warn('social.targets failed', { status: response.status });
    return [];
  }
  const body = (await response.json()) as { targets?: unknown };
  if (!Array.isArray(body.targets)) {
    return [];
  }
  return body.targets as readonly SocialTarget[];
}

async function sendPayload(config: BackendConfig, logger: Logger, payload: unknown): Promise<number> {
  const response = await fetch(`${config.url}/ingest-social`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    logger.warn('social.ingest rejected', { status: response.status, body: text.slice(0, 120) });
    return 0;
  }
  return 1;
}

export async function main(): Promise<void> {
  const logger: Logger = buildLogger();
  const config = readConfig();
  if (config === null) {
    logger.warn('social disabled: BACKEND_URL or INGEST_SECRET not set');
    return;
  }
  try {
    const targets = await readTargets(config, logger);
    logger.info('social.start', { targets: targets.length });
    if (targets.length === 0) {
      await sendReport(cronReport('social', 'ok', { targets: 0 }, 'no targets'), logger);
      return;
    }
    const secret = process.env['INFLACT_SIGNATURE_SECRET'];
    const payload = await collectSocial(targets, secret === undefined ? { logger } : { logger, secret });
    const sent = await sendPayload(config, logger, payload);
    logger.info('social.done', {
      targets: targets.length,
      posts: payload.posts.length,
      stories: payload.stories.length,
      reels: payload.reels.length,
      profileDays: payload.profileDays.length,
      sent,
    });
    await sendReport(
      cronReport(
        'social',
        'ok',
        {
          targets: targets.length,
          posts: payload.posts.length,
          stories: payload.stories.length,
          reels: payload.reels.length,
        },
        `targets ${targets.length} | posts ${payload.posts.length} | stories ${payload.stories.length} | reels ${payload.reels.length}`
      ),
      logger
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('social failed', { error: message });
    await sendReport(cronReport('social', 'failed', { targets: 0 }, `social failed: ${message}`), logger);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
