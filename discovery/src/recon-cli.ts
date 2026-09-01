// Run the recon for one shop. Print the vendor, the challenge state,
// the embedded data formats, and the sitemap count.

import { createLogger, consoleSink } from '@ecommerce-sniffle/providers';
import { fetchRecon } from './recon.ts';

const logger = createLogger(consoleSink);

async function main(): Promise<void> {
  const raw = process.argv[2];
  const url = raw === undefined ? '' : raw;
  if (url.length === 0) {
    logger.error('recon.usage', { usage: 'node dist/recon-cli.js <url>' });
    process.exitCode = 1;
    return;
  }
  try {
    const report = await fetchRecon(url, logger);
    console.log(`recon ${report.url}`);
    console.log(`  status      ${report.status}`);
    console.log(`  vendor      ${report.vendor}`);
    console.log(`  challenged  ${report.challenged ? 'yes' : 'no'}`);
    console.log(`  embedded    ${report.patterns.length === 0 ? 'none' : report.patterns.join(', ')}`);
    console.log(`  sitemaps    ${report.robotsSitemaps}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('recon.failed', { url, error: message });
    process.exitCode = 1;
  }
}

main();
