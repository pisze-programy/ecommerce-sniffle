# ENTITIES.md

This file defines the data models for the entity graph.
It covers entities, persons, relations, social media, and ads.
The pilot is implemented for hdrey, divesmed and forcer.
Entities live in D1 (migration `0009_entities.sql`).
The shop page shows the entity graph and the Social card.
The social scraper is a manual admin trigger for now.
The cron comes later.
The goal is to check that the models fit the vision.

## Scope

Entities connect shops to companies and persons.
A shop points to one entity.
An entity has owners and ambassadors.
Two entities share an owner.
The graph shows this link automatically.

Start with a pilot: hdrey, divesmed, forcer.

## Entity

An entity is a company, a sole trader, or a brand.
A legal form is optional.
An entity without any data is a visible empty node.
It can get data later.

```ts
type EntityKind = 'company' | 'soleTrader' | 'personActivity' | 'brand';

interface CpmRange {
  min: number; // PLN per 1000, low estimate
  max: number; // PLN per 1000, high estimate
}

interface Entity {
  id: string; // 'hdrey-group' | 'infini'
  name: string;
  kind: EntityKind;
  krs: string | null; // sp. z o.o.
  regon: string | null;
  nip: string | null;
  bizraportUrl: string | null;
  socials: SocialLink[];
  metaPageId: string | null; // hand-collected, null on start
  googleAdvertiserId: string | null; // hand-collected AR id, null on start
  cpmOverride: CpmRange | null; // per-entity CPM override
}
```

## Person

```ts
interface Person {
  id: string; // 'rafal-afanasjef'
  name: string;
  linkedinUrl: string | null;
  socials: SocialLink[];
}
```

## Social link

```ts
type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok';

interface SocialLink {
  platform: SocialPlatform;
  handle: string; // used by the social scraper
  url: string; // used by the clickable link
}
```

## Relations

A relation attaches a person to an entity.
A role has a Polish label for the graph edge.
A relation can be permanent or temporary.
A relation without dates is permanent.
A relation can change over time.
When a relation ends, set the end date.
Do not delete the old record.
The graph keeps the history.

```ts
type PersonRole = 'owner' | 'founder' | 'ambassador' | 'influencer' | 'collaboration';

interface PersonRelation {
  personId: string;
  entityId: string;
  role: PersonRole; // właściciel | założyciel | ambasador | influ | współpraca
  label: string; // Polish label for the edge
  from: string | null; // start date, null = permanent
  to: string | null; // end date, null = active now
}
```

There are two kinds of connections.

1. Defined relations.
   We write them in the config by hand.
   They have dates and keep history.

2. Loose connections.
   They come from scraped social data.
   A sponsored post or story that tags a known handle.
   They are evidence, not relations.
   We do not write them to the config.
   If no relation exists, that is fine.

The graph is historical.
It shows past and current relations.
We do not chase an exact current state.
We will not always update and verify relations.
Past edges are faded and dashed.
Current edges are solid.
Loose connections are dotted evidence.

Two entities that share the same owner form the auto relation
`same-owner` with the label 'ten sam właściciel'.
The graph computes this relation. No manual entry.
Only the role `owner` counts for now.
The role `co-owner` can come later.

Entities can cooperate with each other.
These relations are explicit.

```ts
type EntityRelationType = 'collaboration' | 'related' | 'partner' | 'supplier';

interface EntityRelation {
  fromEntityId: string;
  toEntityId: string;
  type: EntityRelationType;
  label: string; // współpraca | powiązana | wspólnik | dostawca
  from: string | null;
  to: string | null;
}
```

A temporary relation per stories campaign is possible.
For now, the link between a social post and a relation is manual.
We add it by hand later if needed.

## Shop mapping

Every provider config gets an optional `entityId`.
The shop node in the graph comes from the config.
The entity is the center.

| Shop     | Entity      |
| -------- | ----------- |
| hdrey    | hdrey-group |
| divesmed | dives-med   |
| forcer   | forcer      |

## Pilot data

### Entities

```
hdrey-group
  name: Hdrey Group Sp. z o.o.
  kind: company
  krs: 0000683399
  bizraport: https://www.bizraport.pl/krs/0000683399/...
  instagram: hdrey_pl (65.6K followers)
  facebook: hdreypl (52.8K followers, category Health/beauty)
  metaPageId: 129962510193438

dives-med
  name: Dives Sp. z o.o. (brand Dives Med)
  kind: company
  krs: 0000875646
  bizraport: https://www.bizraport.pl/krs/0000875646/...
  instagram: divesmed_pl
  facebook: divesmedpolska
  metaPageId: null (hand-collected)

forcer
  name: Forcer Sp. z o.o. (design and fashion)
  kind: company
  krs: 0001134950
  bizraport: https://www.bizraport.pl/krs/0001134950/...
  facebook page: 61569223094545
  metaPageId: 528691826989201
  instagram: forcerofficial (from Karolina's bio)

infini
  name: INFINI Premium Filler
  kind: brand
  no other data yet
  visible empty node
```

### Persons

```
rafal-afanasjef
  name: Rafał Afanasjef
  role: CEO and founder of HDRÈY, Dives Med, INFINI Premium Filler
  linkedin: https://www.linkedin.com/in/rafal-afanasjef-13078a210/

karolina-pisarek
  name: Karolina Pisarek
  role: influencer, ambassador
  linkedin: null
  instagram: karolina_pisarek
  facebook page: 100044181591844
  biography says 'Owner: @forcerofficial'
  bio links point to forcer.pl
```

### Relations

```
rafal-afanasjef    -> owner       hdrey-group
rafal-afanasjef    -> owner       dives-med
rafal-afanasjef    -> founder     infini
karolina-pisarek   -> influencer  hdrey-group
karolina-pisarek   -> ambassador  hdrey-group
karolina-pisarek   -> owner       forcer
```

Karolina has no LinkedIn.
LinkedIn is optional for a person.
Others can have it.

Auto relation:
hdrey-group <-> dives-med = same-owner (shared owner).
The owner role for Karolina comes from her Instagram biography.
The scraper detects the bio pattern 'Owner: @username'.
A person confirms the relation by hand. No auto relation.

## Entity sections per shop

The shop page shows two cards. No visual graph.

1. Podmiot: the firm identity.
   It shows the name, the registry (KRS, REGON, NIP), the legal form,
   the Bizraport link and the social links.

2. Powiązania: the relations.
   It lists the persons (owners) with their role badges and date ranges,
   and the linked shops reached through shared persons or a shared owner.

The sections are historical.
They do not chase the exact current state.
A past relation shows a gray badge with its date range.
A shop with a shared owner appears as a linked shop.

For shop hdrey the sections show:
Hdrey Group (Podmiot), Rafał (owner) and Karolina (influ and ambasador),
and linked shops: divesmed (same-owner) and forcer (through Karolina).

## Future pages

No separate pages for now.
A person page and a company page will come later.
The design is not decided yet.
This note keeps the idea alive.

## Social scraper model

The scraper reads Instagram posts and stories through
the RapidAPI provider `instagram-scraper2`.
It runs once a day.
Facebook posts and stories need a separate provider.
They are deferred.

The scraper stores only daily data.
It does not backfill history.
It does not update old posts or stories.
Stories disappear after 24 hours.
The scraper downloads story media the same day.

### Profile registry

The registry maps a handle to a stable user id.
It stores no history.
The daily cron uses the id to fetch posts and stories.

```ts
interface SocialProfile {
  platform: 'instagram';
  userId: string; // stable key
  handle: string;
  fullName: string | null;
}
```

### Post

```ts
interface SocialPost {
  platform: 'instagram';
  id: string; // media pk
  userId: string;
  shortcode: string;
  type: 'photo' | 'video' | 'carousel';
  takenAt: string;
  caption: string | null;
  mediaUrls: string[];
  isPaidPartnership: boolean;
  isCommercial: boolean;
  taggedUsers: string[]; // who the post tags
  r2Key: string | null;
  fetchedAt: string;
}
```

### Story

```ts
interface SocialStory {
  platform: 'instagram';
  id: string;
  userId: string;
  mediaType: 'photo' | 'video';
  mediaUrls: string[];
  takenAt: string;
  expiringAt: string;
  isPaidPartnership: boolean;
  isCommercial: boolean;
  hasCtaSticker: boolean;
  mentions: string[]; // who the story tags
  r2Key: string | null;
  fetchedAt: string;
}
```

### Sponsorship and tagging signals

The scraper records explicit flags:

| Signal              | Post          | Story      |
| ------------------- | ------------- | ---------- |
| `isPaidPartnership` | yes           | yes        |
| `isCommercial`      | yes           | yes        |
| `hasCtaSticker`     | no            | yes        |
| tagged users        | `taggedUsers` | `mentions` |

The card shows a badge for each flag.
Known handles in the tagged list map to entities.
This maps a promo to a brand or a shop.
This is a loose connection.
Start: show the badge in the card only.
The dotted graph edge comes later.

### Scraper endpoints

- `/user_info?username=` - resolve id and name, only when id is missing
- `/medias_v2?user_id&batch_size=30` - new posts
- `/stories?user_id` - active stories, media downloaded at once

Broad tagging monitoring is not used.
The endpoint `/user_tagged` is not part of the plan.
Like and comment counts are not stored.
They change over time and add little on the fetch day.

### Plans and budget

Provider: `instagram-scraper2` on RapidAPI.

| Plan  | Cost    | Daily requests |
| ----- | ------- | -------------- |
| BASIC | $0      | 10             |
| PRO   | $5/mo   | 200            |
| ULTRA | $20/mo  | 1000           |
| MEGA  | $100/mo | 6000           |

Targets: hdrey_pl, divesmed_pl, forcerofficial, karolina_pisarek.
About 3 requests per target per day.
About 12 requests per day in total.
PRO is the plan for the cron. Not now.

### R2 layout

```
social/instagram/{handle}/{postId}/media-{n}.{ext}
social/instagram/{handle}/stories/{storyId}/media-{n}.{ext}
```

Media urls are signed and expire.
Download to R2 the same day.

Metadata goes to D1. Media goes to R2.
Compression is not decided yet.

Handles for the scraper:

| Target           | Instagram        | Facebook        |
| ---------------- | ---------------- | --------------- |
| hdrey-group      | hdrey_pl         | hdreypl         |
| dives-med        | divesmed_pl      | divesmedpolska  |
| forcer           | forcerofficial   | 61569223094545  |
| karolina-pisarek | karolina_pisarek | 100044181591844 |

## Meta Ads model

The scraper reads the public Meta Ads Library by page id.

```ts
interface MetaAd {
  adId: string; // Library ID
  pageId: string; // Meta Ads Library page id
  status: 'active' | 'inactive';
  startDate: string;
  endDate: string | null;
  title: string;
  link: string;
  targeting: {
    countries: string[];
    minAge: number | null;
    maxAge: number | null;
    genders: string[]; // women, men, unknown
  };
  reach: number | null; // estimated EU reach
  impressions: number | null; // if the API returns it
  demographics: DemographicRow[];
}

interface DemographicRow {
  country: string;
  age: string; // '18-24', '65+', ...
  gender: string;
  reach: number;
}
```

The real example for Forcer confirms the fields:

- Library ID: 1423252556186034
- title: Forcer New Collection
- link: https://forcer.pl/
- status: inactive
- dates: 2026-02-12 to 2026-02-16
- targeting: Poland, 24-65+, Women
- EU reach: 4303
- demographic breakdown by age and gender

The real example for Hdrey confirms the fields:

- Library ID: 900543986437708
- title: HDRÈY - Realne efekty, na które czekałaś
- link: https://hdrey.com/
- status: active
- start: 2026-07-29
- targeting: Poland, 18-65+, all genders
- EU reach: 26731
- demographic breakdown by age and gender

Active Hdrey ads on 2026-08-30 (Library ID, start):

- 900543986437708, 2026-07-29
- 1710898153321855, 2026-08-28
- 1083317564646124, 2026-08-24
- 1448489707084101, 2026-08-04
- 1963157644366259, 2026-07-14
- 1053230954229649, 2026-08-25 (video)
- 26531022316518099, 2026-04-22

## Meta Ads API access

The `ads_archive` endpoint needs a valid token.
The token from the pilot is a user token for Chris Blaszczyk.
The token works for `/me`.
The app behind the token has no Ads Library permission yet.
The API returns error code 10, subcode 2332002.
Enable the app at facebook.com/ads/library/api.
Then store the token as the secret `META_AD_TOKEN`.
Never put the token in the repository.

The endpoint needs the parameter `ad_reached_countries`.
The older `country` parameter alone is not enough.

## Cost estimation

The CPM is a range, not one number.
The range is realistic, not exact.
It is estimated per market, industry, and platform.
It is filled by hand in advance.
An entity can override the range.

```ts
interface CpmRule {
  market: string; // 'PL' | 'EU'
  industry: string; // 'health-beauty' | 'fashion'
  platform: string; // 'instagram' | 'facebook' | 'tiktok'
  range: CpmRange; // PLN per 1000
}

interface CpmConfig {
  rules: CpmRule[]; // global config
  defaultRange: CpmRange; // fallback
}
```

The system knows units sold from the daily stats.
The system knows reach or impressions from the ads.
The range gives a low and a high estimate.

```
low  = entity.cpmOverride.min  or rule.range.min  or defaultRange.min
high = entity.cpmOverride.max  or rule.range.max  or defaultRange.max
costLow  = impressions / 1000 * low
costHigh = impressions / 1000 * high
cpaLow   = costLow / units_sold
cpaHigh  = costHigh / units_sold
```

The shop page shows active campaigns and the estimated CPA range.

### CPM sources for Poland

Realistic Meta CPM for Poland, health and beauty:
15 to 30 PLN per 1000 impressions.

Sources:

- Cyrek Digital, Poland 2025: average FB and IG CPM 35-37 PLN.
  https://cyrekdigital.com/pl/baza-wiedzy/sredni-koszt-cpm/
- Divloy, Poland 2025: CPM about 37 PLN.
  https://divloy.pl/blog/ile-kosztuje-reklama-na-facebooku-cena-kampanii-meta-ads/
- Socialelite, Polish e-commerce 2024: CPM 10-30 PLN.
  https://socialelite.pl/blog/ile-kosztuje-reklama-na-facebooku-i-instagramie/
- AdCulator, country table 2026: Poland about 5.55 USD.
  https://adculator.com/benchmarks/facebook-cpm-by-country/
- Trymesha, beauty 2025: about 14 USD globally.
  https://trymesha.com/benchmark/facebook/cpm-beauty/

The chosen range for the pilot is 15-30 PLN.
The range is safe and realistic for Meta.

## Open questions

1. Meta Ads page id for dives-med.
   Collected by hand. Hdrey has it now.
2. The co-owner role. Comes later.
3. The manual link between a social post and a relation.
   Added by hand later if needed.
4. The app behind the Meta token needs Ads Library permission.
   See the section `Meta Ads API access`.
5. The CPM rule for hdrey.
   Market PL, industry health/beauty, platforms IG and FB.
   No value yet. Use the default range 15-30 until we set one.
6. The Facebook posts and stories provider.
   Instagram uses `instagram-scraper2`. Facebook is deferred.
7. The RapidAPI PRO plan for the cron. Not bought yet.
