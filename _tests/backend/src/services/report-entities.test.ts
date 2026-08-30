import { describe, expect, it } from 'vitest';
import type { EntityStore } from '../../../../backend/src/entities.ts';
import { renderEntityCard } from '../../../../backend/src/services/report/entities.ts';
import type { EntityShopLink } from '../../../../backend/src/services/report/entities.ts';

function store(): EntityStore {
  return {
    entities: [
      {
        id: 'hdrey-group',
        name: 'Hdrey Group',
        kind: 'company',
        krs: '0000683399',
        regon: null,
        nip: null,
        bizraportUrl: 'https://bizraport/hdrey',
        socials: [{ platform: 'instagram', handle: 'hdrey_pl', url: 'https://ig/hdrey_pl' }],
        metaPageId: null,
        cpmOverride: null,
      },
      {
        id: 'dives-med',
        name: 'Dives Med',
        kind: 'company',
        krs: null,
        regon: null,
        nip: null,
        bizraportUrl: null,
        socials: [],
        metaPageId: null,
        cpmOverride: null,
      },
      {
        id: 'forcer',
        name: 'Forcer',
        kind: 'company',
        krs: null,
        regon: null,
        nip: null,
        bizraportUrl: null,
        socials: [],
        metaPageId: null,
        cpmOverride: null,
      },
      {
        id: 'infini',
        name: 'INFINI',
        kind: 'brand',
        krs: null,
        regon: null,
        nip: null,
        bizraportUrl: null,
        socials: [],
        metaPageId: null,
        cpmOverride: null,
      },
    ],
    persons: [
      { id: 'rafal', name: 'Rafał Afanasjef', linkedinUrl: 'https://linkedin/rafal', socials: [] },
      {
        id: 'karolina',
        name: 'Karolina Pisarek',
        linkedinUrl: null,
        socials: [{ platform: 'instagram', handle: 'karolina_pisarek', url: 'https://ig/karolina' }],
      },
    ],
    personRelations: [
      { personId: 'rafal', entityId: 'hdrey-group', role: 'owner', from: null, to: null },
      { personId: 'rafal', entityId: 'dives-med', role: 'owner', from: null, to: null },
      { personId: 'rafal', entityId: 'infini', role: 'owner', from: null, to: null },
      { personId: 'karolina', entityId: 'hdrey-group', role: 'ambassador', from: null, to: null },
      { personId: 'karolina', entityId: 'hdrey-group', role: 'ambassador', from: null, to: null },
      { personId: 'karolina', entityId: 'forcer', role: 'owner', from: null, to: null },
    ],
    entityRelations: [],
  };
}

function shops(): ReadonlyMap<string, EntityShopLink> {
  const map = new Map<string, EntityShopLink>();
  map.set('dives-med', { shopId: 'divesmed', domain: 'divesmed.pl' });
  map.set('forcer', { shopId: 'forcer', domain: 'forcer.pl' });
  return map;
}

describe('renderEntityCard', () => {
  it('renders the entity identity and the relations', () => {
    const html = renderEntityCard(store(), 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('Podmiot');
    expect(html).toContain('Powiązania');
    expect(html).toContain('Hdrey Group');
    expect(html).toContain('Bizraport');
    expect(html).toContain('Właściciel');
    expect(html).toContain('Ambasador');
    expect(html).toContain('/shop/divesmed');
    expect(html).toContain('/shop/forcer');
    expect(html).not.toContain('<svg');
  });

  it('marks a past relation as faded', () => {
    const past = store();
    const current = past.personRelations.map((relation) =>
      relation.personId === 'karolina' && relation.role === 'ambassador' ? { ...relation, to: '2026-01-01' } : relation
    );
    const html = renderEntityCard({ ...past, personRelations: current }, 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('bg-secondary');
  });

  it('renders nothing for an unknown entity', () => {
    expect(renderEntityCard(store(), 'unknown', shops(), '2026-08-30', null)).toBe('');
  });

  it('renders the financial tiles and the bizraport caption', () => {
    const financials = {
      entityId: 'hdrey-group',
      year: 2025,
      assets: 16900000,
      revenue: 134500000,
      netProfit: -3010000,
      valuation: 89700000,
      fetchedAt: '2026-08-30T00:00:00.000Z',
    };
    const html = renderEntityCard(store(), 'hdrey-group', shops(), '2026-08-30', financials);
    expect(html).toContain('aktywa');
    expect(html).toContain('przychód');
    expect(html).toContain('zysk');
    expect(html).toContain('wartość firmy');
    expect(html).toContain('16,9 mln zł');
    expect(html).toContain('-3,0 mln zł');
    expect(html).toContain('Dane z Bizraport');
  });
});
