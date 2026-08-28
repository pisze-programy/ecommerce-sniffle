export const COUNTDOWN_DOMAINS: readonly string[] = ['wkdzik.pl', 'laboratoriumpanidomu.pl', 'osmpower.pl'];

export function isCountdownShop(domain: string): boolean {
  return COUNTDOWN_DOMAINS.includes(domain);
}
