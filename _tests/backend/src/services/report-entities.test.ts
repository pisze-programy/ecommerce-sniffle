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
        googleAdvertiserId: null,
        cpmOverride: null,

        logoKey: null,

        bgKey: null,
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
        googleAdvertiserId: null,
        cpmOverride: null,

        logoKey: null,

        bgKey: null,
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
        googleAdvertiserId: null,
        cpmOverride: null,

        logoKey: null,

        bgKey: null,
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
        googleAdvertiserId: null,
        cpmOverride: null,

        logoKey: null,

        bgKey: null,
      },
    ],
    persons: [
      { id: 'rafal', name: 'Rafał Afanasjef', linkedinUrl: 'https://linkedin/rafal', avatarKey: null, socials: [] },
      {
        id: 'karolina',
        name: 'Karolina Pisarek',
        linkedinUrl: null,
        avatarKey: null,
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

  it('renders the logo, the background and the avatars from media', () => {
    const data = store();
    const entities = data.entities.map((entity) =>
      entity.id === 'hdrey-group'
        ? { ...entity, logoKey: 'entities/hdrey-group/logo.png', bgKey: 'entities/hdrey-group/bg.png' }
        : entity
    );
    const persons = data.persons.map((person) =>
      person.id === 'rafal' ? { ...person, avatarKey: 'persons/rafal/avatar.png' } : person
    );
    const html = renderEntityCard({ ...data, entities, persons }, 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('/media/entities/hdrey-group/logo.png');
    expect(html).toContain('/media/entities/hdrey-group/bg.png');
    expect(html).toContain('/media/persons/rafal/avatar.png');
  });

  it('renders the meta ads library link when a page id exists', () => {
    const data = store();
    const entities = data.entities.map((entity) =>
      entity.id === 'hdrey-group' ? { ...entity, metaPageId: '880134425337750' } : entity
    );
    const html = renderEntityCard({ ...data, entities }, 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('Reklamy Meta');
    expect(html).toContain('view_all_page_id=880134425337750');
  });

  it('renders no meta ads link without a page id', () => {
    const html = renderEntityCard(store(), 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).not.toContain('Reklamy Meta');
  });

  it('renders a related brand that is a tracked shop as a link', () => {
    const data = store();
    const entityRelations = [
      {
        fromEntityId: 'hdrey-group',
        toEntityId: 'dives-med',
        type: 'related' as const,
        label: 'marki powiązane',
        from: null,
        to: null,
      },
    ];
    const html = renderEntityCard({ ...data, entityRelations }, 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('Marki powiązane');
    expect(html).toContain('/shop/divesmed');
    expect(html).toContain('Dives Med');
  });

  it('renders a related brand without a shop as a badge', () => {
    const data = store();
    const entityRelations = [
      {
        fromEntityId: 'hdrey-group',
        toEntityId: 'infini',
        type: 'related' as const,
        label: 'marki powiązane',
        from: null,
        to: null,
      },
    ];
    const html = renderEntityCard({ ...data, entityRelations }, 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('Marki powiązane');
    expect(html).toContain('INFINI');
    expect(html).not.toContain('/shop/infini');
  });

  it('renders the relation when the entity is on the to side', () => {
    const data = store();
    const entityRelations = [
      {
        fromEntityId: 'forcer',
        toEntityId: 'hdrey-group',
        type: 'related' as const,
        label: 'marki powiązane',
        from: null,
        to: null,
      },
    ];
    const html = renderEntityCard({ ...data, entityRelations }, 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).toContain('Marki powiązane');
    expect(html).toContain('/shop/forcer');
  });

  it('renders no related brands section without relations', () => {
    const html = renderEntityCard(store(), 'hdrey-group', shops(), '2026-08-30', null);
    expect(html).not.toContain('Marki powiązane');
  });
});
