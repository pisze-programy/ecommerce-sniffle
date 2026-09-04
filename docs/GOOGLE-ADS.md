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
The table has 168M rows and 146 GB. It has no partitioning.
Every query scans the selected columns in full.

Request only these columns and subfields:

```
advertiser_id, creative_id, creative_page_url,
ad_format_type, topic, advertiser_disclosed_name,
audience_selection_approach_info,
region_stats.region_code, region_stats.first_shown,
region_stats.last_shown, region_stats.times_shown_lower_bound,
region_stats.times_shown_upper_bound,
region_stats.surface_serving_stats
```

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
The first 1 TB per month is free. The daily collector scans
about 10-20 GB per day for 20 advertisers.

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
One BigQuery call carries all advertiser ids in `IN (...)`.
The handler skips the Google job when `GOOGLE_BQ_KEY` is missing.
It never fails the Meta job.

A manual endpoint triggers the same job:
`POST /admin/fetch-google-ads`.
The first manual run imports all current creatives.
History arrives through `first_shown` dates.
Daily deltas accumulate forward only.

After every run the job sends one cf-snitch email.
The source is `ecommerce-pulse/google-ads`.

The shop page shows the collected data next to the Meta card:
active ads, new ads, impression midpoint sum, daily estimate,
daily cost estimate, surfaces, and the creative list with links.
