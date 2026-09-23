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

## The chosen source

The source is `inflact.com`.
The source is free. It needs no paid plan.
The source gives the profile, the stories, the posts, the reels, and the
profile analytics.
The source needs no browser. The source needs no proxy.
The source is a REST API.

## Rejected sources

- `instagram-looter2` on RapidAPI. It has no stories endpoint. The free
  plan gives 150 requests per month. The tracked handle count is 98. The
  plan is too small.
- `insta-stories-viewer.com`. The data goes only over a socket.io
  WebSocket. The WebSocket needs a reCAPTCHA v3 token. A dummy token is
  rejected.

## The API host

```
https://inflact.com
```

The media host is `https://cdn.inflact.com`.

## Authentication

The API needs three checks. The module must pass all three.

1. A session. Start with one GET to the tool page.

```
GET https://inflact.com/instagram-stories-viewer/
```

The session cookies are `ingram_sid` and `_csrf`. The GET also gives the
CSRF token in the meta tag `csrf-token`.

2. The CSRF token. Send the token as the form field `_csrf` on every
   POST.

3. The request signature. Two headers are needed.

```
X-Client-Token: base64(JSON({timestamp, clientId, nonce}))
X-Client-Signature: HMAC_SHA256(secret, JSON({timestamp, clientId, nonce}))
```

- `timestamp` is the Unix time in seconds. Subtract
  `window.serverTimeDelta` from the page.
- `clientId` is a random 16 byte value in hex. It is stable for the
  session.
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

The viewer API is under `/downloader/api/viewer/`.
The analyzer API is under `/profile-analyzer/v1/`.

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

The pipeline also stores each snapshot (table `snapshots`) and each
change between two snapshots (table `events`).

The entity graph links each shop to an owner and to a social handle.
Table `entities`, table `persons`, table `socials`, table
`person_relations`.

One person can own several shops. The `person_relations` table holds the
links. The verified multi-shop persons are:

- Rafał Afanasjef: dives-med, hdrey-group, infini.
- Karolina Pisarek: forcer, hdrey-group.
- Patrycja Wąsala-Oponowicz: ooponka, wasalaa.
- Sofiia Sivokha: emereedivine, gymglamour.

## What we collect per shop per day

The module collects three kinds of data. Each kind has one storage rule.

### Snapshot data

A snapshot is one row for each profile and each day. Old rows stay.

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

- `handle`, `full_name`, `biography`, `contacts` as JSON,
  `is_verified`, `followers`.

### Append data

An append writes only a new item. The item id is the primary key. A
known id is skipped.

- Table `social_posts`: media id, shortcode, permalink, media type,
  is_reel, taken at, caption, likes, comments, video view count, media
  URL, R2 key.
- Table `social_stories`: media id, media type, is_video, taken at,
  expiring at, media URL, R2 key.
- New table `social_reels`: media id, shortcode, permalink, taken at,
  like count, comment count, play count, video view count, media URL,
  R2 key.

## The media

The module does not store a video. The module stores only a small image.

- A video is 6 to 376 MB. The largest item is a live video of 36
  minutes. A video copy needs a transcoder. The VPS has 256 MB and no
  swap. The transcoder would kill the VPS.
- The module stores the poster image and the metadata. The item id, the
  permalink, and the dates identify the item.

The smallest image per media type:

| Type         | Field                       | Size         |
| ------------ | --------------------------- | ------------ |
| Post or reel | `display_url`               | 6 to 27 KB   |
| Story        | `displayUrl`                | 52 to 263 KB |
| Video poster | `display_url` or `imageUrl` | 90 to 183 KB |

The R2 key is `social/instagram/<handle>/<kind>/<id>/poster.jpg`.

## The links

Each item has two links. The two links differ.

- The permalink is `https://www.instagram.com/p/<shortcode>/`. It is
  permanent. The page shows the item. The module uses it for the web
  display and for the redirect.
- The media URL is the image or the video file. It expires. The
  Instagram URL holds an `oe` parameter. The `oe` value is an expiry
  time. The verified expiry is about four days. The API gives a fresh
  URL on every call.

The post node field `url` is not the permalink. The field holds the
media file. The module builds the permalink from the `shortcode`.

A story has no permalink. A story expires after 24 hours. The module
must store the story at the run time. A later run cannot find the story.

## The estimates

The measurement uses a sample of twelve shops.

- The posts per day is 0.01 to 0.71. The mean is about 0.22.
- About half of the shops have an active story. The count is 1 to 7.
  The mean is about 1.5 for each shop and each day.
- The story image is about 200 KB.
- The post image is about 80 KB.

The media size is about 320 KB for each shop and each day.

The handle count is 98. The split is 50 shops and 48 persons.

| Period   | Media to R2 | API on the VPS |
| -------- | ----------- | -------------- |
| 1 day    | 30 MB       | 58 MB          |
| 7 days   | 210 MB      | 406 MB         |
| 30 days  | 0.9 GB      | 1.7 GB         |
| 365 days | 11 GB       | 21 GB          |

The API traffic is direct from the VPS. It does not use Cloudflare.
Only the poster images and the small metadata go to Cloudflare and R2.
R2 gives 10 GB free. The media fills 10 GB in about 11 months.
The module keeps the data. The module has no lifecycle rule.

The first run backfills the posts. The backfill starts at the shop seed
date. The backfill size is about 50 MB for all shops.

## The day example

The example is `daag__torebki` on 2026-09-23.

The snapshot row in `social_profile_days`:

```json
{
  "day": "2026-09-23",
  "user_id": 28388909189,
  "handle": "daag__torebki",
  "followers": 149095,
  "uploads": 1021,
  "avg_likes": 1065,
  "avg_comments": 54,
  "engagement_rate": 0.75,
  "score": 6,
  "posts_per_day": 0.015,
  "posts_per_week": 0.102,
  "ad_reel_price": 0,
  "ad_post_price": 0,
  "ad_story_price": 0,
  "country": "Worldwide"
}
```

The append row in `social_stories`:

```json
{
  "id": "3992438281361201390",
  "user_id": "28388909189",
  "media_type": "photo",
  "is_video": false,
  "taken_at": "2026-09-23T09:29:12Z",
  "expiring_at": "2026-09-24T09:29:12Z",
  "r2_key": "social/instagram/daag__torebki/stories/3992438281361201390/poster.jpg"
}
```

The append row in `social_posts`:

```json
{
  "id": "3990204290098353079",
  "permalink": "https://www.instagram.com/p/DPXkq2xjR_7/",
  "media_type": "GraphVideo",
  "is_reel": true,
  "taken_at": "2026-09-20T10:00:00Z",
  "likes": 775,
  "comments": 12,
  "video_views": 18344,
  "r2_key": "social/instagram/daag__torebki/posts/3990204290098353079/poster.jpg"
}
```

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
The analysis keeps the price promotions apart.

A person with several shops needs care. One post can change the sales of
several shops. The analysis groups the shops of one person.

## The module

The module runs on the VPS. It does not run on the worker.

The VPS does the collection. The worker does the storage.

- A new entry point `orchestrator/src/social.ts`.
- A new launcher `run-social.sh`.
- A new cron line in the VPS crontab.
- A new worker route `GET /social/targets`. It gives the handle list.
  Each entry holds the handle, the owner kind, the owner id, and the
  shop seed date.
- A new worker route `POST /ingest-social`. It writes D1 and R2.

The run does these steps for each handle.

1. Start the session. Keep the cookies and the CSRF token.
2. Call `stories/check/`. Call `stories/` only on a true flag.
3. Call `posts/` for the first page. Keep the new posts.
4. Call `reels/` for the first page. Keep the new reels.
5. Call `/profile-analyzer/v1/analytics/` for the daily snapshot.
6. Send the payload to the worker. The worker writes D1 and R2.

The worker fetches the poster image and writes R2. The payload holds the
poster URL. The URL is fresh. The worker fetches it at once.

## The rotation

The source has no hard request limit in the tests. The module still
rotates the session. The rotation lowers the block risk.

The parameter: one new session for each 25 handle calls. The module also
starts a new session on any HTTP 4xx or 5xx answer. The estimate is 4
sessions for each full run.

The risk is low. A block would stop the run. The module reports the
block with the snitch.

## The failure report

The module sends a report on every run. The report uses the snitch.
Source `ecommerce-pulse/vps/social`.
A failed run sets `status` to `failed` and `notify` to `on-error`.
The message holds the reason. The reason names the handle and the step.
A good run sets `notify` to `always` and sends the counters.

## The open decisions

- The story image size is 52 to 263 KB. A reduction needs an image
  library. The VPS would run out of memory. The module keeps the size.
- The follower series. The analytics gives two follower values. The
  `engagement.followers` value is 149095. The `followers.data` series
  shows about 11800. The module stores both. The report shows the
  difference.
