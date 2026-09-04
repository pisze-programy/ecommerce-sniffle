// Google Ads model. See docs/GOOGLE-ADS.md.
// Raw daily data from the Ads Transparency Center BigQuery dataset.
// Analytics is a separate module. It reads this data later.

export interface GoogleSurfaceStat {
  readonly surface: string;
  readonly lo: number | null;
  readonly hi: number | null;
}

export interface GoogleAudience {
  readonly demographic: string | null;
  readonly geo: string | null;
  readonly contextual: string | null;
  readonly customerLists: string | null;
  readonly topics: string | null;
}

export interface GoogleAd {
  readonly creativeId: string;
  readonly advertiserId: string;
  readonly entityId: string | null;
  readonly disclosedName: string | null;
  readonly format: string | null;
  readonly topic: string | null;
  readonly pageUrl: string | null;
  readonly firstShown: string | null;
  readonly lastShown: string | null;
  readonly impLo: number | null;
  readonly impHi: number | null;
  readonly audience: GoogleAudience;
  readonly surfaces: readonly GoogleSurfaceStat[];
}

export interface GoogleAdDay {
  readonly day: string;
  readonly creativeId: string;
  readonly advertiserId: string;
  readonly impLo: number;
  readonly impHi: number;
}

export interface GoogleRunFailure {
  readonly advertiserId: string;
  readonly reason: string;
}

export interface GoogleAdRunResult {
  readonly shops: number;
  readonly ads: number;
  readonly daysWritten: number;
  readonly ended: number;
  readonly capped: number;
  readonly failures: readonly GoogleRunFailure[];
}
