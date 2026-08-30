// Entity graph types: companies, persons, relations, social links.
// See docs/ENTITIES.md. The data lives in D1. The storage layer builds
// an EntityStore. This file only defines the shape.

export type EntityKind = 'company' | 'soleTrader' | 'personActivity' | 'brand' | 'foundation';

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube';

export type PersonRole = 'owner' | 'ambassador' | 'firm';

// The display label for a role. The role is the single source of truth.
// The stored label is never read. This prevents label drift.
export const ROLE_LABELS: Record<PersonRole, string> = {
  owner: 'Właściciel',
  ambassador: 'Ambasador',
  firm: 'Firma',
};

export type EntityRelationType = 'collaboration' | 'related' | 'partner' | 'supplier';

export interface CpmRange {
  readonly min: number;
  readonly max: number;
}

export interface SocialLink {
  readonly platform: SocialPlatform;
  readonly handle: string;
  readonly url: string;
}

export interface Entity {
  readonly id: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly krs: string | null;
  readonly regon: string | null;
  readonly nip: string | null;
  readonly bizraportUrl: string | null;
  readonly socials: readonly SocialLink[];
  readonly metaPageId: string | null;
  readonly cpmOverride: CpmRange | null;
  readonly logoKey: string | null;
  readonly bgKey: string | null;
}

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly linkedinUrl: string | null;
  readonly avatarKey: string | null;
  readonly socials: readonly SocialLink[];
}

// A relation with dates keeps history. An end date does not delete the
// relation. The role is a fixed type. The display label comes from the
// role type, not from stored text.
export interface PersonRelation {
  readonly personId: string;
  readonly entityId: string;
  readonly role: PersonRole;
  readonly from: string | null;
  readonly to: string | null;
}

export interface EntityRelation {
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly type: EntityRelationType;
  readonly label: string;
  readonly from: string | null;
  readonly to: string | null;
}

export interface EntityFinancials {
  readonly entityId: string;
  readonly year: number | null;
  readonly assets: number | null;
  readonly revenue: number | null;
  readonly netProfit: number | null;
  readonly valuation: number | null;
  readonly fetchedAt: string;
}

export interface EntityStore {
  readonly entities: readonly Entity[];
  readonly persons: readonly Person[];
  readonly personRelations: readonly PersonRelation[];
  readonly entityRelations: readonly EntityRelation[];
}

export function findEntity(store: EntityStore, id: string): Entity | null {
  const found = store.entities.find((entry) => entry.id === id);
  return found === undefined ? null : found;
}

export function findPerson(store: EntityStore, id: string): Person | null {
  const found = store.persons.find((entry) => entry.id === id);
  return found === undefined ? null : found;
}

// All IG handles that the social scraper tracks.
export interface SocialTarget {
  readonly platform: 'instagram';
  readonly handle: string;
  readonly entityId: string | null;
  readonly personId: string | null;
}

export function socialTargets(store: EntityStore): readonly SocialTarget[] {
  const targets: SocialTarget[] = [];
  for (const entity of store.entities) {
    for (const link of entity.socials) {
      if (link.platform === 'instagram') {
        targets.push({ platform: 'instagram', handle: link.handle, entityId: entity.id, personId: null });
      }
    }
  }
  for (const person of store.persons) {
    for (const link of person.socials) {
      if (link.platform === 'instagram') {
        targets.push({ platform: 'instagram', handle: link.handle, entityId: null, personId: person.id });
      }
    }
  }
  return targets;
}
