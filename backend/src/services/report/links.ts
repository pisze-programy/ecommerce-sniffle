import { badge, esc } from '../report-components.ts';

export function productUrl(map: Map<string, string>, productId: string): string | null {
  const url = map.get(productId);
  if (url !== undefined) {
    return url;
  }
  if (/^https?:\/\//.test(productId)) {
    return productId;
  }
  return null;
}

export function productLink(map: Map<string, string>, productId: string): string {
  const url = productUrl(map, productId);
  if (url === null) {
    return `${esc(productId)} ${badge('brak linku', 'gray')}`;
  }
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(productId)}</a>`;
}

export function shopifyVariantUrl(url: string, variantId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}variant=${variantId}`;
}

export function variantCell(
  urlMap: Map<string, string>,
  productId: string,
  variantId: string,
  platform: string
): string {
  const url = productUrl(urlMap, productId);
  if (platform === 'shopify' && url !== null) {
    return `<a href="${esc(shopifyVariantUrl(url, variantId))}" target="_blank" rel="noopener">${esc(variantId)}</a>`;
  }
  return esc(variantId);
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
