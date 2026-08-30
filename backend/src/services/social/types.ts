// Social scraper model. See docs/ENTITIES.md.
// Daily data only. No backfill, no history updates.

export interface SocialProfile {
  readonly platform: 'instagram';
  readonly userId: string;
  readonly handle: string;
  readonly fullName: string | null;
}

export interface SocialPost {
  readonly platform: 'instagram';
  readonly id: string;
  readonly userId: string;
  readonly shortcode: string;
  readonly type: 'photo' | 'video' | 'carousel';
  readonly isReel: boolean;
  readonly takenAt: string;
  readonly caption: string | null;
  readonly mediaUrls: readonly string[];
  readonly isPaidPartnership: boolean;
  readonly isCommercial: boolean;
  readonly taggedUsers: readonly string[];
  readonly r2Key: string | null;
  readonly fetchedAt: string;
}

export interface SocialStory {
  readonly platform: 'instagram';
  readonly id: string;
  readonly userId: string;
  readonly mediaType: 'photo' | 'video';
  readonly mediaUrls: readonly string[];
  readonly takenAt: string;
  readonly expiringAt: string;
  readonly isPaidPartnership: boolean;
  readonly isCommercial: boolean;
  readonly hasCtaSticker: boolean;
  readonly mentions: readonly string[];
  readonly r2Key: string | null;
  readonly fetchedAt: string;
}
