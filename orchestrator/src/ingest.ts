import { catalogToSnapshot, currentWindow } from "@ecommerce-sniffle/analysis";
import type { Snapshot } from "@ecommerce-sniffle/analysis";
import { truncateMessage } from "@ecommerce-sniffle/providers";
import type { Catalog, Logger } from "@ecommerce-sniffle/providers";

export interface IngestConfig {
  readonly backendUrl: string;
  readonly secret: string;
}

export function readIngestConfig(): IngestConfig | null {
  const backendUrl = process.env["BACKEND_URL"];
  const secret = process.env["INGEST_SECRET"];
  if (backendUrl === undefined || backendUrl.length === 0) {
    return null;
  }
  if (secret === undefined || secret.length === 0) {
    return null;
  }
  return { backendUrl, secret };
}

export function catalogToIngestSnapshot(catalog: Catalog): Snapshot {
  return catalogToSnapshot(catalog, currentWindow(), new Date().toISOString());
}

export async function sendSnapshot(
  snapshot: Snapshot,
  config: IngestConfig,
  logger: Logger,
): Promise<boolean> {
  try {
    const response = await fetch(`${config.backendUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify(snapshot),
    });
    if (response.ok) {
      logger.info("ingest.sent", { shop: snapshot.shop, variants: snapshot.variants.length });
      return true;
    }
    const text = await response.text();
    logger.warn("ingest.rejected", {
      shop: snapshot.shop,
      status: response.status,
      error: truncateMessage(text),
    });
    return false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("ingest.failed", { shop: snapshot.shop, error: message });
    return false;
  }
}
