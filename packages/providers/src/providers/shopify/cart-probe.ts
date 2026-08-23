import { buildStockRevealer } from "../../factory.ts";
import { truncateMessage } from "../../helpers.ts";
import { isCloudflareChallenge } from "../../captcha/detect.ts";
import type { Logger } from "../../logger.ts";
import type {
  Catalog,
  Product,
  ProviderConfig,
  StockRevealTarget,
  StockRevealer,
  Variant,
} from "../../types.ts";
import { fetchShopifyCatalog } from "./adapter.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const PROBE_QUANTITY = 999;

export interface ProbeOutcome {
  readonly quantity: number | null;
  readonly available: boolean | null;
}

export function parseChangeResponse(text: string, logger: Logger): ProbeOutcome {
  const clamped = /Tylko\s+(\d+)\s+poz\.|Only\s+(\d+)\s+(?:items?|poz\.)/i.exec(text);
  if (clamped !== null) {
    const value = clamped[1] === undefined ? (clamped[2] as string | undefined) : clamped[1];
    if (value !== undefined) {
      return { quantity: Number(value), available: true };
    }
  }
  if (/wyprzedan|sold out|out of stock|unavailable/i.test(text)) {
    return { quantity: 0, available: false };
  }
  try {
    const data = JSON.parse(text) as Readonly<Record<string, unknown>>;
    const itemsRaw = data["items"];
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
      const first = itemsRaw[0] as Readonly<Record<string, unknown>>;
      const quantity = typeof first["quantity"] === "number" ? first["quantity"] : null;
      if (quantity !== null) {
        return { quantity, available: true };
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("cartprobe.change response parse failed", { error: message });
  }
  return { quantity: null, available: null };
}

function extractCartCookie(setCookie: string | null): string | null {
  if (setCookie === null) {
    return null;
  }
  const cartMatch = /cart=[^;]+/.exec(setCookie);
  if (cartMatch === null) {
    return null;
  }
  return cartMatch[0];
}

export async function probeVariantStock(
  domain: string,
  variantId: string,
  logger: Logger,
): Promise<ProbeOutcome> {
  const baseHeaders: Readonly<Record<string, string>> = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  let cartCookie: string | null = null;
  try {
    const addResponse = await fetch(`https://${domain}/cart/add.js`, {
      method: "POST",
      headers: baseHeaders,
      body: `id=${variantId}&quantity=1`,
    });
    const addText = await addResponse.text();
    if (isCloudflareChallenge(addText)) {
      logger.warn("cartprobe.challenge blocked", { domain, variantId });
      return { quantity: null, available: null };
    }
    if (!addResponse.ok) {
      throw new Error(`cart add failed with status ${addResponse.status}: ${truncateMessage(addText)}`);
    }
    cartCookie = extractCartCookie(addResponse.headers.get("set-cookie"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("cartprobe.add failed", { domain, variantId, error: message });
    return { quantity: null, available: null };
  }
  const changeHeaders: Readonly<Record<string, string>> =
    cartCookie === null
      ? { ...baseHeaders }
      : { ...baseHeaders, Cookie: cartCookie };
  try {
    const changeResponse = await fetch(`https://${domain}/cart/change.js`, {
      method: "POST",
      headers: changeHeaders,
      body: `line=1&quantity=${PROBE_QUANTITY}`,
    });
    const text = await changeResponse.text();
    if (isCloudflareChallenge(text)) {
      logger.warn("cartprobe.challenge blocked", { domain, variantId });
      return { quantity: null, available: null };
    }
    const outcome = parseChangeResponse(text, logger);
    if (changeResponse.status === 200 && outcome.quantity === null) {
      return { quantity: PROBE_QUANTITY, available: true };
    }
    return outcome;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("cartprobe.change failed", { domain, variantId, error: message });
    return { quantity: null, available: null };
  }
}

export function applyOutcome(variant: Variant, outcome: ProbeOutcome): Variant {
  if (outcome.quantity === null) {
    return variant;
  }
  const available = outcome.available === null ? variant.available : outcome.available;
  return {
    ...variant,
    available,
    quantity: outcome.quantity,
  };
}

export function buildCartProbeProvider(
  config: ProviderConfig,
  logger: Logger,
): StockRevealer {
  return buildStockRevealer(
    config,
    logger,
    async (): Promise<Catalog> => fetchShopifyCatalog(config.endpoint, config.domain, logger),
    async (target: StockRevealTarget): Promise<Catalog> => {
      const catalog = await fetchShopifyCatalog(config.endpoint, config.domain, logger);
      const wanted = new Set<string>(target.productIds);
      const products: Product[] = [];
      for (const product of catalog.products) {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          continue;
        }
        const variants: Variant[] = [];
        for (const variant of product.variants) {
          const outcome = await probeVariantStock(config.domain, variant.id, logger);
          variants.push(applyOutcome(variant, outcome));
        }
        products.push({ ...product, variants });
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    },
  );
}
