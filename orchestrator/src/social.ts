// The VPS social run. See docs/INSTAGRAM.md.
// The run reads the target list, collects the data, and sends it back.
// It sends one payload for each handle. The memory stays flat.
// A failure sends a snitch report with the reason.

import { buildLogger } from '@ecommerce-sniffle/providers';
import type { Logger } from '@ecommerce-sniffle/providers';
import { collectSocial } from '@ecommerce-sniffle/providers/social';
import type { SocialPayload, SocialTarget } from '@ecommerce-sniffle/providers/social';
import { sendReport } from './snitch.ts';
import type { SnitchReport } from './snitch.ts';

interface BackendConfig {
  readonly url: string;
  readonly secret: string;
}

interface SocialCounts {
  profiles: number;
  profileDays: number;
  posts: number;
  stories: number;
  reels: number;
  sent: number;
  failed: number;
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

async function sendPayload(config: BackendConfig, logger: Logger, payload: SocialPayload): Promise<boolean> {
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
    return false;
  }
  return true;
}

function buildReport(targets: number, counts: SocialCounts, message?: string): SnitchReport {
  const failed = counts.failed > 0;
  const data = {
    targets,
    profiles: counts.profiles,
    profileDays: counts.profileDays,
    posts: counts.posts,
    stories: counts.stories,
    reels: counts.reels,
    sent: counts.sent,
    failed: counts.failed,
  };
  const text =
    message === undefined
      ? `targets ${targets} | posts ${counts.posts} | stories ${counts.stories} | reels ${counts.reels} | failed ${counts.failed}`
      : message;
  return {
    source: 'ecommerce-pulse/vps/social',
    status: failed ? 'failed' : 'ok',
    data,
    message: text,
    notify: failed ? 'on-error' : 'always',
  };
}

export async function main(): Promise<void> {
  const logger: Logger = buildLogger();
  const config = readConfig();
  if (config === null) {
    logger.warn('social disabled: BACKEND_URL or INGEST_SECRET not set');
    return;
  }
  const counts: SocialCounts = {
    profiles: 0,
    profileDays: 0,
    posts: 0,
    stories: 0,
    reels: 0,
    sent: 0,
    failed: 0,
  };
  try {
    const targets = await readTargets(config, logger);
    logger.info('social.start', { targets: targets.length });
    if (targets.length === 0) {
      await sendReport(buildReport(0, counts, 'no targets'), logger);
      return;
    }
    const secret = process.env['INFLACT_SIGNATURE_SECRET'];
    const facebookKey = process.env['CHOCODATA_API_KEY'];
    const base = {
      logger,
      ...(secret === undefined ? {} : { secret }),
      ...(facebookKey === undefined ? {} : { facebookKey }),
    };
    await collectSocial(targets, {
      ...base,
      onHandle: async (_target: SocialTarget, result) => {
        const payload: SocialPayload = {
          profiles: result.profile === null ? [] : [result.profile],
          profileDays: result.profileDay === null ? [] : [result.profileDay],
          posts: result.posts,
          stories: result.stories,
          reels: result.reels,
        };
        if (await sendPayload(config, logger, payload)) {
          counts.sent += 1;
        } else {
          counts.failed += 1;
        }
        counts.profiles += payload.profiles.length;
        counts.profileDays += payload.profileDays.length;
        counts.posts += payload.posts.length;
        counts.stories += payload.stories.length;
        counts.reels += payload.reels.length;
      },
    });
    logger.info('social.done', { targets: targets.length, ...counts });
    await sendReport(buildReport(targets.length, counts), logger);
    if (counts.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('social failed', { error: message });
    await sendReport(buildReport(0, counts, `social failed: ${message}`), logger);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
