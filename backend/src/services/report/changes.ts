import { aggregateProductEvents, eventTypeLabel } from '../report-util.ts';
import { summarizeEvents } from '@ecommerce-sniffle/analysis';
import type { StockEvent } from '@ecommerce-sniffle/analysis';
import { emptyState, esc, icon, kpiGrid, money, table, timeline } from '../report-components.ts';
import type { KpiCard, TimelineItem, Tone } from '../report-components.ts';
import { confidenceBadge, productLink, variantCell } from './links.ts';
import { countOrDash, moneyOrDash, pctChange } from './format.ts';
import type { DailyPoint } from '../storage.ts';

function changedTable(events: readonly StockEvent[], urlMap: Map<string, string>, platform: string): string {
  const groups = aggregateProductEvents(events);
  const rows: string[] = [];
  for (const group of groups) {
    for (const event of group.variants) {
      const fromQty = event.from === null ? '-' : String(event.from.quantity);
      const toQty = event.to === null ? '-' : String(event.to.quantity);
      const price = event.to === null || event.to.price === null ? '-' : money(event.to.price);
      rows.push(`<tr data-type="${esc(event.type)}">
  <td>${productLink(urlMap, group.productId)}</td>
  <td>${variantCell(urlMap, group.productId, event.variantId, platform)}</td>
  <td>${esc(eventTypeLabel(event.type))}</td>
  <td>${esc(fromQty)} → ${esc(toQty)}</td>
  <td>${esc(price)}</td>
  <td>${confidenceBadge(event.confidence)}</td>
</tr>`);
    }
  }
  const visible = rows.slice(0, 50);
  const more =
    rows.length <= 50
      ? ''
      : `<p class="text-secondary fs-6 p-2 mb-0">Pokazano ${visible.length} z ${rows.length} zmian. Użyj filtra typu lub wybierz inny dzień.</p>`;
  const body = `${visible.join('')}${more}`;
  return `<div class="reveal-group">${table(['produkt', 'wariant', 'typ', 'ilość', 'cena', 'pewność'], body)}</div>`;
}

export function renderChangesWindows(
  day: string,
  morning: readonly StockEvent[],
  evening: readonly StockEvent[],
  urlMap: Map<string, string>,
  platform: string,
  maxQuantity: number
): string {
  const windows = [
    { key: 'morning', label: 'Morning 06:00', events: morning },
    { key: 'evening', label: 'Evening 18:00', events: evening },
  ];
  const rows: string[] = [];
  for (const window of windows) {
    const summary = summarizeEvents(window.events, { maxQuantity });
    const detailId = `window-${window.key}`;
    rows.push(`<tr>
  <td class="text-nowrap">${esc(window.label)}</td>
  <td>${summary.sold === 0 ? '--' : summary.sold}</td>
  <td>${moneyOrDash(summary.soldValue)}</td>
  <td>${countOrDash(summary.restocked, '')}</td>
  <td>${countOrDash(summary.priceChanges, '')}</td>
  <td>${summary.suspectCount === 0 ? '--' : esc(summary.suspectCount)}</td>
  <td><button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${detailId}" aria-expanded="false" aria-controls="${detailId}">${icon('chevron-down')}</button></td>
</tr>
<tr><td colspan="7" class="p-0"><div class="collapse window-collapse" id="${detailId}"><div class="p-2">${changedTable(window.events, urlMap, platform)}</div></div></td></tr>`);
  }
  const header = `<thead><tr><th>Snapshot</th><th>Sprzedane</th><th>Przychód</th><th>Dostawione</th><th>Zmiany cen</th><th>Podejrzane</th><th></th></tr></thead>`;
  const tools = `<div class="d-flex gap-2 mb-2">
  <button class="btn btn-sm btn-outline-secondary" type="button" onclick="toggleWindows(true)">rozwiń wszystkie</button>
  <button class="btn btn-sm btn-outline-secondary" type="button" onclick="toggleWindows(false)">zwiń wszystkie</button>
  <select class="form-select form-select-sm w-auto ms-auto" onchange="filterChanges(this)" aria-label="Filtruj po typie">
    <option value="">wszystkie typy</option>
    <option value="sold">sprzedane</option>
    <option value="restock">dostawione</option>
    <option value="soldOut">wyprzedane</option>
    <option value="backInStock">powrót</option>
    <option value="promoStart">promocja</option>
    <option value="productNew">nowy</option>
    <option value="productRemoved">usunięty</option>
  </select>
</div>`;
  const body = rows.join('');
  if (body.trim().length === 0) {
    return `${tools}${emptyState('Brak zmian', `${esc(day)} — w tym dniu nic się nie zmieniło.`)}`;
  }
  return `${tools}<div id="changes-windows"><div class="table-responsive"><table class="table table-vcenter card-table table-hover">${header}<tbody>${body}</tbody></table></div></div>`;
}

export function renderDayComparison(day: string, today: DailyPoint | null, prev: DailyPoint | null): string {
  if (today === null) {
    return emptyState('Brak danych dziennych', `Brak wpisu dla dnia ${esc(day)}.`);
  }
  const kpis: KpiCard[] = [
    {
      label: 'Sprzedane',
      value: `${today.sold} szt`,
      deltaPct: prev === null ? null : pctChange(prev.sold, today.sold),
      icon: 'shopping-cart',
    },
    {
      label: 'Przychód',
      value: money(today.soldValue),
      deltaPct: prev === null ? null : pctChange(prev.soldValue, today.soldValue),
      icon: 'currency-zloty',
    },
    {
      label: 'Dostawione',
      value: countOrDash(today.restocked, 'szt'),
      deltaPct: prev === null ? null : pctChange(prev.restocked, today.restocked),
      icon: 'package',
    },
    {
      label: 'Podejrzane',
      value: `${today.suspect}`,
      deltaPct: null,
      tone: today.suspect > 0 ? 'text-red' : '',
      icon: 'alert-triangle',
    },
  ];
  return `<div class="d-flex align-items-center mb-2"><div class="subheader">Dzień ${esc(day)}</div><span class="ms-auto text-secondary fs-6">porównanie z poprzednim dniem</span></div>${kpiGrid(kpis)}`;
}

export function renderTimeline(
  day: string,
  morning: readonly StockEvent[],
  evening: readonly StockEvent[],
  urlMap: Map<string, string>
): string {
  const items: TimelineItem[] = [];
  const windows: Array<[string, readonly StockEvent[]]> = [
    ['Morning', morning],
    ['Evening', evening],
  ];
  for (const [label, events] of windows) {
    const groups = aggregateProductEvents(events);
    for (const group of groups) {
      for (const event of group.variants) {
        const text = `${productLink(urlMap, group.productId)} — ${esc(eventTypeLabel(event.type))}${event.units > 0 ? ` · ${event.units} szt` : ''}`;
        const tone: Tone =
          event.type === 'restock' || event.type === 'backInStock'
            ? 'green'
            : event.type === 'sold' || event.type === 'soldOut'
              ? 'red'
              : 'blue';
        items.push({ time: label, text, tone });
      }
    }
  }
  if (items.length === 0) {
    return emptyState('Brak zdarzeń', `Dnia ${esc(day)} nie było żadnych zdarzeń.`);
  }
  const limited = items.slice(0, 40);
  return timeline(limited);
}
