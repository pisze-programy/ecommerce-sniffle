export type Tone = 'green' | 'red' | 'yellow' | 'blue' | 'gray';

export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface CardOptions {
  readonly title?: string;
  readonly titleHref?: string;
  readonly subtitle?: string;
  readonly body: string;
  readonly footer?: string;
}

export function card(options: CardOptions): string {
  const titleHtml =
    options.title === undefined
      ? ''
      : options.titleHref === undefined
        ? `<h3 class="card-title">${esc(options.title)}</h3>`
        : `<h3 class="card-title"><a href="${esc(options.titleHref)}">${esc(options.title)}</a></h3>`;
  const header =
    options.title === undefined && options.subtitle === undefined
      ? ''
      : `<div class="card-header">${titleHtml}${options.subtitle === undefined ? '' : `<div class="card-subtitle ms-auto">${esc(options.subtitle)}</div>`}</div>`;
  const footer = options.footer === undefined ? '' : `<div class="card-footer">${options.footer}</div>`;
  return `<div class="card">${header}<div class="card-body">${options.body}</div>${footer}</div>`;
}

export interface StatCard {
  readonly label: string;
  readonly value: string;
  readonly cls?: string;
}

export function statGrid(items: readonly StatCard[]): string {
  const cards = items
    .map((item) => {
      const cls = item.cls === undefined ? '' : item.cls;
      return `<div class="col-6 col-sm-4 col-lg"><div class="card card-sm"><div class="card-body"><div class="text-secondary text-uppercase fs-6">${esc(item.label)}</div><div class="h3 mb-0 ${esc(cls)}">${esc(item.value)}</div></div></div></div>`;
    })
    .join('');
  return `<div class="row row-cards">${cards}</div>`;
}

export function table(headers: readonly string[], rowsHtml: string, className?: string): string {
  const thead = headers.map((header) => `<th>${esc(header)}</th>`).join('');
  const cls = className === undefined ? '' : ` ${className}`;
  return `<div class="table-responsive"><table class="table table-vcenter card-table${cls}"><thead><tr>${thead}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

const TONE_ALERT: Record<Tone, string> = {
  green: 'alert-success',
  red: 'alert-danger',
  yellow: 'alert-warning',
  blue: 'alert-info',
  gray: 'alert-secondary',
};

export function alert(message: string, tone: Tone, title?: string): string {
  const heading = title === undefined ? '' : `<h4 class="alert-title">${esc(title)}</h4>`;
  return `<div class="alert ${TONE_ALERT[tone]}" role="alert">${heading}<div>${message}</div></div>`;
}

const TONE_BADGE: Record<Tone, string> = {
  green: 'bg-green text-green-fg',
  red: 'bg-red text-red-fg',
  yellow: 'bg-yellow text-yellow-fg',
  blue: 'bg-blue text-blue-fg',
  gray: 'bg-secondary text-secondary-fg',
};

export function badge(text: string, tone: Tone): string {
  return `<span class="badge ${TONE_BADGE[tone]}">${esc(text)}</span>`;
}

export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export function breadcrumb(items: readonly BreadcrumbItem[]): string {
  const crumbs = items
    .map((item) => {
      if (item.href === undefined) {
        return `<li class="breadcrumb-item active" aria-current="page">${esc(item.label)}</li>`;
      }
      return `<li class="breadcrumb-item"><a href="${esc(item.href)}">${esc(item.label)}</a></li>`;
    })
    .join('');
  return `<ol class="breadcrumb" aria-label="breadcrumbs">${crumbs}</ol>`;
}

export interface AccordionItem {
  readonly id: string;
  // Clickable content (for example a product link). It sits outside the
  // toggle button, so clicking it opens the target, not the accordion.
  readonly titleHtml: string;
  readonly toggleLabel: string;
  readonly bodyHtml: string;
  readonly open?: boolean;
}

export function accordion(containerId: string, items: readonly AccordionItem[]): string {
  const blocks = items
    .map((item) => {
      const open = item.open === true;
      return `<div class="accordion-item">
  <div class="accordion-header">
    <div class="d-flex align-items-center w-100 py-1">
      <span class="ps-3 pe-2">${item.titleHtml}</span>
      <button class="btn btn-sm btn-outline-secondary accordion-toggle${open ? '' : ' collapsed'} ms-auto me-2" type="button" data-bs-toggle="collapse" data-bs-target="#${esc(item.id)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${esc(item.id)}">${esc(item.toggleLabel)}</button>
    </div>
  </div>
  <div id="${esc(item.id)}" class="accordion-collapse collapse${open ? ' show' : ''}" data-bs-parent="#${esc(containerId)}">
    <div class="accordion-body">${item.bodyHtml}</div>
  </div>
</div>`;
    })
    .join('');
  return `<div class="accordion" id="${esc(containerId)}">${blocks}</div>`;
}

export function emptyState(title: string, subtitle: string): string {
  return `<div class="empty"><div class="empty-icon"><span class="ti ti-info-circle text-secondary"></span></div><p class="empty-title">${esc(title)}</p><p class="empty-subtitle text-secondary">${esc(subtitle)}</p></div>`;
}

export function icon(name: string): string {
  return `<span class="ti ti-${name}"></span>`;
}

const TONE_BG: Record<Tone, string> = {
  green: 'bg-green',
  red: 'bg-red',
  yellow: 'bg-yellow',
  blue: 'bg-blue',
  gray: 'bg-secondary',
};

export function trendBadge(deltaPct: number | null): string {
  if (deltaPct === null) {
    return '';
  }
  if (deltaPct === 0) {
    return badge('0%', 'gray');
  }
  const arrow = deltaPct > 0 ? '▲' : '▼';
  const tone: Tone = deltaPct > 0 ? 'green' : 'red';
  return badge(`${arrow} ${Math.abs(deltaPct).toFixed(0)}%`, tone);
}

export interface KpiCard {
  readonly label: string;
  readonly value: string;
  readonly deltaPct: number | null;
  readonly icon?: string;
  readonly tone?: string;
}

const TONE_STATUS: Record<Tone, string> = {
  green: 'green',
  red: 'red',
  yellow: 'yellow',
  blue: 'blue',
  gray: 'secondary',
};

export function kpiGrid(items: readonly KpiCard[]): string {
  const cards = items
    .map((item) => {
      const valueTone = item.tone === undefined ? '' : item.tone;
      return `<div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body">
  <div class="d-flex align-items-center"><div class="subheader">${esc(item.label)}</div>${item.icon === undefined ? '' : `<span class="ms-auto text-secondary">${icon(item.icon)}</span>`}</div>
  <div class="h1 mb-0 ${esc(valueTone)}">${esc(item.value)}</div>
  <div class="mt-1">${trendBadge(item.deltaPct)}</div>
</div></div></div>`;
    })
    .join('');
  return `<div class="row row-deck row-cards">${cards}</div>`;
}

export interface DataGridItem {
  readonly title: string;
  readonly content: string;
  readonly status?: Tone;
}

export function datagrid(items: readonly DataGridItem[]): string {
  const blocks = items
    .map((item) => {
      const status =
        item.status === undefined
          ? ''
          : ` <span class="status status-${TONE_STATUS[item.status]}"><span class="status-dot"></span></span>`;
      return `<div class="datagrid-item"><div class="datagrid-title">${esc(item.title)}</div><div class="datagrid-content">${esc(item.content)}${status}</div></div>`;
    })
    .join('');
  return `<div class="datagrid">${blocks}</div>`;
}

export interface TimelineItem {
  readonly time: string;
  readonly text: string;
  readonly tone: Tone;
}

export function timeline(items: readonly TimelineItem[]): string {
  if (items.length === 0) {
    return '';
  }
  const blocks = items
    .map(
      (item) => `<div class="timeline-item">
  <div class="timeline-icon ${TONE_BG[item.tone]}">${icon('point')}</div>
  <div class="timeline-content">
    <div class="timeline-time">${esc(item.time)}</div>
    <div>${item.text}</div>
  </div>
</div>`
    )
    .join('');
  return `<div class="timeline">${blocks}</div>`;
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly contentHtml: string;
  readonly active?: boolean;
}

export function tabs(containerId: string, items: readonly TabItem[]): string {
  const nav = items
    .map(
      (item) =>
        `<li class="nav-item" role="presentation"><a href="#${esc(containerId)}-${esc(item.id)}" data-bs-toggle="tab" class="nav-link${item.active === true ? ' active' : ''}" role="tab" aria-selected="${item.active === true ? 'true' : 'false'}">${esc(item.label)}</a></li>`
    )
    .join('');
  const panes = items
    .map(
      (item) =>
        `<div id="${esc(containerId)}-${esc(item.id)}" class="tab-pane${item.active === true ? ' active' : ''}" role="tabpanel">${item.contentHtml}</div>`
    )
    .join('');
  return `<div class="tab-content"><ul class="nav nav-tabs" data-bs-toggle="tabs" role="tablist">${nav}</ul>${panes}</div>`;
}

export function money(amount: number): string {
  return amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
