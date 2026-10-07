// Scans the staged diff for secrets. Runs from the pre-commit hook.
// The repo is public. A leaked credential is permanent.
// See docs/CLAMP-BYPASS.md and _internal/leak-fix-todo.md.
// No network. No proxy.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// A placeholder is a safe value, not a credential.
const ALLOW = /(placeholder|example|redacted|dummy|test-|xxxx|<[a-z_]+>)/i;

const RULES = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'google service account key', re: /"private_key"\s*:/ },
  // A live Shopify Storefront token is 32 lowercase hex chars.
  { name: 'storefront token', re: /storefrontAccessToken[s]?\s*[=:]\s*"?([a-f0-9]{32})/ },
  { name: 'ingest secret', re: /INGEST_SECRET\s*[:=]\s*['"][^'"]{8,}['"]/ },
];

export function isPlaceholder(value) {
  if (value === undefined || value.length === 0) {
    return false;
  }
  if (/^(.)\1+$/.test(value)) {
    return true;
  }
  return ALLOW.test(value);
}

// Reads the added lines of a unified diff. A finding names the file and rule.
export function scanDiff(diffText) {
  const findings = [];
  let file = '';
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice('+++ b/'.length);
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }
    const text = line.slice(1);
    if (ALLOW.test(text)) {
      continue;
    }
    for (const rule of RULES) {
      const match = rule.re.exec(text);
      if (match === null) {
        continue;
      }
      if (rule.name === 'storefront token' && isPlaceholder(match[1])) {
        continue;
      }
      findings.push({ file, rule: rule.name });
    }
  }
  return findings;
}

function stagedDiff() {
  return execFileSync('git', ['diff', '--cached', '--unified=0', '--no-color'], {
    encoding: 'utf8',
  });
}

function main() {
  let findings;
  try {
    findings = scanDiff(stagedDiff());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`secret-scan failed: ${message}\n`);
    process.exitCode = 1;
    return;
  }
  if (findings.length === 0) {
    return;
  }
  process.stderr.write('secret-scan: possible secret in the staged diff\n');
  for (const finding of findings) {
    process.stderr.write(`  ${finding.file}: ${finding.rule}\n`);
  }
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
