// Meta Ads model. See docs/META-ADS.md.
// Raw daily data from the Meta Ad Library API.
// Analytics is a separate module. It reads this data later.

export interface ReachLocation {
  readonly key: string;
  readonly value: number;
}

export interface ReachRow {
  readonly country: string;
  readonly age_gender_breakdowns: readonly AgeGenderRow[];
}

export interface AgeGenderRow {
  readonly age_range: string;
  readonly male: number;
  readonly female: number;
  readonly unknown: number;
}

export interface TargetLocation {
  readonly name: string;
  readonly num_obfuscated: number;
  readonly type: string;
  readonly excluded: boolean;
}

export interface BeneficiaryPayer {
  readonly payer: string;
  readonly beneficiary: string;
  readonly current: boolean;
}

export interface MetaAd {
  readonly adArchiveId: string;
  readonly pageId: string;
  readonly entityId: string | null;
  readonly adCreationTime: string | null;
  readonly startDate: string | null;
  readonly stopDate: string | null;
  readonly creativeBody: readonly string[];
  readonly linkTitle: readonly string[];
  readonly linkCaption: readonly string[];
  readonly linkDescription: readonly string[];
  readonly publisherPlatforms: readonly string[];
  readonly languages: readonly string[];
  readonly euTotalReach: number | null;
  readonly reachByLocation: readonly ReachLocation[];
  readonly reachBreakdown: readonly ReachRow[];
  readonly targetAges: readonly string[];
  readonly targetGender: string | null;
  readonly targetLocations: readonly TargetLocation[];
  readonly beneficiaryPayers: readonly BeneficiaryPayer[];
  readonly creativeHash: string;
}

export interface MetaAdDay {
  readonly day: string;
  readonly adArchiveId: string;
  readonly pageId: string;
  readonly euTotalReach: number;
}

export interface MetaRunFailure {
  readonly pageId: string;
  readonly reason: string;
}

export interface MetaAdRunResult {
  readonly shops: number;
  readonly ads: number;
  readonly daysWritten: number;
  readonly ended: number;
  readonly failures: readonly MetaRunFailure[];
}
