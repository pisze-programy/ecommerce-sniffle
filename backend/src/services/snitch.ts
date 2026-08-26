import type { Env } from '../env/types.ts';

export async function sendSnitchReport(env: Env, body: Readonly<Record<string, unknown>>): Promise<Response> {
  const url = env.SNITCH_URL ?? '';
  const token = env.SNITCH_TOKEN ?? '';
  if (url.length === 0 || token.length === 0) {
    return new Response(JSON.stringify({ error: 'snitch not configured' }), { status: 500 });
  }
  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
  if (env.SNITCH !== undefined) {
    return env.SNITCH.fetch(`${url}/v1/report`, init);
  }
  return fetch(`${url}/v1/report`, init);
}
