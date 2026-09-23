# INSTAGRAM-API.md

## Purpose

This file records the Instagram API research.
It records the verified endpoints and the response shapes.
A new agent must not repeat the research.
The file uses Simplified Technical English.

## The API host

The API is `instagram-looter2` on RapidAPI.

```
https://instagram-looter2.p.rapidapi.com
```

## Authentication

Send two headers on every request.

```
x-rapidapi-host: instagram-looter2.p.rapidapi.com
x-rapidapi-key: <key>
```

The key is a secret. Keep the key in the environment variable
`RAPIDAPI_KEY`. Do not put the key in the repository.

## The quota

The free plan gives 150 requests per month.
The plan has a hard limit.
A request above the limit fails.
A failed request may block the account.
The quota is small. The tracked handle count is 98.
Daily collection for every handle is not possible on the free plan.
Use a rotation. Collect a small set each day.

A 404 response does not call the upstream provider.
A 200 response calls the upstream provider and uses the quota.

## The endpoints

The API has 30 endpoints. The table lists the useful ones.

| Route               | Name                         | Purpose                         |
| ------------------- | ---------------------------- | ------------------------------- |
| `/search`           | Search users by keyword      | Find a user by a text query     |
| `/id`               | User ID from username        | Change a username to a user id  |
| `/id`               | Username from user ID        | Change a user id to a username  |
| `/web-profile`      | Web profile info by username | Get the public profile          |
| `/profile`          | User info by username        | Get the profile by username     |
| `/profile`          | User info by user ID         | Get the profile by user id      |
| `/profile2`         | User info (V2) by username   | Get the profile, second version |
| `/profile2`         | User info (V2) by user ID    | Get the profile, second version |
| `/user-feeds`       | Media list by user ID        | Get the posts, first version    |
| `/user-feeds2`      | Media list (V2) by user ID   | Get the posts, second version   |
| `/reels`            | Reels by user ID             | Get the reels                   |
| `/post`             | Media info by ID             | Get one media object            |
| `/post`             | Media info by URL            | Get one media object            |
| `/user-tags`        | Tagged media by user ID      | Get the media that tag the user |
| `/user-reposts`     | Reposts by user ID           | Get the reposts                 |
| `/related-profiles` | Related profiles by user ID  | Get similar profiles            |
| `/tag-feeds`        | Media by hashtag             | Get the media for a hashtag     |

The API has no stories endpoint.
The verified endpoint list holds no story route.
A story collection needs a different provider.

## The user id

Call `/id` with the username.

```
GET /id?username=daag__torebki
```

The response holds the user id.

```json
{ "status": true, "username": "daag__torebki", "user_id": "28388909189" }
```

## The media list

Call `/user-feeds` with the user id.

```
GET /user-feeds?id=28388909189
```

The response holds `items`, `next_max_id`, and `more_available`.
One page holds 12 items.
Follow `next_max_id` for the next page.
A page stops when `more_available` is false.

Each item holds these fields:

- `id` - the media id
- `code` - the shortcode
- `taken_at` - the time, in epoch seconds
- `media_type` - 1 is photo, 2 is video, 8 is carousel
- `caption` - the caption object
- `like_count` and `comment_count`
- `image_versions2` - the image urls
- `video_versions` - the video urls

Call `/user-feeds2` for the second version.

```
GET /user-feeds2?id=28388909189
```

The response is a GraphQL shape.
The posts are at `data.user.edge_owner_to_timeline_media.edges`.
The count is at `data.user.edge_owner_to_timeline_media.count`.
The cursor is at `data.user.edge_owner_to_timeline_media.page_info.end_cursor`.

## The profile

Call `/web-profile` with the username.

```
GET /web-profile?username=friendz1515
```

The profile is at `data.user`.
The fields are `username`, `full_name`, `id`, and `biography`.

## The verified handles

| Shop         | Handle          | User id       | Full name             |
| ------------ | --------------- | ------------- | --------------------- |
| e-daag       | `daag__torebki` | `28388909189` | Torebki Skórzane DAAG |
| friendzstore | `friendz1515`   | `74950851709` | FRIENDZ               |

The user id is stable. The username can change.

## The scraper use

The scraper needs the posts and the stories.
The API gives the posts. The API gives no stories.
Use `/id` one time for each handle. Store the user id.
Use `/user-feeds` for the daily post collection.
Use the media `id` to drop a post that the store already holds.
The media `id` is the primary key.

## Open questions

- The story source. The API gives no stories.
- The request budget. The free plan gives 150 requests per month.
- The rotation. A small handle set each day stays in the budget.
