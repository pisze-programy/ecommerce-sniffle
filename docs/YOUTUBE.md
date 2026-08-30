# YOUTUBE.md

## Purpose

We track YouTube channels of the tracked shops and persons.
We want to know their new videos and their statistics.
Video views are organic exposure.
The analytics module combines paid ads and organic exposure later.

This file is the implementation handbook.
It records the API discovery.
A new agent must not repeat the discovery.
The facts below are verified and current.

## Data source

Use the official YouTube Data API v3.
It is free. It needs only an API key.
The key comes from Google Cloud.
Public channel and video data needs no OAuth.

Store the key as the secret `YOUTUBE_API_KEY`.

The free quota is 10 000 units per day.
It resets at midnight Pacific time.

## Quota costs

| Call                 | Units | Use                           |
| -------------------- | ----- | ----------------------------- |
| `channels.list`      | 1     | channel id and stats          |
| `playlistItems.list` | 1     | video ids of the uploads list |
| `videos.list`        | 1     | video stats, up to 50 ids     |
| `search.list`        | 100   | avoid. Too expensive          |

Use the uploads playlist, not `search.list`.

## The flow per channel

1. Resolve the channel.
   ```
   GET https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&forHandle=@oskarlipinski&key=KEY
   ```
   Returns the channel id, the subscriber count,
   the view count, the video count,
   and the id of the uploads playlist.
2. List all video ids of the uploads playlist.
   ```
   GET https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=UU...&maxResults=50&pageToken=...&key=KEY
   ```
   Paginate with `pageToken` until the data ends.
   50 ids per page. One unit per page.
3. Fetch the video stats in batches of 50 ids.
   ```
   GET https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=id1,id2,...,id50&key=KEY
   ```
   One call holds at most 50 ids. One unit per call.

A channel with 100 videos needs about 5 units.
Thirty channels need about 150 units per day.

## Data we get

Channel stats from `channels.list`:

- subscriber count
- view count
- video count
- uploads playlist id

Video stats from `videos.list`:

- view count
- like count
- comment count
- duration (ISO 8601)
- published date, title, description, thumbnails

We snapshot these counts daily.
The daily change gives the growth curve per video.
That shows which videos grow and correlate with promotions.

## Limits and caveats

- `videos.list` accepts at most 50 ids.
  A request with 51 ids fails.
- Dislikes are not available.
  YouTube removed them in 2021.
- `likeCount` and `commentCount` may be absent
  when the creator hides them.
  Parse defensively.
- YouTube changes its view counting policy.
  Watch the trend, not the absolute number.
- A private or removed video is omitted from the result.
- The free quota returns error 403
  when it runs out.

## Fallback without a key

The channel page HTML is server-rendered.
A plain fetch of `https://www.youtube.com/@handle`
returns the channel id and recent video ids.
Verified on `@oskarlipinski`:

- channel id: `UCWbZpCpJsqqDVZ1WQuTCWMQ`
- 44 video ids in the HTML

The HTML does not hold the statistics reliably.
Use the official API for statistics.

## How it integrates

The module mirrors `social` and `metaads`.

- Env: `YOUTUBE_API_KEY`.
- `backend/src/services/youtube/` with `types.ts`,
  `fetch.ts`, and `run.ts`.
- Manual endpoint: `POST /admin/fetch-youtube`.
- Daily cron at 20:00 Warsaw time, next to meta ads.
- D1 table `youtube_channels`: daily channel snapshot.
- D1 table `youtube_video_days`: per video per day
  the view, like, and comment counts.
- Shop and person pages show a YouTube card:
  channel stats and recent videos with views.

## Exposure model fit

A person channel promotes the shops of that person.
Oskar Lipinski promotes Daag in his videos.
We link a channel to shops through `person_relations`.
The analytics module sums video views per shop
as organic exposure.
It combines paid ads and organic exposure later.

## Open questions

1. Collect the full video catalog or only recent videos?
   Old videos still give exposure.
2. Which channels: all from `socials` with the
   youtube platform, or only channels of related persons?
3. Attribute a video to a shop by the person relations
   automatically, or by a hand map for certainty?
4. Snapshot frequency: daily.

## Status

Discovery is done.
No implementation yet.
