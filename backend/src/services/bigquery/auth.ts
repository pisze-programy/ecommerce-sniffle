// BigQuery service account auth.
// Signs a JWT with WebCrypto RS256 and exchanges it for an access token.
// Reusable by any BigQuery client in the backend.

import type { Logger } from '@ecommerce-sniffle/providers';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BQ_SCOPE = 'https://www.googleapis.com/auth/bigquery';

interface KeyFile {
  readonly client_email?: unknown;
  readonly private_key?: unknown;
  readonly project_id?: unknown;
}

export interface BqAuth {
  readonly project: string;
  readonly token: string;
}

function b64urlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64url(input: string): string {
  return b64urlBytes(new TextEncoder().encode(input));
}

function pemToBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function mintToken(email: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: email, scope: BQ_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const data = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(pem).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  const signed = `${data}.${b64urlBytes(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed,
    }),
  });
  if (!response.ok) {
    throw new Error(`token HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  const token = body['access_token'];
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('token response holds no access_token');
  }
  return token;
}

// Reads the service account JSON and returns a ready project and token.
export async function prepareAuth(keyJson: string, projectId: string | undefined, logger: Logger): Promise<BqAuth> {
  let key: KeyFile;
  try {
    key = JSON.parse(keyJson) as KeyFile;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('bigquery.badKey', { error: message, reason: 'key is not JSON' });
    throw new Error('BigQuery key is not JSON');
  }
  const email = typeof key.client_email === 'string' ? key.client_email : '';
  const pem = typeof key.private_key === 'string' ? key.private_key : '';
  const fromKey = typeof key.project_id === 'string' && key.project_id.length > 0 ? key.project_id : '';
  const project = projectId === undefined ? fromKey : projectId;
  if (email.length === 0 || pem.length === 0 || project.length === 0) {
    logger.error('bigquery.badKey', { reason: 'key holds no client_email, private_key, or project_id' });
    throw new Error('BigQuery key misses fields');
  }
  let token: string;
  try {
    token = await mintToken(email, pem);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('bigquery.tokenFailed', { error: message });
    throw error;
  }
  return { project, token };
}
