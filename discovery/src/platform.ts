// Detect the shop platform from the homepage response.

export type Platform = 'shopify' | 'shoper' | 'prestashop' | 'woocommerce' | 'wordpress' | 'wix' | 'other';

// Detect the platform from the HTTP status and the homepage body.
export function detectPlatform(status: number, html: string): Platform {
  if (status !== 200) {
    return 'other';
  }
  const generator = /<meta\s+name="generator"\s+content="([^"]+)"[^>]*>/i.exec(html);
  if (generator !== null) {
    const value = generator[1]?.toLowerCase() ?? '';
    if (value.includes('prestashop')) {
      return 'prestashop';
    }
    if (value.includes('shoper')) {
      return 'shoper';
    }
    if (value.includes('shopify')) {
      return 'shopify';
    }
    if (value.includes('wix')) {
      return 'wix';
    }
    if (value.includes('wordpress')) {
      return 'wordpress';
    }
    if (value.includes('woocommerce')) {
      return 'woocommerce';
    }
  }
  const lower = html.toLowerCase();
  if (lower.includes('cdn.shopify.com') || lower.includes('myshopify.com')) {
    return 'shopify';
  }
  if (
    lower.includes('shoper') ||
    lower.includes('shopapi') ||
    lower.includes('iai-shop') ||
    lower.includes('atomstore')
  ) {
    return 'shoper';
  }
  if (lower.includes('wp-content') && (lower.includes('woocommerce') || lower.includes('woo-'))) {
    return 'woocommerce';
  }
  if (lower.includes('wp-content')) {
    return 'wordpress';
  }
  if (lower.includes('wixstatic.com')) {
    return 'wix';
  }
  if (lower.includes('prestashop')) {
    return 'prestashop';
  }
  return 'other';
}

// Detect the platform from the product image CDN host.
// The shop page probe may be rate-limited. The CDN stays readable.
export function detectPlatformFromCdn(host: string): Platform | null {
  const lower = host.toLowerCase();
  if (lower.includes('shopify.com') || lower.includes('myshopify')) {
    return 'shopify';
  }
  if (lower.includes('iai-shop') || lower.includes('shoper')) {
    return 'shoper';
  }
  if (lower.includes('prestashop')) {
    return 'prestashop';
  }
  if (lower.includes('wixstatic')) {
    return 'wix';
  }
  return null;
}
