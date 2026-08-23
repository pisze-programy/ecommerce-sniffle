import { buildStockRevealer } from "../../factory.ts";
import { truncateMessage } from "../../helpers.ts";
import { isCloudflareChallenge } from "../../captcha/detect.ts";
import type { Logger } from "../../logger.ts";
import type {
  Catalog,
  Money,
  Product,
  ProviderConfig,
  StockRevealTarget,
  StockRevealer,
  Variant,
} from "../../types.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_PAGES = 1000;
const PROBE_QUANTITY = 999999999;

function money(amount: number): Money {
  return { amount, currency: "PLN" };
}

export function parseBasketWarning(text: string): number | null {
  const match = /Aktualnie dost[ęe]pna ilo[śs][ćc] to:.*?-\s*(\d+)\s+szt/i.exec(text);
  if (match !== null) {
    return Number(match[1]);
  }
  return null;
}

function parseListProduct(raw: unknown, domain: string): Product | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const obj = raw as Readonly<Record<string, unknown>>;
  if (typeof obj["id"] !== "number" || typeof obj["stockId"] !== "number") {
    return null;
  }
  const id = String(obj["id"]);
  const name = typeof obj["name"] === "string" ? obj["name"] : id;
  const url = typeof obj["url"] === "string" ? obj["url"] : `https://${domain}/pl/p/${id}`;
  const canBuy = typeof obj["can_buy"] === "boolean" ? obj["can_buy"] : false;
  const rawPrice = obj["price"];
  const priceObj =
    typeof rawPrice === "object" && rawPrice !== null
      ? (rawPrice as Readonly<Record<string, unknown>>)["gross"]
      : null;
  const gross =
    typeof priceObj === "object" && priceObj !== null
      ? (priceObj as Readonly<Record<string, unknown>>)
      : null;
  const finalFloat = typeof gross?.["final_float"] === "number" ? gross["final_float"] : null;
  const baseFloat = typeof gross?.["base_float"] === "number" ? gross["base_float"] : null;
  const base = baseFloat === null ? 0 : baseFloat;
  const final = finalFloat === null ? base : finalFloat;
  const regularPrice = base > final ? money(base) : null;
  const variants: Variant[] = [
    {
      id: String(obj["stockId"]),
      title: "default",
      sku: null,
      price: money(final),
      regularPrice,
      available: canBuy,
      quantity: null,
    },
  ];
  return { id, title: name, url, variants };
}

export function parseShoperPages(data: unknown): number | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const obj = data as Readonly<Record<string, unknown>>;
  const pages = obj["pages"];
  if (typeof pages !== "number") {
    return null;
  }
  return pages;
}

export function parseShoperList(data: unknown, domain: string): Product[] {
  if (typeof data !== "object" || data === null) {
    return [];
  }
  const obj = data as Readonly<Record<string, unknown>>;
  const list = Array.isArray(obj["list"]) ? obj["list"] : [];
  const products: Product[] = [];
  for (const rawProduct of list) {
    const product = parseListProduct(rawProduct, domain);
    if (product !== null) {
      products.push(product);
    }
  }
  return products;
}

async function fetchShoperCatalog(
  endpoint: string,
  domain: string,
  logger: Logger,
): Promise<Catalog> {
  const products: Product[] = [];
  const seen = new Set<string>();
  let page = 1;
  let totalPages: number | null = null;
  while (true) {
    if (page > MAX_PAGES) {
      throw new Error(`Shoper catalog too large for ${domain} (more than ${MAX_PAGES} pages)`);
    }
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${endpoint}${separator}page=${page}`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} failed with status ${response.status}`);
    }
    const data: unknown = await response.json();
    if (totalPages === null) {
      totalPages = parseShoperPages(data);
    }
    for (const product of parseShoperList(data, domain)) {
      if (!seen.has(product.id)) {
        seen.add(product.id);
        products.push(product);
      }
    }
    if (totalPages !== null && page >= totalPages) {
      break;
    }
    page += 1;
  }
  logger.debug("shoper catalog fetched", { domain, pages: page - 1, products: products.length });
  return { domain, fetchedAt: new Date().toISOString(), products };
}

function extractCookies(setCookie: string | null): string | null {
  if (setCookie === null) {
    return null;
  }
  const pairs: string[] = [];
  for (const part of setCookie.split(",")) {
    const match = /^\s*([^=;]+=[^;]+)/.exec(part);
    const value = match === null ? undefined : match[1];
    if (value !== undefined) {
      pairs.push(value);
    }
  }
  if (pairs.length === 0) {
    return null;
  }
  return pairs.join("; ");
}

export function extractWarning(text: string, logger: Logger): string | null {
  try {
    const data = JSON.parse(text) as Readonly<Record<string, unknown>>;
    const messenger = data["_flash_messenger"];
    if (typeof messenger === "object" && messenger !== null) {
      const warnings = (messenger as Readonly<Record<string, unknown>>)["warning"];
      if (Array.isArray(warnings) && warnings.length > 0 && typeof warnings[0] === "string") {
        return warnings[0];
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("basketreveal.put response parse failed", { error: message });
  }
  return null;
}

export async function revealVariant(
  domain: string,
  stockId: number,
  logger: Logger,
  options: Readonly<Record<string, string>> = {},
): Promise<number | null> {
  const origin = `https://${domain}`;
  const baseHeaders: Readonly<Record<string, string>> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: origin,
  };
  const basket = `${origin}/webapi/front/pl_PL/basket/PLN`;
  let itemId: number | null = null;
  try {
    const addResponse = await fetch(`${basket}/`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ quantity: 1, stock_id: stockId, options }),
    });
    const addText = await addResponse.text();
    if (isCloudflareChallenge(addText)) {
      logger.warn("basketreveal.challenge blocked", { domain, stockId });
      return null;
    }
    if (!addResponse.ok) {
      throw new Error(`basket add failed with status ${addResponse.status}: ${truncateMessage(addText)}`);
    }
    let added: ReadonlyArray<unknown> = [];
    try {
      const data = JSON.parse(addText) as Readonly<Record<string, unknown>>;
      const rawAdded = data["added"];
      if (Array.isArray(rawAdded)) {
        added = rawAdded;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("basketreveal.add response parse failed", { domain, stockId, error: message });
    }
    const first = added[0];
    if (typeof first !== "object" || first === null) {
      logger.warn("basketreveal.add empty for variant product", { domain, stockId });
      return null;
    }
    const firstObj = first as Readonly<Record<string, unknown>>;
    if (typeof firstObj["id"] !== "number") {
      logger.warn("basketreveal.add has no item id", { domain, stockId });
      return null;
    }
    itemId = firstObj["id"];
    const cookie = extractCookies(addResponse.headers.get("set-cookie"));
    const putHeaders: Readonly<Record<string, string>> =
      cookie === null ? { ...baseHeaders } : { ...baseHeaders, Cookie: cookie };
    const putResponse = await fetch(`${basket}/${String(itemId)}/`, {
      method: "PUT",
      headers: putHeaders,
      body: JSON.stringify({ quantity: PROBE_QUANTITY }),
    });
    const putText = await putResponse.text();
    if (isCloudflareChallenge(putText)) {
      logger.warn("basketreveal.challenge blocked", { domain, stockId });
      return null;
    }
    const warning = extractWarning(putText, logger);
    if (warning !== null) {
      const quantity = parseBasketWarning(warning);
      if (quantity !== null) {
        return quantity;
      }
    }
    return parseBasketWarning(putText);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("basketreveal failed", { domain, stockId, error: message });
    return null;
  } finally {
    if (itemId !== null) {
      try {
        await fetch(`${basket}/${String(itemId)}/`, { method: "DELETE", headers: baseHeaders });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug("basketreveal.cleanup failed", { domain, itemId, error: message });
      }
    }
  }
}

export interface OptionCombo {
  readonly options: Readonly<Record<string, string>>;
  readonly label: string;
}

interface OptionValue {
  readonly id: string;
  readonly name: string;
}

interface OptionGroup {
  readonly id: string;
  readonly name: string;
  readonly values: readonly OptionValue[];
}

function parseOptionGroups(configuration: unknown): OptionGroup[] {
  if (!Array.isArray(configuration)) {
    return [];
  }
  const groups: OptionGroup[] = [];
  for (const rawGroup of configuration) {
    if (typeof rawGroup !== "object" || rawGroup === null) {
      continue;
    }
    const group = rawGroup as Readonly<Record<string, unknown>>;
    const rawId = group["id"];
    const name = group["name"];
    const rawValues = group["values"];
    if ((typeof rawId !== "number" && typeof rawId !== "string") || typeof name !== "string") {
      continue;
    }
    if (!Array.isArray(rawValues)) {
      continue;
    }
    const values: OptionValue[] = [];
    for (const rawValue of rawValues) {
      if (typeof rawValue !== "object" || rawValue === null) {
        continue;
      }
      const value = rawValue as Readonly<Record<string, unknown>>;
      const valueId = value["id"];
      const valueName = value["name"];
      if ((typeof valueId !== "number" && typeof valueId !== "string") || typeof valueName !== "string") {
        continue;
      }
      values.push({ id: String(valueId), name: valueName });
    }
    if (values.length === 0) {
      continue;
    }
    groups.push({ id: String(rawId), name, values });
  }
  return groups;
}

export function buildOptionCombos(configuration: unknown): OptionCombo[] {
  const groups = parseOptionGroups(configuration);
  if (groups.length === 0) {
    return [];
  }
  const combos: OptionCombo[] = [];
  function walk(index: number, options: Record<string, string>, parts: string[]): void {
    if (index >= groups.length) {
      combos.push({ options: { ...options }, label: parts.join(", ") });
      return;
    }
    const group = groups[index];
    if (group === undefined) {
      return;
    }
    for (const value of group.values) {
      walk(index + 1, { ...options, [group.id]: value.id }, [...parts, `${group.name}: ${value.name}`]);
    }
  }
  walk(0, {}, []);
  return combos;
}

async function fetchOptionConfiguration(
  domain: string,
  productId: string,
  logger: Logger,
): Promise<unknown> {
  const origin = `https://${domain}`;
  try {
    const response = await fetch(
      `${origin}/webapi/front/pl_PL/products/PLN/${productId}`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    );
    if (!response.ok) {
      logger.warn("basketreveal.product detail failed", {
        domain,
        productId,
        status: response.status,
      });
      return null;
    }
    const data = (await response.json()) as Readonly<Record<string, unknown>>;
    return data["options_configuration"];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("basketreveal.product detail error", { domain, productId, error: message });
    return null;
  }
}

export async function revealProduct(domain: string, product: Product, logger: Logger): Promise<Variant[]> {
  const baseVariant = product.variants[0];
  if (baseVariant === undefined) {
    return [];
  }
  const stockId = Number(baseVariant.id);
  const simple = await revealVariant(domain, stockId, logger);
  if (simple !== null) {
    return [{ ...baseVariant, quantity: simple, available: simple > 0 }];
  }
  const configuration = await fetchOptionConfiguration(domain, product.id, logger);
  const combos = buildOptionCombos(configuration);
  if (combos.length === 0) {
    return [...product.variants];
  }
  const revealed: Variant[] = [];
  for (const combo of combos) {
    const quantity = await revealVariant(domain, stockId, logger, combo.options);
    if (quantity !== null) {
      revealed.push({
        ...baseVariant,
        id: `${product.id}-${combo.label}`,
        title: combo.label,
        quantity,
        available: quantity > 0,
      });
    }
  }
  if (revealed.length === 0) {
    return [...product.variants];
  }
  return revealed;
}

export function buildBasketRevealProvider(
  config: ProviderConfig,
  logger: Logger,
): StockRevealer {
  return buildStockRevealer(
    config,
    logger,
    async (): Promise<Catalog> => fetchShoperCatalog(config.endpoint, config.domain, logger),
    async (target: StockRevealTarget): Promise<Catalog> => {
      const catalog = await fetchShoperCatalog(config.endpoint, config.domain, logger);
      const wanted = new Set<string>(target.productIds);
      const products: Product[] = [];
      for (const product of catalog.products) {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          continue;
        }
        const variants = await revealProduct(config.domain, product, logger);
        products.push({ ...product, variants });
      }
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products };
    },
  );
}
