// Google Ads model. See docs/GOOGLE-ADS.md.
// Raw daily data from the Ads Transparency Center BigQuery dataset.
// Analytics is a separate module. It reads this data later.

export interface GoogleSurfaceStat {
  readonly surface: string;
  readonly lo: number | null;
  readonly hi: number | null;
}

export interface GoogleAd {
  readonly creativeId: string;
  readonly advertiserId: string;
  readonly entityId: string | null;
  readonly format: string | null;
  readonly topic: string | null;
  readonly firstShown: string | null;
  readonly lastShown: string | null;
  readonly impLo: number | null;
  readonly impHi: number | null;
  readonly surfaces: readonly GoogleSurfaceStat[];
}

// Core fields change every day: the impression bounds and the last shown date.
export interface GoogleAdCore {
  readonly creativeId: string;
  readonly advertiserId: string;
  readonly entityId: string | null;
  readonly lastShown: string | null;
  readonly impLo: number | null;
  readonly impHi: number | null;
}

// Static fields change once per creative: the format, the topic, first shown.
export interface GoogleAdStatic {
  readonly creativeId: string;
  readonly advertiserId: string;
  readonly entityId: string | null;
  readonly firstShown: string | null;
  readonly format: string | null;
  readonly topic: string | null;
}

// The per-platform split changes slowly.
export interface GoogleAdSurfaces {
  readonly creativeId: string;
  readonly advertiserId: string;
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

// Result for the static and surfaces jobs.
export interface GoogleSyncRunResult {
  readonly shops: number;
  readonly ads: number;
  readonly failures: readonly GoogleRunFailure[];
}
