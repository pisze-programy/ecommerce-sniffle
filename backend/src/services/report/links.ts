import { badge, esc } from '../report-components.ts';
import type { ShopNames } from '../storage.ts';

const PLACEHOLDER_TITLES = new Set(['default', 'Default Title']);

function usefulTitle(title: string | undefined): string | null {
  if (title === undefined || title.length === 0) {
    return null;
  }
  if (PLACEHOLDER_TITLES.has(title)) {
    return null;
  }
  return title;
}

export function productUrl(names: ShopNames, productId: string): string | null {
  const url = names.productUrls.get(productId);
  if (url !== undefined) {
    return url;
  }
  if (/^https?:\/\//.test(productId)) {
    return productId;
  }
  return null;
}

export function productLink(names: ShopNames, productId: string): string {
  const url = productUrl(names, productId);
  const resolved = usefulTitle(names.productTitles.get(productId));
  const text = resolved === null ? '--' : resolved;
  if (url === null) {
    return `${esc(text)} ${badge('brak linku', 'gray')}`;
  }
  return `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(productId)}">${esc(text)}</a>`;
}

export function shopifyVariantUrl(url: string, variantId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}variant=${variantId}`;
}

// A placeholder or missing title gets dashes. The id is never shown as
// a name; it stays in the title attribute for reference.
export function variantCell(names: ShopNames, productId: string, variantId: string, platform: string): string {
  const url = productUrl(names, productId);
  const resolved = usefulTitle(names.variantTitles.get(variantId));
  const text = resolved === null ? '---' : resolved;
  if (platform === 'shopify' && url !== null) {
    return `<a href="${esc(shopifyVariantUrl(url, variantId))}" target="_blank" rel="noopener" title="${esc(variantId)}">${esc(text)}</a>`;
  }
  return esc(text);
}

export function confidenceLabel(confidence: string): string {
  switch (confidence) {
    case 'exact':
      return 'pewna';
    case 'masked':
      return 'oszacowana';
    case 'low':
      return 'niska';
    case 'lower-bound':
      return 'dolna granica';
    default:
      return confidence;
  }
}

export function confidenceBadge(confidence: string): string {
  const tone = confidence === 'exact' ? 'green' : confidence === 'masked' ? 'yellow' : 'gray';
  return badge(confidenceLabel(confidence), tone);
}
