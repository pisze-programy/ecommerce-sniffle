export interface Env {
  readonly DB: D1Database;
  readonly STATE: KVNamespace;
  readonly INGEST_SECRET?: string;
  readonly SNITCH_URL?: string;
  readonly SNITCH_TOKEN?: string;
  readonly SNITCH?: { fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> };
  readonly MEDIA?: R2Bucket;
  readonly RAPIDAPI_KEY?: string;
  readonly META_AD_TOKEN?: string;
}
