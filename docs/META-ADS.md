# META-ADS.md

## Purpose

Meta Ads is a data source.
It collects raw Meta ad data for each tracked shop.
It works like the stock snapshots.
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

Use the official Meta Graph API.
Use the endpoint `ads_archive`.
Use version v26.0.

```
GET https://graph.facebook.com/v26.0/ads_archive
```

The endpoint needs no app review.
It needs a user access token.
It needs no proxy. It needs no browser.
It is free.

Required parameters on every call:

- `access_token`
- `ad_reached_countries` with a JSON array.
  The value `ALL` does not work. It returns no results.
  The collector enumerates the EU and UK country codes.
  It collects ads for every EU and UK market,
  not only Poland.
- `search_page_ids` with a JSON array of page ids
  or `search_terms`

Without `ad_reached_countries` the call fails.

Useful parameters:

- `ad_active_status`: `ACTIVE`, `INACTIVE`, or `ALL`
- `limit`: page size, up to about 250
- `fields`: comma-separated field list

## Access token

Store the token as the secret `META_AD_TOKEN`.
It is a user token for the app "ecommerce".
The app id is `1785931702418608`.

The token scopes:

- `ads_read`
- `pages_show_list`
- `pages_read_engagement`
- `public_profile`

The token works for `/me`.
The token works for `ads_archive`.

A short-lived token expires after about one hour.
A long-lived token works for 60 days.
Exchange the short-lived token for the long-lived one.

```
GET /v26.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=APP_ID
  &client_secret=APP_SECRET
  &fb_exchange_token=SHORT_LIVED_TOKEN
```

The exchange needs the app secret.
Do the exchange before the short-lived token expires.

Check the token expiry:

```
GET /v26.0/debug_token?input_token=TOKEN&access_token=TOKEN
```

Never put the token in the repository.
The local copy lives in `backend/.dev.vars`.
The remote copy is a Cloudflare secret.
Set it with:

```
npx wrangler secret put META_AD_TOKEN
```

## Fields that work

Request these fields. They return data on v26.0.

```
id,page_id,page_name,ad_creation_time,
ad_delivery_start_time,ad_delivery_stop_time,
ad_creative_bodies,ad_creative_link_titles,
ad_creative_link_captions,ad_creative_link_descriptions,
publisher_platforms,languages,
eu_total_reach,total_reach_by_location,
age_country_gender_reach_breakdown,
target_ages,target_gender,target_locations,
beneficiary_payers
```

Verified on 50 of 50 active ads:

- `eu_total_reach` present
- `total_reach_by_location` present
- `age_country_gender_reach_breakdown` present
- `target_ages` present
- `target_gender` present
- `target_locations` present
- `beneficiary_payers` present

Write the parser defensively.
A field may be absent for some ad.
Absent fields are silently dropped, not errors.

Field meaning:

- `eu_total_reach`: unique EU accounts reached
- `age_country_gender_reach_breakdown`: reach by country, age range, gender
- `target_ages`: min and max target age
- `target_gender`: target gender
- `target_locations`: target locations
- `beneficiary_payers`: advertiser and payer

## Fields that do not work

Do not request these. They are not available.

- `spend` (political ads only)
- `impressions` (political ads only)
- `cost_per_result` (not available)
- `demographic_distribution` (old name, empty)
- `estimated_audience_size` (silently dropped)
- `delivery_by_region` (political filter only)
- `funding_entity` (deprecated, errors)
- `bylines` (political only)
- `ad_creative_link_url` (does not exist)
- `link_url` (does not exist)
- `collation_id`, `collation_count` (do not exist)

The API returns no product destination URL.
Do not plan product linking from the ad.

## Pagination

Use `limit=250`.

The response holds `data` and `paging`.
Follow `paging.next` to get more rows.

Stop when `data` is empty.
Do not stop when `paging.next` is missing.
The API may return `next` after the last full page.

Follow the cursor in `paging.next`.
The next URL contains the token.
Log the row count of each page.

## Rate limit and Workers limits

The API limit is dynamic and unpublished.
It scales per app and per token.
Heavy usage gets throttled.

Error `613` means rate limit.
Back off and retry with exponential backoff.
The fetch retries up to four times: 1, 2, 4, 8 seconds.
It adds a little jitter.

Batch page ids. One call accepts up to ten page ids.
One batch stops after 40 pages at `limit=250`.
The fetch waits 300 ms between pages.

The Cloudflare Workers Paid plan limits:

- 1000 subrequests per invocation.
- 30 seconds of CPU per invocation.
- Cron triggers run up to 15 minutes of wall time.
- A new cron does not start while the previous runs.

The meta ads job is I/O-bound.
It makes about three calls for all shops.
It stays far below the limits.

## Retention

EU and UK ads stay archived for one year.
Political ads stay archived for seven years.
Ads without EU or UK delivery are not archived.

A daily collector needs no backfill.
The reach of a past day is not queryable.
Collect forward only.

## Page info limit

The ad API returns the page name and the advertiser.
It does not return the page description.

`GET /{page_id}` with fields like `about` fails.
It returns error code 10.
It needs the feature Page Public Content Access.
Our app does not have this feature.

Do not try the page node in the implementation.
Add the page description by hand later if needed.

## Grouped ads

The UI groups ads with the same creative into one card.
The API does not group them.
Each ad id is one row with its own reach.

Group the rows by a creative hash.
Use the creative body and title as the hash input.
Example: two ad ids share one creative text.
Their reach differs. Both rows stay.

## Storage

Two tables.

`meta_ad_days` stores the daily reach snapshot.
It is a time series. It is append-only.

```
CREATE TABLE meta_ad_days (
  day TEXT NOT NULL,
  ad_archive_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  eu_total_reach INTEGER NOT NULL,
  PRIMARY KEY (day, ad_archive_id)
);
CREATE INDEX idx_meta_ad_days_page ON meta_ad_days (page_id, day);
```

`meta_ads` stores the current state of each ad.
One row per ad id.

```
CREATE TABLE meta_ads (
  ad_archive_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  entity_id TEXT,
  ad_creation_time TEXT,
  start_date TEXT,
  stop_date TEXT,
  creative_body TEXT,
  link_title TEXT,
  link_caption TEXT,
  link_description TEXT,
  publisher_platforms TEXT,
  languages TEXT,
  eu_total_reach INTEGER,
  reach_by_location TEXT,
  reach_breakdown TEXT,
  target_ages TEXT,
  target_gender TEXT,
  target_locations TEXT,
  beneficiary_payers TEXT,
  creative_hash TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX idx_meta_ads_entity ON meta_ads (entity_id);
```

JSON arrays and objects are stored as JSON text.

Build the preview link from the ad id.
Never store `ad_snapshot_url`.
It contains the token.

```
https://www.facebook.com/ads/archive/render_ad/?id={id}
```

## Architecture

The daily cron runs on the Cloudflare Worker.
It runs at 20:00 Warsaw time.
Warsaw uses UTC+2 in summer and UTC+1 in winter.
Two crons fire, at 18:00 and 19:00 UTC.
The handler computes the current Warsaw offset.
It runs the job only on the matching cron.

The job for each shop with a page id:

1. Call `ads_archive` with `ad_active_status=ACTIVE`.
2. Follow the pagination to the empty data.
3. Upsert each ad into `meta_ads`.
4. Write today's reach into `meta_ad_days`.
5. Mark ads missing today as ended.
   Set `stop_date` to yesterday.
   Keep their last reach in `meta_ad_days`.

A manual endpoint triggers the same job:
`POST /admin/fetch-meta-ads`.

We collect only active ads.
An ad that stops between two crons is gone from the next fetch.
The last snapshot still holds its final reach.
Analytics reads that snapshot.
We accept a gap of one day.
We do not backfill a stopped ad.

The job skips a shop when the token is missing.
It logs the reason.

After every run the job sends one cf-snitch email.
The email covers all shops:
shops, ads, days written, ads ended, errors.
When a fetch fails, the email lists the page id
and the reason, for example `code 190: token expired`.
A thrown error also sends a failed email.

Before the run the job checks the token.
It calls `/me` with the token.
If the token is expired, the job sends a failed email
and skips the run.
The email reminds us to renew the token.
Renew it to a 60-day token before it expires.

The shop page shows the collected data:
active ads, new and ended ads, reach,
top ads with demographics and platforms,
creative groups and their coverage.
It shows no spend and no CPA. That is analytics.

The Podmiot card holds a link to the Meta Ads Library
when the shop has a page id.
The link opens the page filter for all countries.

## Verified facts

Ad `635204772540093` matches the UI:

- reach: 4174096
- title: Czyści kostkę brukową. 33% rabatu...
- caption: laboratoriumpanidomu.pl
- advertiser and payer: Laboratorium Pani Domu

Counts for Laboratorium Pani Domu:

- active: 129
- inactive: 628
- total: 757

Active ad count summed with the inactive count
equals the total count. No duplicates.

## Page ids

| Shop                 | Page id          |
| -------------------- | ---------------- |
| beaumont             | 1519901994992512 |
| booso                | 374174135978715  |
| derichgallery        | 570949689437938  |
| dives-med            | 119704217731025  |
| dobrerzeczy          | 109748315469254  |
| e-daag               | 362425697158919  |
| emereedivine         | 932290296631176  |
| forcer               | 1391555270923932 |
| godsavequeens        | 158931730924476  |
| gymglamour           | 1704643286461690 |
| hdrey-group          | 129962510193438  |
| icedstuff            | 204732753536016  |
| icon-amsterdam       | 874522592419062  |
| laboratoriumpanidomu | 1527130717525496 |
| monartofficial       | 116086326898893  |
| mualasklep           | 615115091694097  |
| nago                 | 1597769753863797 |
| papitoenergy         | 611411515387427  |
| premieresociety      | 346690272208482  |
| rever                | 923578254349971  |
| risky                | 197155313699047  |
| royalwatch           | 106464751419083  |
| sanah                | 613781125410769  |
| theodderside         | 149072851929567  |
| wkdzik               | 880134425337750  |
| wojanshop            | 869005663179143  |

The archive holds commercial ads delivered to the EU or UK only.
`derichgallery` runs ads in the US, outside this scope.
The collector returns no ads for it.
We still keep its page id. It costs nothing.

We do not track ads for these shops.
This is a decision, not a gap.
We decided to exclude them on purpose:
we do not collect their ads.
Do not treat an empty page id as a missing value.

- 33mata
- brokies
- fagata
- friendzstore
- infini
- islandrecords
- marionis
- mushi
- sklepskolim
- wakenbake

## Status

Env is wired. Data is verified.
Implementation is done. Tests pass.
Migrations 0028 to 0035 are applied.
The review fixes are applied.
All page ids are verified by hand.
Deployment is pending.
