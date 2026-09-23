# INSTAGRAM.md

## Purpose

This file is the handbook for the Instagram module.
It records the chosen data source.
It records the endpoints, the collected data, and the storage.
It records the data estimates.
It records the open decisions.
The file uses Simplified Technical English.
A new agent must not repeat the research.

## The goal

The stock data shows what a shop sells.
The social data shows what a shop says.
The module joins the two.
The join shows if a post, a story, or a reel changes the sales.
The join shows if the follower growth changes the sales.
The analysis is the reason for the module.
The module does not only archive.

## The chosen source

The source is `inflact.com`.
The source is free. It needs no paid plan.
The source gives the profile, the stories, the posts, the reels, and the
profile analytics.
The source needs no browser.
The source needs no proxy.
The source is a REST API.

## Rejected sources

- `instagram-looter2` on RapidAPI. It has no stories endpoint. The free
  plan gives 150 requests per month. The tracked handle count is 98.
  The plan is too small.
- `insta-stories-viewer.com`. The data goes only over a socket.io
  WebSocket. The WebSocket needs a reCAPTCHA v3 token. A dummy token is
  rejected. The bypass needs a captcha solver and a custom socket client.

## The API host

```
https://inflact.com
```

The media host is `https://cdn.inflact.com`.

## Authentication

The API needs three checks. The module must pass all three.

1. A session. Start with one GET to the tool page. The session cookies
   are `ingram_sid` and `_csrf`. The GET also gives the CSRF token in the
   meta tag `csrf-token`.

```
GET https://inflact.com/instagram-stories-viewer/
```

2. The CSRF token. Send the token as the form field `_csrf` on every
   POST.

3. The request signature. Two headers are needed.

```
X-Client-Token: base64(JSON({timestamp, clientId, nonce}))
X-Client-Signature: HMAC_SHA256(secret, JSON({timestamp, clientId, nonce}))
```

- `timestamp` is the Unix time in seconds. Subtract
  `window.serverTimeDelta` from the page.
- `clientId` is a random 16 byte value in hex. It is stable. The module
  keeps one value per session.
- `nonce` is a random 16 byte value in hex. It is new on every request.
- The JSON key order is `timestamp`, `clientId`, `nonce`. The value has
  no spaces.

The secret is in the client JavaScript. The file is a bundle. The secret
is built from eight number arrays. Each array becomes a string. Each
character is XORed with its index modulo the length. The eight parts are
joined. The verified secret is:

```
59c4f127a1d1e260b82b9ea54782a2f5f4fdeed6d5089ec54d99dafcff9eb046
```

The secret can change. The module reads the secret from the bundle at
run time. The reader ports the same deobfuscation. The environment
variable `INFLACT_SIGNATURE_SECRET` is the fallback.

## The endpoints

The viewer API is under this path.

```
/downloader/api/viewer/
```

The analyzer API is under this path.

```
/profile-analyzer/v1/
```

The module sends multipart form data. The fields are `url` (the handle),
`cursor` (the page cursor), and `_csrf`.

| Endpoint                                | Data                     | Size         |
| --------------------------------------- | ------------------------ | ------------ |
| `/downloader/api/viewer/stories/check/` | story presence flag      | 0.2 KB       |
| `/downloader/api/viewer/stories/`       | active stories           | 0.2 to 31 KB |
| `/downloader/api/viewer/posts/`         | posts and reels timeline | 0.25 MB      |
| `/downloader/api/viewer/reels/`         | reels with view counts   | 0.2 MB       |
| `/downloader/api/viewer/profile/`       | profile basics           | 0.14 MB      |
| `/profile-analyzer/v1/analytics/`       | full analytics           | 0.34 MB      |
| `/profile-analyzer/v1/stories/`         | stories with limits      | small        |

## What we have today per shop per day

The stock pipeline gives these fields for each shop and each day. Table
`daily_stats`.

| Field             | Meaning                             |
| ----------------- | ----------------------------------- |
| `units_sold`      | items sold in the day               |
| `revenue`         | money from the sold items, in PLN   |
| `restocked`       | items added to the stock in the day |
| `sold_out_count`  | variants that went to zero          |
| `promotion_count` | price promotions started            |
| `masked_count`    | sales hidden by a restock           |
| `suspect_count`   | events above the observed maximum   |
| `sold_min_price`  | lowest sold price                   |
| `sold_max_price`  | highest sold price                  |

The pipeline also stores each snapshot. Table `snapshots`. Each row has
the shop, the time, the product, the variant, the quantity, the price,
and the availability. Table `events` holds the changes between two
snapshots.

The entity graph links each shop to an owner and to a social handle.
Table `entities`, table `persons`, table `socials`.

## What we collect per shop per day

The module collects three kinds of data. Each kind has one storage rule.

### Snapshot data

A snapshot is one row for each shop and each day. The value is the state
of that day. Old rows stay.

Stories expire in 24 hours. The story rows are append only. A story row
is the daily record.
The profile analytics is a daily snapshot.
The follower count and the engagement are a time series.

New table `social_profile_days`.

| Field            | Source                    |
| ---------------- | ------------------------- |
| `day`            | the run day               |
| `user_id`        | the profile id            |
| `followers`      | `engagement.followers`    |
| `uploads`        | `engagement.uploads`      |
| `avg_likes`      | `engagement.avgLikes`     |
| `avg_comments`   | `engagement.avgComments`  |
| `engagement`     | `engagement.value`        |
| `posts_per_day`  | `publishing.postsPerDay`  |
| `posts_per_week` | `publishing.postsPerWeek` |
| `score`          | `profile.score`           |
| `is_verified`    | `profile.isVerified`      |
| `category`       | `profile.category`        |
| `ad_reel_price`  | `advertisement.reel`      |
| `ad_post_price`  | `advertisement.post`      |
| `ad_story_price` | `advertisement.story`     |
| `country`        | `globalStats`             |
| `keywords`       | `keywords` as JSON        |

The `advertisement` block gives the price of one reel, post, and story.
The price is the influencer rate. The field is new value for the report.

### Update data

An update overwrites the old row. The row is the current state.

Table `social_profiles`. One row for each profile.

- `handle`
- `full_name`
- `biography`
- `contacts` as JSON
- `is_verified`
- `followers` (the last value)

### Append data

An append writes only a new item. The item id is the primary key. A
known id is skipped.

Table `social_posts`. Fields: media id, shortcode, media type, taken at,
caption, likes, comments, video view count, media URL, R2 key.
Table `social_stories`. Fields: media id, media type, taken at, expiring
at, media URL, R2 key.
New table `social_reels`. Fields: media id, shortcode, taken at, like
count, comment count, play count, video view count, media URL, R2 key.

## The media

The media URL expires. The module copies a small image to R2.
The module does not copy a video. A video is 6 to 376 MB. A video copy
needs a transcoder. The VPS has 256 MB and no swap. A transcoder would
kill the VPS. The module stores the video poster image.

The smallest image per media type:

| Type         | Field                       | Size         |
| ------------ | --------------------------- | ------------ |
| Post or reel | `display_url`               | 6 to 27 KB   |
| Story        | `displayUrl`                | 52 to 263 KB |
| Video poster | `display_url` or `imageUrl` | 90 to 183 KB |

The Instagram CDN rejects a size change. A changed URL returns HTTP 403.
The story image has no smaller variant. The module stores the given size.

The R2 key is `social/instagram/<handle>/<kind>/<id>/poster.jpg`.

## The estimates

The measurement uses a sample of ten shops.
The posts per day is 0.01 to 0.71. The mean is about 0.2.
About half of the shops have an active story. The count is 1 to 7.

The media size is about 120 KB for each shop and each day.
The API size is about 0.6 MB for each shop and each day.

The handle count is 98. The split is 50 shops and 48 persons.

| Period   | Media to R2 | API on the VPS |
| -------- | ----------- | -------------- |
| 1 day    | 12 MB       | 58 MB          |
| 7 days   | 84 MB       | 406 MB         |
| 30 days  | 350 MB      | 1.7 GB         |
| 365 days | 4.3 GB      | 21 GB          |

The API traffic is direct from the VPS. It does not use Cloudflare.
Only the poster images and the small metadata go to Cloudflare and R2.
R2 gives 10 GB free. The media fills 10 GB in about 2.3 years.
A lifecycle rule removes media older than 90 days.

## The correlation

The module joins the social data to the stock data. The join key is the
shop and the day. The entity id links the shop to the handle.

The analysis answers these questions.

- Did the sales rise on a post day?
- Did the sales rise on the day after a post?
- Did a story change the sales in the same 24 hours?
- Did a reel change the sales more than a photo post?
- Did the follower growth lead the sales?
- Did the engagement rise before a sales rise?
- Does the advertisement price follow the shop size?

The join uses the daily totals and the event times.
Table `social_posts` gives the post time.
Table `daily_stats` gives the daily sales.
Table `social_profile_days` gives the daily followers and engagement.

The analysis compares a post day to a no-post day.
The analysis compares the sales in a window of plus and minus three days.
The analysis keeps the price promotions apart. A promotion changes the
sales on its own.

## The module

The module runs on the VPS. It does not run on the worker.

- A new entry point `orchestrator/src/social.ts`.
- A new launcher `run-social.sh`.
- A new cron line in the VPS crontab.

The run does these steps for each handle.

1. Start the session. Keep the cookies and the CSRF token.
2. Call `stories/check/`. Call `stories/` only on a true flag.
3. Call `posts/` for the first page. Keep the new posts.
4. Call `reels/` for the first page. Keep the new reels.
5. Call `/profile-analyzer/v1/analytics/` for the daily snapshot.
6. Copy the poster image to R2.
7. Send the data to the worker. The worker writes D1 and R2.

The first run backfills the posts. The backfill starts at the shop seed
date. The shop seed date is the first stock snapshot. The module reads
the date from the worker.

The backfill does not fetch the full history. The backfill stops at the
seed date.

## The rotation

The source has no hard request limit in the tests. The module still
rotates the session. The rotation lowers the block risk.

The parameter: one new session for each 25 handle calls.
The module also starts a new session on any HTTP 4xx or 5xx answer.
The estimate is 4 sessions for each full run.

The risk is low. A block would stop the run. The module reports the
block with the snitch.

## The failure report

The module sends a report on every run.
The report uses the snitch. Source `ecommerce-pulse/vps/social`.
A failed run sets `status` to `failed` and `notify` to `on-error`.
The message holds the reason. The reason names the handle and the step.
A good run sets `notify` to `always` and sends the counters.

## The open decisions

- The handle set. Collect for the 50 shops only, or also the 48 persons?
- The story image. The size is 52 to 263 KB. A reduction needs an image
  library. The VPS would run out of memory. Accept the size.
- The backfill depth. The module stops at the shop seed date.
