// SQL for the three Google ads jobs. See docs/GOOGLE-ADS.md.
// Each query projects only the needed leaf columns. The table has no
// partition and no cluster, so a WHERE filter does not prune bytes.
// Only column pruning reduces the scan.

const BQ_DATASET = 'bigquery-public-data.google_ads_transparency_center.creative_stats';

export type GoogleFetchMode = 'core' | 'static' | 'surfaces';

function idList(advertiserIds: readonly string[]): string {
  return advertiserIds.map((id) => `'${id.replace(/'/g, '')}'`).join(',');
}

function regionArray(fields: string): string {
  return `ARRAY(SELECT AS STRUCT ${fields} FROM UNNEST(region_stats) AS r) AS region_stats`;
}

export function buildSql(mode: GoogleFetchMode, advertiserIds: readonly string[]): string {
  const list = idList(advertiserIds);
  if (mode === 'core') {
    const region = regionArray('r.region_code, r.last_shown, r.times_shown_lower_bound, r.times_shown_upper_bound');
    return `SELECT advertiser_id, creative_id, ${region} FROM \`${BQ_DATASET}\` WHERE advertiser_id IN (${list})`;
  }
  if (mode === 'static') {
    const region = regionArray('r.region_code, r.first_shown');
    return `SELECT advertiser_id, creative_id, ad_format_type, topic, ${region} FROM \`${BQ_DATASET}\` WHERE advertiser_id IN (${list})`;
  }
  const region = regionArray('r.region_code, r.surface_serving_stats');
  return `SELECT advertiser_id, creative_id, ${region} FROM \`${BQ_DATASET}\` WHERE advertiser_id IN (${list})`;
}
