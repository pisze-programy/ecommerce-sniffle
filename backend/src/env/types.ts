export interface Env {
  readonly DB: D1Database;
  readonly STATE: KVNamespace;
  readonly INGEST_SECRET?: string;
}
