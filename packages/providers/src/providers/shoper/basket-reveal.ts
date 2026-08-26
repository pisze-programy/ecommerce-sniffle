import { buildStockRevealer } from '../../factory.ts';
import { truncateMessage } from '../../helpers.ts';
import { isCloudflareChallenge } from '../../captcha/detect.ts';
import { measureFetch } from '../../network/manager.ts';
import { mapPool } from '../../network/pool.ts';
import { ConcurrencyLimiter } from '../../network/limiter.ts';
import { createFreshFetch } from '../../network/fresh-fetch.ts';
import type { WrappedFetch } from '../../network/manager.ts';
import type { DirectFetch } from '../../module.ts';
import type { Logger } from '../../logger.ts';
import type {
  Catalog,
  Money,
  Product,
  ProviderConfig,
  StockRevealTarget,
  StockRevealer,
  Variant,
} from '../../types.ts';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MAX_PAGES = 1000;
const PROBE_QUANTITY = 999999999;
const LIST_LIMIT = 50;
const REVEAL_CONCURRENCY = 8;
const GLOBAL_CONCURRENCY = 12;
const MAX_COMBOS_PER_PRODUCT = 200;
const MAX_CONSECUTIVE_ADD_EMPTY = 15;

type CatalogFetch = WrappedFetch;

function money(amount: number): Money {
  return { amount, currency: 'PLN' };
}

export function parseBasketWarning(text: string): number | null {
  const patterns: readonly RegExp[] = [
    /(?:Aktualnie dost[ęe]pna ilo[śs][ćc] to:|Current stock is:).*-\s*(\d+)\s+szt/i,
    /Maksymalna dost[ęe]pna ilo[śs][ćc] to\s+(\d+)\s+szt/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match !== null) {
      return Number(match[1]);
    }
  }
  return null;
}

function parseListProduct(raw: unknown, domain: string): Product | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const obj = raw as Readonly<Record<string, unknown>>;
  if (typeof obj['id'] !== 'number' || typeof obj['stockId'] !== 'number') {
    return null;
  }
  const id = String(obj['id']);
  const name = typeof obj['name'] === 'string' ? obj['name'] : id;
  const url = typeof obj['url'] === 'string' ? obj['url'] : `https://${domain}/pl/p/${id}`;
  const canBuy = typeof obj['can_buy'] === 'boolean' ? obj['can_buy'] : false;
  const rawPrice = obj['price'];
  const priceObj =
    typeof rawPrice === 'object' && rawPrice !== null ? (rawPrice as Readonly<Record<string, unknown>>)['gross'] : null;
  const gross =
    typeof priceObj === 'object' && priceObj !== null ? (priceObj as Readonly<Record<string, unknown>>) : null;
  const finalFloat = typeof gross?.['final_float'] === 'number' ? gross['final_float'] : null;
  const baseFloat = typeof gross?.['base_float'] === 'number' ? gross['base_float'] : null;
  const base = baseFloat === null ? 0 : baseFloat;
  const final = finalFloat === null ? base : finalFloat;
  const regularPrice = base > final ? money(base) : null;
  const variants: Variant[] = [
    {
      id: String(obj['stockId']),
      title: 'default',
      sku: null,
      price: money(final),
      regularPrice,
      available: canBuy,
      quantity: canBuy ? null : 0,
    },
  ];
  return { id, title: name, url, variants };
}

export function parseShoperPages(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const obj = data as Readonly<Record<string, unknown>>;
  const pages = obj['pages'];
  if (typeof pages !== 'number') {
    return null;
  }
  return pages;
}

export function parseShoperList(data: unknown, domain: string): Product[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const obj = data as Readonly<Record<string, unknown>>;
  const list = Array.isArray(obj['list']) ? obj['list'] : [];
  const products: Product[] = [];
  for (const rawProduct of list) {
    const product = parseListProduct(rawProduct, domain);
    if (product !== null) {
      products.push(product);
    }
  }
  return products;
}

export async function fetchShoperCatalog(
  endpoint: string,
  domain: string,
  logger: Logger,
  fetchFn: CatalogFetch = fetch
): Promise<Catalog> {
  const products: Product[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let requestCount = 0;
  while (true) {
    if (requestCount >= MAX_PAGES) {
      throw new Error(`Shoper catalog too large for ${domain} (more than ${MAX_PAGES} pages)`);
    }
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${separator}limit=${LIST_LIMIT}&offset=${offset}`;
    const response = await fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} failed with status ${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = parseShoperList(data, domain);
    const before = products.length;
    for (const product of parsed) {
      if (!seen.has(product.id)) {
        seen.add(product.id);
        products.push(product);
      }
    }
    requestCount += 1;
    if (products.length === before) {
      break;
    }
    offset += parsed.length;
  }
  logger.debug('shoper catalog fetched', { domain, requests: requestCount, products: products.length });
  return { domain, fetchedAt: new Date().toISOString(), products };
}

function extractCookies(setCookie: string | null): string | null {
  if (setCookie === null) {
    return null;
  }
  const pairs: string[] = [];
  for (const part of setCookie.split(',')) {
    const match = /^\s*([^=;]+=[^;]+)/.exec(part);
    const value = match === null ? undefined : match[1];
    if (value !== undefined) {
      pairs.push(value);
    }
  }
  if (pairs.length === 0) {
    return null;
  }
  return pairs.join('; ');
}

export function extractCookiesFromResponse(
  headers: { get(name: string): string | null; getSetCookie?: () => string[] } | undefined
): string | null {
  if (headers === undefined) {
    return null;
  }
  const getSetCookie = headers.getSetCookie;
  const values = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : [];
  if (values.length > 0) {
    const pairs: string[] = [];
    for (const value of values) {
      const match = /^([^=;]+=[^;]+)/.exec(value);
      const cookie = match === null ? undefined : match[1];
      if (cookie !== undefined) {
        pairs.push(cookie);
      }
    }
    if (pairs.length === 0) {
      return null;
    }
    return pairs.join('; ');
  }
  return extractCookies(headers.get('set-cookie'));
}

export function extractWarning(text: string, logger: Logger): string | null {
  try {
    const data = JSON.parse(text) as Readonly<Record<string, unknown>>;
    const messenger = data['_flash_messenger'];
    if (typeof messenger === 'object' && messenger !== null) {
      const warnings = (messenger as Readonly<Record<string, unknown>>)['warning'];
      if (Array.isArray(warnings) && warnings.length > 0 && typeof warnings[0] === 'string') {
        return warnings[0];
      }
    }
    const flashMessages = data['flashMessages'];
    if (Array.isArray(flashMessages)) {
      for (const entry of flashMessages) {
        if (typeof entry === 'object' && entry !== null) {
          const message = (entry as Readonly<Record<string, unknown>>)['message'];
          if (typeof message === 'string') {
            return message;
          }
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('basketreveal.put response parse failed', { error: message });
  }
  return null;
}

function flashErrors(text: string): readonly string[] {
  try {
    const data = JSON.parse(text) as Readonly<Record<string, unknown>>;
    const errors: string[] = [];
    const messenger = data['_flash_messenger'];
    if (typeof messenger === 'object' && messenger !== null) {
      const raw = (messenger as Readonly<Record<string, unknown>>)['error'];
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (typeof entry === 'string') {
            errors.push(entry);
          }
        }
      }
    }
    const flashMessages = data['flashMessages'];
    if (Array.isArray(flashMessages)) {
      for (const entry of flashMessages) {
        if (typeof entry === 'object' && entry !== null) {
          const obj = entry as Readonly<Record<string, unknown>>;
          if (obj['isError'] === true && typeof obj['message'] === 'string') {
            errors.push(obj['message']);
          }
        }
      }
    }
    return errors;
  } catch {
    return [];
  }
}

export interface RevealOutcome {
  readonly quantity: number | null;
  readonly hasOptions: boolean;
}

function addedVariantLabel(added: ReadonlyArray<unknown>): string | null {
  const first = added[0];
  if (typeof first !== 'object' || first === null) {
    return null;
  }
  const rawVariant = (first as Readonly<Record<string, unknown>>)['variant'];
  if (typeof rawVariant !== 'string') {
    return null;
  }
  const label = rawVariant.trim();
  return label.length === 0 ? null : label;
}

export async function revealVariant(
  domain: string,
  stockId: number,
  logger: Logger,
  options: Readonly<Record<string, string>> = {},
  fetchFn: WrappedFetch = fetch
): Promise<RevealOutcome> {
  const origin = `https://${domain}`;
  const baseHeaders: Readonly<Record<string, string>> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Origin: origin,
  };
  const basket = `${origin}/webapi/front/pl_PL/basket/PLN`;
  let itemId: number | null = null;
  try {
    const addResponse = await fetchFn(`${basket}/`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ quantity: PROBE_QUANTITY, stock_id: stockId, options }),
    });
    const addText = await addResponse.text();
    if (isCloudflareChallenge(addText)) {
      logger.warn('basketreveal.challenge blocked', { domain, stockId });
      return { quantity: null, hasOptions: false };
    }
    if (!addResponse.ok) {
      throw new Error(`basket add failed with status ${addResponse.status}: ${truncateMessage(addText)}`);
    }
    let added: ReadonlyArray<unknown> = [];
    let addedQuantity: number | null = null;
    let basketQuantity: number | null = null;
    try {
      const data = JSON.parse(addText) as Readonly<Record<string, unknown>>;
      const rawAdded = data['added'];
      if (Array.isArray(rawAdded)) {
        added = rawAdded;
      }
      const rawAddedItem = data['addedItem'];
      if (typeof rawAddedItem === 'object' && rawAddedItem !== null) {
        const addedItem = rawAddedItem as Readonly<Record<string, unknown>>;
        const rawQuantity = addedItem['quantity'];
        if (typeof rawQuantity === 'number') {
          addedQuantity = rawQuantity;
        }
        const rawAddedQuantity = addedItem['addedQuantity'];
        if (addedQuantity === null && typeof rawAddedQuantity === 'number') {
          addedQuantity = rawAddedQuantity;
        }
      }
      const rawBasket = data['basket'];
      if (typeof rawBasket === 'object' && rawBasket !== null) {
        const rawItems = (rawBasket as Readonly<Record<string, unknown>>)['items'];
        if (typeof rawItems === 'object' && rawItems !== null) {
          const list = (rawItems as Readonly<Record<string, unknown>>)['list'];
          if (Array.isArray(list)) {
            for (const entry of list) {
              if (typeof entry !== 'object' || entry === null) {
                continue;
              }
              const item = entry as Readonly<Record<string, unknown>>;
              if (item['variantId'] !== stockId) {
                continue;
              }
              const rawQuantity = item['quantity'];
              if (typeof rawQuantity === 'number') {
                basketQuantity = rawQuantity;
              }
              break;
            }
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('basketreveal.add response parse failed', { domain, stockId, error: message });
    }
    const hasOptions = addedVariantLabel(added) !== null;
    if (addedQuantity !== null) {
      return { quantity: addedQuantity, hasOptions };
    }
    const addWarning = extractWarning(addText, logger);
    if (addWarning !== null) {
      const quantity = parseBasketWarning(addWarning);
      if (quantity !== null) {
        const first = added[0];
        if (typeof first === 'object' && first !== null) {
          const rawId = (first as Readonly<Record<string, unknown>>)['id'];
          if (typeof rawId === 'number') {
            itemId = rawId;
          }
        }
        return { quantity, hasOptions };
      }
    }
    if (basketQuantity !== null) {
      return { quantity: basketQuantity, hasOptions };
    }
    const first = added[0];
    if (typeof first !== 'object' || first === null) {
      const unavailable = flashErrors(addText).some((entry) =>
        /nieaktywn|wyprzedan|sold out|out of stock|niedost[ęe]pn/i.test(entry)
      );
      if (unavailable) {
        return { quantity: 0, hasOptions };
      }
      logger.warn('basketreveal.add empty for variant product', { domain, stockId });
      return { quantity: null, hasOptions };
    }
    const firstObj = first as Readonly<Record<string, unknown>>;
    if (typeof firstObj['id'] !== 'number') {
      logger.warn('basketreveal.add has no item id', { domain, stockId });
      return { quantity: null, hasOptions };
    }
    itemId = firstObj['id'];
    const cookie = extractCookiesFromResponse(addResponse.headers);
    const putHeaders: Readonly<Record<string, string>> =
      cookie === null ? { ...baseHeaders } : { ...baseHeaders, Cookie: cookie };
    const putResponse = await fetchFn(`${basket}/${String(itemId)}/`, {
      method: 'PUT',
      headers: putHeaders,
      body: JSON.stringify({ quantity: PROBE_QUANTITY }),
    });
    const putText = await putResponse.text();
    if (isCloudflareChallenge(putText)) {
      logger.warn('basketreveal.challenge blocked', { domain, stockId });
      return { quantity: null, hasOptions: false };
    }
    const warning = extractWarning(putText, logger);
    if (warning !== null) {
      const quantity = parseBasketWarning(warning);
      if (quantity !== null) {
        return { quantity, hasOptions: false };
      }
    }
    return { quantity: parseBasketWarning(putText), hasOptions: false };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('basketreveal failed', { domain, stockId, error: message });
    return { quantity: null, hasOptions: false };
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
    if (typeof rawGroup !== 'object' || rawGroup === null) {
      continue;
    }
    const group = rawGroup as Readonly<Record<string, unknown>>;
    const rawId = group['id'];
    const name = group['name'];
    const rawValues = group['values'];
    const rawType = group['type'];
    if ((typeof rawId !== 'number' && typeof rawId !== 'string') || typeof name !== 'string') {
      continue;
    }
    const values: OptionValue[] = [];
    if (Array.isArray(rawValues)) {
      for (const rawValue of rawValues) {
        if (typeof rawValue !== 'object' || rawValue === null) {
          continue;
        }
        const value = rawValue as Readonly<Record<string, unknown>>;
        const valueId = value['id'];
        const valueName = value['name'];
        if ((typeof valueId !== 'number' && typeof valueId !== 'string') || typeof valueName !== 'string') {
          continue;
        }
        values.push({ id: String(valueId), name: valueName });
      }
    }
    if (values.length === 0 && rawType === 'text') {
      values.push({ id: 'x', name: '(text)' });
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
      combos.push({ options: { ...options }, label: parts.join(', ') });
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
  fetchFn: CatalogFetch = fetch
): Promise<unknown> {
  const origin = `https://${domain}`;
  try {
    const response = await fetchFn(`${origin}/webapi/front/pl_PL/products/PLN/${productId}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) {
      logger.warn('basketreveal.product detail failed', {
        domain,
        productId,
        status: response.status,
      });
      return null;
    }
    const data = (await response.json()) as Readonly<Record<string, unknown>>;
    return data['options_configuration'];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('basketreveal.product detail error', { domain, productId, error: message });
    return null;
  }
}

export async function revealProduct(
  domain: string,
  product: Product,
  logger: Logger,
  fetchFn: CatalogFetch = fetch,
  comboConcurrency: number = REVEAL_CONCURRENCY,
  limiter?: ConcurrencyLimiter
): Promise<Variant[]> {
  const baseVariant = product.variants[0];
  if (baseVariant === undefined) {
    return [];
  }
  const base = baseVariant;
  if (!base.available) {
    return [{ ...base, quantity: 0, available: false }];
  }
  const stockId = Number(base.id);
  const simple = await revealVariant(domain, stockId, logger, {}, fetchFn);
  if (simple.quantity !== null && !simple.hasOptions) {
    return [{ ...base, quantity: simple.quantity, available: simple.quantity > 0 }];
  }
  const configuration = await fetchOptionConfiguration(domain, product.id, logger, fetchFn);
  const combos = buildOptionCombos(configuration);
  if (combos.length === 0) {
    return [...product.variants];
  }
  const explosion = combos.length > MAX_COMBOS_PER_PRODUCT;
  const probed = explosion ? combos.slice(0, MAX_COMBOS_PER_PRODUCT) : combos;
  if (explosion) {
    logger.warn('basketreveal.option explosion', {
      domain,
      productId: product.id,
      combos: combos.length,
      cappedTo: MAX_COMBOS_PER_PRODUCT,
    });
  }
  const revealed: Variant[] = [];
  function pushCombo(combo: OptionCombo, outcome: RevealOutcome): void {
    if (outcome.quantity !== null) {
      revealed.push({
        ...base,
        id: `${product.id}-${combo.label}`,
        title: combo.label,
        quantity: outcome.quantity,
        available: outcome.quantity > 0,
      });
    }
  }
  if (explosion) {
    let consecutiveEmpty = 0;
    for (const combo of probed) {
      const outcome = await revealVariant(domain, stockId, logger, combo.options, fetchFn);
      if (outcome.quantity === null) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= MAX_CONSECUTIVE_ADD_EMPTY) {
          logger.warn('basketreveal.dead combos', {
            domain,
            productId: product.id,
            consecutiveEmpty,
          });
          break;
        }
      } else {
        consecutiveEmpty = 0;
      }
      pushCombo(combo, outcome);
    }
  } else {
    const comboResults = await mapPool(
      probed,
      comboConcurrency,
      async (combo) => {
        const outcome = await revealVariant(domain, stockId, logger, combo.options, fetchFn);
        return { combo, outcome };
      },
      limiter
    );
    for (const entry of comboResults) {
      pushCombo(entry.combo, entry.outcome);
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
  directFetch?: DirectFetch
): StockRevealer {
  // The catalog is a public storefront GET. It works direct from the
  // VPS IP. Routing it direct cuts the webshare transfer by about half.
  const rawCatalogFetch = (input: string | URL | Request, init?: RequestInit, options?: { maxBytes?: number }) => {
    const url = String(input);
    if (directFetch !== undefined) {
      return directFetch(url, init, options);
    }
    return fetch(url, init);
  };
  const catalogFetch = measureFetch(rawCatalogFetch, logger, config.id, 'direct');
  const proxyUrl = process.env['HTTPS_PROXY'] ?? process.env['WEBSHARE_URL'] ?? null;
  const probeFetch = measureFetch(createFreshFetch(proxyUrl), logger, config.id, 'proxy');
  const limiter = new ConcurrencyLimiter(GLOBAL_CONCURRENCY);
  return buildStockRevealer(
    config,
    logger,
    async (): Promise<Catalog> => fetchShoperCatalog(config.endpoint, config.domain, logger, catalogFetch),
    async (target: StockRevealTarget): Promise<Catalog> => {
      const catalog = await fetchShoperCatalog(config.endpoint, config.domain, logger, catalogFetch);
      const wanted = new Set<string>(target.productIds);
      const excluded = new Set<number>(config.excludedStockIds ?? []);
      const targets = catalog.products.filter((product) => {
        if (wanted.size > 0 && !wanted.has(product.id)) {
          return false;
        }
        const first = product.variants[0];
        if (first === undefined) {
          return false;
        }
        return !excluded.has(Number(first.id));
      });
      if (excluded.size > 0) {
        logger.info('basketreveal.excluded', {
          domain: config.domain,
          excludedIds: [...excluded].join(','),
          remaining: targets.length,
        });
      }
      const revealed = await mapPool(
        targets,
        REVEAL_CONCURRENCY,
        async (product) => {
          const variants = await revealProduct(config.domain, product, logger, probeFetch, REVEAL_CONCURRENCY, limiter);
          return { ...product, variants };
        },
        limiter
      );
      return { domain: config.domain, fetchedAt: new Date().toISOString(), products: revealed };
    }
  );
}
