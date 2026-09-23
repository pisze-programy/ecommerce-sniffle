# Facebook module

The Facebook module is a part of the social module. See
[INSTAGRAM.md](./INSTAGRAM.md) for the shared model and the shared
storage.

## The goal

The module collects one Facebook page per shop or person. The data joins
the stock data. The join key is the page and the day.

## The sources

The module uses three sources. All three are free. No Facebook account
is needed.

1. The profile. The source is `api.chocodata.com`. The call is
   `GET /api/v1/facebook/profile?username=<handle>&api_key=<key>`. The
   answer holds the name, the follower count, and the talking-about
   count. The read is an Open Graph read.

2. The stories. The source is `facebookstoryviewer.com`. The call is
   `POST /api/stories/` with the body `{"url": "<page url>"}`. The
   answer holds the profile and the active stories.

3. The posts and the reels. The source is the public page. The call is
   `GET https://www.facebook.com/<handle>`. The request needs a crawler
   user agent. A desktop browser agent gets a 400. The page holds the
   posts, the reactions, the comments, and the video views.

## The key

The profile read needs the chocodata key. The environment variable is
`CHOCODATA_API_KEY`. The free tier gives 5 000 credits, about 1 000
requests. A free account is enough.

Without the key the page read still gives the follower count and the
talking-about count from the Open Graph block.

## The mapping

The Facebook data uses the same model as Instagram.

| Model              | Facebook value                                                         |
| ------------------ | ---------------------------------------------------------------------- |
| `SocialProfile`    | the page id, the handle, the name                                      |
| `SocialProfileDay` | followers, talking-about, average reactions, average comments          |
| `SocialPost`       | post_id, permalink, creation time, message, reactions, comments, image |
| `SocialReel`       | a video post: play count, reactions, comments, poster                  |
| `SocialStory`      | id, publish time, media type, poster                                   |

A video post becomes a reel. A photo post becomes a post.

The report shows the talking-about count in the score slot for a
facebook row.

## The day

The module uses the publish time of the item. The collection time is
not the day. A post that appears in the evening and is collected the
next day keeps the evening day.

## The limits

- The public page does not always send the post feed. The page sends
  the feed to a crawler agent, but the answer is not stable. When the
  feed is absent, the run stores the profile and the stories, and no
  posts. The run logs the count.
- The free chocodata and facebookscraperapi tiers give the profile and
  one post by a post url. They do not give the full page feed.
- A personal profile sends no public stories. Only a page sends
  stories.

## The run

The Facebook handles run on the VPS, in the same `run-social.sh` run as
Instagram. The Facebook pool is smaller, because the page is heavy
(about 5 MB for each page).
