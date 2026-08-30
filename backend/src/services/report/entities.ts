// Renders the entity sections: Podmiot (identity) and Powiązania (relations).
// No visual graph. See docs/ENTITIES.md.

import type { Entity, EntityFinancials, EntityStore, Person, PersonRelation } from '../../entities.ts';
import { findEntity, findPerson, ROLE_LABELS } from '../../entities.ts';
import { badge, card, datagrid, emptyState, esc, icon } from '../report-components.ts';

export interface EntityShopLink {
  readonly shopId: string;
  readonly domain: string;
}

function isActive(relation: PersonRelation, today: string): boolean {
  if (relation.to !== null && relation.to < today) {
    return false;
  }
  if (relation.from !== null && relation.from > today) {
    return false;
  }
  return true;
}

function fmtRange(from: string | null, to: string | null): string {
  if (from === null && to === null) {
    return '';
  }
  return `${from === null ? '?' : from} → ${to === null ? 'teraz' : to}`;
}

function kindLabel(kind: Entity['kind']): string {
  switch (kind) {
    case 'company':
      return 'Spółka';
    case 'soleTrader':
      return 'JDG';
    case 'personActivity':
      return 'Działalność';
    case 'brand':
      return 'Marka';
    case 'foundation':
      return 'Fundacja';
  }
}

function socialButtons(socials: readonly { platform: string; url: string }[]): string {
  return socials
    .map((social) => {
      const iconName =
        social.platform === 'instagram'
          ? 'brand-instagram'
          : social.platform === 'facebook'
            ? 'brand-facebook'
            : social.platform === 'linkedin'
              ? 'brand-linkedin'
              : social.platform === 'youtube'
                ? 'brand-youtube'
                : social.platform === 'tiktok'
                  ? 'brand-tiktok'
                  : 'link';
      return `<a class="btn btn-sm btn-outline-secondary" href="${esc(social.url)}" target="_blank" rel="noopener">${icon(iconName)} ${esc(social.platform)}</a>`;
    })
    .join('');
}

function otherConnections(
  store: EntityStore,
  person: Person,
  entityId: string,
  shops: ReadonlyMap<string, EntityShopLink>
): readonly string[] {
  const links: string[] = [];
  for (const relation of store.personRelations.filter(
    (entry) => entry.personId === person.id && entry.entityId !== entityId
  )) {
    const label = ROLE_LABELS[relation.role];
    const shop = shops.get(relation.entityId);
    if (shop !== undefined) {
      links.push(
        `<a class="btn btn-sm btn-outline-secondary" href="/shop/${esc(shop.shopId)}">${icon('building-store')} ${esc(shop.shopId)} (${esc(label)})</a>`
      );
    } else {
      const target = findEntity(store, relation.entityId);
      const name = target === null ? relation.entityId : target.name;
      links.push(`<span class="badge bg-secondary">${esc(name)} (${esc(label)})</span>`);
    }
  }
  return links;
}

function personBlock(
  store: EntityStore,
  person: Person,
  relations: readonly PersonRelation[],
  entityId: string,
  shops: ReadonlyMap<string, EntityShopLink>,
  today: string
): string {
  const roleBadges = relations
    .map((relation) => {
      const tone = isActive(relation, today) ? 'green' : 'gray';
      const range = fmtRange(relation.from, relation.to);
      const text = range === '' ? ROLE_LABELS[relation.role] : `${ROLE_LABELS[relation.role]} (${range})`;
      return badge(text, tone);
    })
    .join(' ');
  const linkedin =
    person.linkedinUrl === null
      ? ''
      : `<a class="btn btn-sm btn-outline-secondary" href="${esc(person.linkedinUrl)}" target="_blank" rel="noopener">${icon('brand-linkedin')} LinkedIn</a>`;
  const avatar =
    person.avatarKey === null
      ? ''
      : `<img src="/media/${esc(person.avatarKey)}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:50%;" class="me-2">`;
  const other = otherConnections(store, person, entityId, shops);
  const otherRow = other.length === 0 ? '' : `<div class="mt-1 d-flex flex-wrap gap-1">${other.join('')}</div>`;
  return `<div class="col-6 col-lg-3 d-flex"><div class="card card-sm h-100 w-100"><div class="card-body">
  <div class="fw-semibold d-flex align-items-center">${avatar}${esc(person.name)}</div>
  <div class="mt-1 d-flex flex-wrap gap-1">${roleBadges}</div>
  <div class="mt-1 d-flex flex-wrap gap-1">${linkedin}${socialButtons(person.socials)}</div>
  ${otherRow}
</div></div></div>`;
}

function renderFinancials(financials: EntityFinancials): string {
  const tile = (label: string, value: number | null): string => {
    if (value === null) {
      return '';
    }
    const mln = value / 1_000_000;
    const display =
      Math.abs(value) >= 1_000_000
        ? `${mln.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mln zł`
        : `${value.toLocaleString('pl-PL')} zł`;
    return `<div class="col-6 col-lg-3 d-flex"><div class="card card-sm h-100 w-100"><div class="card-body"><div class="text-secondary text-uppercase fs-6">${esc(label)}</div><div class="h3 mb-0">${esc(display)}</div></div></div></div>`;
  };
  return `<div class="row row-cards mt-3">${tile('aktywa', financials.assets)}${tile('przychód', financials.revenue)}${tile('zysk', financials.netProfit)}${tile('wartość firmy', financials.valuation)}</div>
<div class="text-end text-secondary fs-6 mt-1">Dane z Bizraport</div>`;
}

function metaAdsLibraryUrl(pageId: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data%5Bdirection%5D=desc&sort_data%5Bmode%5D=total_impressions&view_all_page_id=${pageId}`;
}

function entityImageHeader(entity: Entity): string {
  const logo =
    entity.logoKey === null
      ? ''
      : `<img src="/media/${esc(entity.logoKey)}" alt="logo" style="width:56px;height:56px;object-fit:cover;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.25);">`;
  if (entity.bgKey !== null) {
    return `<div style="position:relative;height:140px;background-image:url('/media/${esc(entity.bgKey)}');background-size:cover;background-position:center;border-radius:12px;" class="mb-2"><div class="position-absolute bottom-0 start-0 m-2">${logo}</div></div>`;
  }
  if (entity.logoKey !== null) {
    return `<div class="mb-2">${logo}</div>`;
  }
  return '';
}

function renderPodmiot(entity: Entity, financials: EntityFinancials | null): string {
  const items: { title: string; content: string }[] = [
    { title: 'Podmiot', content: entity.name },
    ...(entity.krs === null ? [] : [{ title: 'KRS', content: entity.krs }]),
    ...(entity.regon === null ? [] : [{ title: 'REGON', content: entity.regon }]),
    ...(entity.nip === null ? [] : [{ title: 'NIP', content: entity.nip }]),
    { title: 'Forma', content: kindLabel(entity.kind) },
  ];
  const links: string[] = [];
  if (entity.bizraportUrl !== null) {
    links.push(
      `<a class="btn btn-sm btn-outline-secondary" href="${esc(entity.bizraportUrl)}" target="_blank" rel="noopener">${icon('building')} Bizraport</a>`
    );
  }
  if (entity.metaPageId !== null) {
    links.push(
      `<a class="btn btn-sm btn-outline-secondary" href="${esc(metaAdsLibraryUrl(entity.metaPageId))}" target="_blank" rel="noopener">${icon('ad-2')} Reklamy Meta</a>`
    );
  }
  links.push(socialButtons(entity.socials));
  return card({
    title: 'Podmiot',
    body: `${entityImageHeader(entity)}${datagrid(items)}<div class="mt-2 d-flex flex-wrap gap-1">${links.join('')}</div>${
      financials === null ? '' : renderFinancials(financials)
    }`,
    collapsed: true,
    open: true,
  });
}

function renderRelations(
  store: EntityStore,
  entityId: string,
  shops: ReadonlyMap<string, EntityShopLink>,
  today: string
): string {
  const relations = store.personRelations.filter((relation) => relation.entityId === entityId);
  const personIds = [...new Set(relations.map((relation) => relation.personId))];
  const persons = personIds.map((id) => findPerson(store, id)).filter((person): person is Person => person !== null);

  if (persons.length === 0) {
    return card({
      title: 'Powiązania',
      body: emptyState('Brak powiązań', 'Nie znaleziono relacji dla tego podmiotu.'),
      collapsed: true,
    });
  }

  const personsSection =
    `<div class="subheader mt-3 mb-1">Osoby</div><div class="row row-cards">` +
    persons
      .map((person) =>
        personBlock(
          store,
          person,
          relations.filter((entry) => entry.personId === person.id),
          entityId,
          shops,
          today
        )
      )
      .join('') +
    `</div>`;
  return card({
    title: 'Powiązania',
    body: personsSection,
    collapsed: true,
  });
}

export function renderEntityCard(
  store: EntityStore,
  entityId: string,
  shops: ReadonlyMap<string, EntityShopLink>,
  today: string,
  financials: EntityFinancials | null
): string {
  const entity = findEntity(store, entityId);
  if (entity === null) {
    return '';
  }
  return renderPodmiot(entity, financials) + renderRelations(store, entityId, shops, today);
}
