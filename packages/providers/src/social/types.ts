// Social model. See docs/INSTAGRAM.md and docs/FACEBOOK.md.
// The instagram source is inflact.com. The facebook source is the public
// page and a story viewer. The module stores a poster image, not a video.

export type SocialPlatform = 'instagram' | 'facebook';

export interface SocialProfile {
  readonly platform: SocialPlatform;
  readonly userId: string;
  readonly handle: string;
  readonly fullName: string | null;
}

export interface SocialPost {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly userId: string;
  readonly shortcode: string;
  readonly permalink: string;
  readonly type: 'photo' | 'video' | 'carousel';
  readonly isReel: boolean;
  readonly takenAt: string;
  readonly caption: string | null;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly videoViews: number | null;
  readonly posterUrl: string | null;
  readonly r2Key: string | null;
  readonly fetchedAt: string;
}

export interface SocialStory {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly userId: string;
  readonly mediaType: 'photo' | 'video';
  readonly isVideo: boolean;
  readonly takenAt: string;
  readonly expiringAt: string;
  readonly posterUrl: string | null;
  readonly r2Key: string | null;
  readonly fetchedAt: string;
}

export interface SocialReel {
  readonly platform: SocialPlatform;
  readonly id: string;
  readonly userId: string;
  readonly shortcode: string;
  readonly permalink: string;
  readonly takenAt: string;
  readonly likeCount: number | null;
  readonly commentCount: number | null;
  readonly playCount: number | null;
  readonly videoViewCount: number | null;
  readonly posterUrl: string | null;
  readonly r2Key: string | null;
  readonly fetchedAt: string;
}

// One row for each profile and each day. The analytics snapshot.
export interface SocialProfileDay {
  readonly platform: SocialPlatform;
  readonly userId: string;
  readonly day: string;
  readonly handle: string;
  readonly followers: number | null;
  readonly uploads: number | null;
  readonly avgLikes: number | null;
  readonly avgComments: number | null;
  readonly engagement: number | null;
  readonly postsPerDay: number | null;
  readonly postsPerWeek: number | null;
  readonly score: number | null;
  // Facebook only. The number of people that talk about the page. The
  // report shows it in the score slot for a facebook row.
  readonly talkingAbout: number | null;
  readonly isVerified: boolean;
  readonly category: string | null;
  readonly adReelPrice: number | null;
  readonly adPostPrice: number | null;
  readonly adStoryPrice: number | null;
  readonly country: string | null;
  readonly keywords: string | null;
  readonly fetchedAt: string;
}

// The full result of one collection run.
export interface SocialPayload {
  readonly profiles: readonly SocialProfile[];
  readonly profileDays: readonly SocialProfileDay[];
  readonly posts: readonly SocialPost[];
  readonly stories: readonly SocialStory[];
  readonly reels: readonly SocialReel[];
}

// A tracked social handle and its owner.
export interface SocialTarget {
  readonly platform: SocialPlatform;
  readonly handle: string;
  readonly ownerKind: 'entity' | 'person';
  readonly ownerId: string;
  // The first stock snapshot day of the owner shop. Null for a person.
  readonly seedDay: string | null;
  // The newest stored post time, in epoch seconds. Null when none is stored.
  readonly sinceEpoch: number | null;
}
