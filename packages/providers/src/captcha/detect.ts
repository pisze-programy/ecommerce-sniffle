export function isCloudflareChallenge(text: string): boolean {
  return (
    text.includes('_cf_chl_opt') ||
    text.includes('Verifying your connection') ||
    text.includes('challenge-platform') ||
    text.includes("cType: 'managed'")
  );
}

export function findTurnstileSitekey(text: string): string | null {
  const match = /data-sitekey="([^"]+)"/.exec(text);
  if (match === null) {
    return null;
  }
  const value = match[1];
  if (value === undefined || value.length === 0) {
    return null;
  }
  return value;
}
