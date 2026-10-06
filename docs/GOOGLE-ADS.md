# GOOGLE-ADS.md

## Purpose

Google Ads is a data source.
It collects raw Google ad data for each tracked shop.
It works like the Meta ads collector.
It does the collection once per day.
It stores the data for later calculations.

Analytics is a separate module.
It will combine Meta ads, Google ads, TikTok ads, and stock.
This module only collects data. It does no analytics.
It does not estimate spend. It does not compute CPA.

This file is the implementation handbook.
It records the API discovery.
A new agent must not repeat the discovery.
The facts below are verified and current.

## Data source

Google ships no API for commercial ads.
Use the public BigQuery dataset instead:

```
bigquery-public-data.google_ads_transparency_center.creative_stats
```

The dataset holds commercial ads shown in the EEA and Turkey only.
Ads shown outside the EEA are not in the dataset.

Verified on 2026-10-02:

- The table holds 163 140 756 rows and 131.29 GB of logical data.
- The table has no partition and no cluster.
- A `WHERE advertiser_id IN (...)` filter does not prune bytes.
- Only column pruning reduces the scan.

Request only these columns and subfields:

```
advertiser_id, creative_id,
ad_format_type, topic,
region_stats.region_code, region_stats.first_shown,
region_stats.last_shown, region_stats.times_shown_lower_bound,
region_stats.times_shown_upper_bound,
region_stats.surface_serving_stats
```

Do not request these columns. The card does not use them:

- `audience_selection_approach_info` (19.71 GB)
- `advertiser_disclosed_name` (7.18 GB)
- `creative_page_url` (19.14 GB, the report builds the URL from the ids)
- `region_stats.times_shown_start_date`, `times_shown_end_date`,
  `times_shown_availability_date` (about 11 GB together)

The surfaces job still reads the nested `surface_serving_stats` record.
That record holds its own `times_shown_availability_date`.
The saving is small, so the job keeps the whole record.

Verified on 2026-09-03:

- `region_stats` holds one entry per country plus an `EEA` aggregate.
- `times_shown_lower_bound` and `times_shown_upper_bound` are lifetime
  bounds since 2023-03-01, not daily rows.
- `surface_serving_stats` splits bounds per surface:
  YOUTUBE, SEARCH, SHOPPING, MAPS, PLAY.
- The dataset holds no creative text. Only the format and the topic.
- The dataset holds no spend.

## Access

BigQuery needs OAuth, not an API key.
The worker signs a service account JWT with WebCrypto RS256.
It exchanges the JWT for an access token.
It calls `jobs.query` with a dry run first, then the real query.
A slow query is polled through `queries.get`.

Store the service account JSON as the secret `GOOGLE_BQ_KEY`.
The project id comes from the key file. No second secret.
The local copy lives in `backend/.dev.vars`.
The remote copy is a Cloudflare secret.
Set it with:

```
npx wrangler secret put GOOGLE_BQ_KEY < key.json
```

The service account needs `BigQuery Job User` on the project.
The first 1 TB per month is free.
The collector splits the read into three jobs to stay under the free tier:

| Job      | Columns                         | Scan     | Cadence | GB/month |
| -------- | ------------------------------- | -------- | ------- | -------- |
| core     | region code, last shown, bounds | 22.33 GB | daily   | ~679     |
| static   | format, topic, first shown      | 19 GB    | weekly  | ~83      |
| surfaces | surface serving stats           | 55.94 GB | monthly | ~56      |
| **all**  |                                 |          |         | **~818** |

The old note said "10-20 GB per day". That was wrong.
Every job sets `maximumBytesBilled` to 80 GB.
The worker logs the real `totalBytesProcessed` as `googleads.bytesProcessed`.
The worker reads every result page through the `pageToken` cursor.

## Advertiser ids

The join key is `advertiser_id` (`AR...`). One row group per creative.
Resolve the id by hand in the Transparency Center UI:

1. Search the shop domain with `region=PL`.
2. The advertiser page URL holds the `AR...` id.
3. Check the disclosed name against the brand.
4. Store the id with an `UPDATE entities` migration.

Name search is noisy. Substring matches return foreign brands.
A domain with exactly one advertiser behind it is certain.
Two advertisers behind one domain need a hand pick.
No results in `region=PL` and `region=anywhere` means no ads.
A global-only advertiser (US ads) stays empty on purpose.
The dataset scope is EEA and Turkey.

Verified resolutions (2026-09-03, 20 shops):

| Shop                 | Advertiser id          |
| -------------------- | ---------------------- |
| laboratoriumpanidomu | AR10613569593844695041 |
| theodderside         | AR10850101757892100097 |
| gymglamour           | AR02624468714300375041 |
| icedstuff            | AR18296250412522536961 |
| rever                | AR05111126874558300161 |
| nago                 | AR13839609621104295937 |
| risky                | AR08078258172906700801 |
| wkdzik               | AR04836597633059389441 |
| godsavequeens        | AR00552899729948672001 |
| dives-med            | AR15120398607125053441 |
| dobrerzeczy          | AR09370252548214095873 |
| hdrey-group          | AR05771715255822450689 |
| icon-amsterdam       | AR01891244945637900289 |
| premieresociety      | AR01494687084735102977 |
| royalwatch           | AR05788728506045169665 |
| wojanshop            | AR14394729058871017473 |
| e-daag               | AR09877526823397490689 |
| patandrub            | AR02480555544306253825 |
| zerosklep            | AR07798408660928954369 |
| beaumont             | AR15511961721710313473 |

Laboratorium Pani Domu proof: 352 creatives, PL entries fresh
to 2026-09-02, 22 creatives with `last_shown` in the last 7 days.

## Active rule

The dataset has no active flag.
An ad counts as active when `last_shown` is at most 7 days old.
The read filters on `last_shown >= today - 7`.
No stop date column. The source date is the truth.

## Storage

Two tables. Mirror of the Meta tables.

`google_ad_days` stores the daily bound snapshot.
It is a time series. It is append-only.

```
CREATE TABLE google_ad_days (
  day TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  imp_lo INTEGER NOT NULL,
  imp_hi INTEGER NOT NULL,
  PRIMARY KEY (day, creative_id)
);
CREATE INDEX idx_google_ad_days_advertiser ON google_ad_days (advertiser_id, day);
```

`google_ads` stores the current state of each creative.
One row per creative id.

```
CREATE TABLE google_ads (
  creative_id TEXT PRIMARY KEY,
  advertiser_id TEXT NOT NULL,
  entity_id TEXT,
  disclosed_name TEXT,
  format TEXT,
  topic TEXT,
  page_url TEXT,
  first_shown TEXT,
  last_shown TEXT,
  imp_lo INTEGER,
  imp_hi INTEGER,
  audience TEXT,
  surfaces TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX idx_google_ads_entity ON google_ads (entity_id);
CREATE INDEX idx_google_ads_advertiser ON google_ads (advertiser_id, last_seen DESC);
```

The daily estimate reads the day-over-day growth of the bound
midpoint `(lo + hi) / 2`. The first snapshot divides the midpoint
by the days since `first_shown`.

The Google CPM is not the Meta CPM. Each creative pays the range
of its own format, in PLN per 1000 at 4 PLN per dollar:

- IMAGE (Display, Shopping): 8-20 (benchmark $2-5)
- VIDEO (YouTube ecommerce): 20-40 (benchmark $5-10)
- TEXT (Search): 60-120 (Search sells clicks; bridged from a PL
  ecommerce CPC of $1-2 with a 1-2% CTR, rough on purpose)

A per-entity `cpmOverride` replaces every range above.
The Meta default range (15-30) never applies to Google ads.

## Architecture

The daily cron runs on the Cloudflare Worker.
It runs in the same 20:00 Warsaw slot as the Meta job.
The handler skips the Google jobs when `GOOGLE_BQ_KEY` is missing.
It never fails the Meta job.

The code lives in three layers:

- `services/bigquery/` - auth, REST client and value coercions. Reusable.
- `services/googleads/sql.ts` - the three SQL builders.
- `services/googleads/parse.ts` - the row parsers.
- `services/googleads/fetch.ts` - the thin public fetch API.
- `services/googleads/run.ts` - the three run functions.

The core job runs every day.
The static job runs when the KV marker `googleads:static:last` is 7 days old.
The surfaces job runs when the KV marker `googleads:surfaces:last` is 30 days old.
A fresh project runs both on the first cron.

Each job carries all advertiser ids in one `IN (...)`.

A manual endpoint runs all three jobs:
`POST /admin/fetch-google-ads`.
The first manual run imports all current creatives.
History arrives through `first_shown` dates.
Daily deltas accumulate forward only.

After the core run the job sends one cf-snitch email.
The source is `ecommerce-pulse/google-ads`.
The static and surfaces runs only log.

The shop page shows the collected data next to the Meta card:
active ads, new ads, impression midpoint sum, daily estimate,
daily cost estimate, surfaces, and the creative list with links.
