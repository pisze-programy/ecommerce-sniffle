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
  // A line under the card title. It stays visible when the body is collapsed.
  readonly titleNote?: string;
  readonly body: string;
  readonly footer?: string;
  // The body starts collapsed and the header toggles it.
  readonly collapsed?: boolean;
  // A collapsed card that starts expanded.
  readonly open?: boolean;
  // Extra classes for the outer card element.
  readonly className?: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function card(options: CardOptions): string {
  const cls = options.className === undefined ? '' : ` ${options.className}`;
  const titleHtml =
    options.title === undefined
      ? ''
      : options.titleHref === undefined
        ? `<h3 class="card-title">${esc(options.title)}</h3>`
        : `<h3 class="card-title"><a href="${esc(options.titleHref)}">${esc(options.title)}</a></h3>`;
  const subtitleHtml =
    options.subtitle === undefined ? '' : `<div class="card-subtitle ms-auto">${esc(options.subtitle)}</div>`;
  const titleNoteHtml =
    options.titleNote === undefined
      ? ''
      : `<div class="card-subtitle mt-1 text-secondary">${esc(options.titleNote)}</div>`;
  const footer = options.footer === undefined ? '' : `<div class="card-footer">${options.footer}</div>`;
  if (options.collapsed === true) {
    const collapseId = `card-${slug(options.title ?? 'card')}`;
    const open = options.open === true;
    return `<div class="card${cls}">
  <div class="card-header${open ? '' : ' collapsed'}" data-bs-toggle="collapse" data-bs-target="#${collapseId}" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${collapseId}">
    <div class="d-flex align-items-center w-100 gap-2">
      <div class="d-flex flex-column align-items-start">
        ${titleHtml}
        ${titleNoteHtml}
      </div>
      ${subtitleHtml}
      <span class="btn btn-sm btn-outline-secondary ms-auto" aria-hidden="true">${icon('chevron-down')}</span>
    </div>
  </div>
  <div id="${collapseId}" class="collapse${open ? ' show' : ''}">
    <div class="card-body">${options.body}</div>
  </div>
  ${footer}
</div>`;
  }
  const header =
    options.title === undefined && options.subtitle === undefined && options.titleNote === undefined
      ? ''
      : `<div class="card-header"><div class="d-flex align-items-center w-100 gap-2"><div class="d-flex flex-column align-items-start">${titleHtml}${titleNoteHtml}</div>${subtitleHtml}</div></div>`;
  return `<div class="card${cls}">${header}<div class="card-body">${options.body}</div>${footer}</div>`;
}

export interface StatCard {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly cls?: string;
}

export function statGrid(items: readonly StatCard[]): string {
  const cards = items
    .map((item) => {
      const cls = item.cls === undefined ? '' : item.cls;
      const sub = item.sub === undefined ? '' : `<div class="text-secondary fs-6">${esc(item.sub)}</div>`;
      return `<div class="col-6 col-md-4 col-xl-3 d-flex"><div class="card card-sm h-100 w-100"><div class="card-body"><div class="text-secondary text-uppercase fs-6">${esc(item.label)}</div><div class="h3 mb-0 ${esc(cls)}">${esc(item.value)}</div>${sub}</div></div></div>`;
    })
    .join('');
  return `<div class="row row-cards">${cards}</div>`;
}

export function table(headers: readonly string[], rowsHtml: string, className?: string): string {
  const thead = headers.map((header) => `<th>${esc(header)}</th>`).join('');
  const cls = className === undefined ? '' : ` ${className}`;
  return `<div class="table-responsive"><table class="table table-vcenter card-table${cls}"><thead><tr>${thead}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

export interface SortHeader {
  readonly label: string;
  readonly sortType?: 'number';
  readonly metric?: string;
  readonly defaultSort?: 'asc' | 'desc';
}

// A client-sortable table. The inline script in the shell sorts the rows
// on header click and highlights the active column.
export function sortableTable(
  headers: readonly SortHeader[],
  rowsHtml: string,
  className?: string,
  pageSize?: number,
  id?: string
): string {
  const ths = headers
    .map((header) => {
      const type = header.sortType === undefined ? 'text' : header.sortType;
      const metric = header.metric === undefined ? '' : ` data-metric="${esc(header.metric)}"`;
      const def = header.defaultSort === undefined ? '' : ` data-default-sort="${header.defaultSort}"`;
      const align = header.sortType === 'number' ? ' class="text-end"' : '';
      return `<th data-sort-type="${type}"${metric}${def}${align}>${esc(header.label)}<span class="sort-indicators" aria-hidden="true"><span class="sort-asc">▲</span><span class="sort-desc">▼</span></span></th>`;
    })
    .join('');
  const cls = className === undefined ? '' : ` ${className}`;
  const page = pageSize === undefined ? '' : ` data-page-size="${pageSize}"`;
  const tableId = id === undefined ? '' : ` id="${esc(id)}"`;
  return `<div class="table-responsive"><table class="table table-vcenter card-table${cls}"${tableId} data-sortable${page}><thead><tr>${ths}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
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

// A status renders as a check, cross or warning instead of a live dot.
const STATUS_ICON: Record<Tone, string> = {
  green: 'text-green',
  red: 'text-red',
  yellow: 'text-yellow',
  blue: 'text-blue',
  gray: 'text-secondary',
};

const STATUS_ICON_NAME: Record<Tone, string> = {
  green: 'check',
  red: 'x',
  yellow: 'alert-triangle',
  blue: 'info-circle',
  gray: 'minus',
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
          : ` <span class="${STATUS_ICON[item.status]}">${icon(STATUS_ICON_NAME[item.status])}</span>`;
      return `<div class="datagrid-item"><div class="datagrid-title">${esc(item.title)}</div><div class="datagrid-content">${esc(item.content)}${status}</div></div>`;
    })
    .join('');
  return `<div class="datagrid">${blocks}</div>`;
}

export interface TimelineItem {
  // One of '+', '-' or '~'. It colors the change direction next to the
  // product.
  readonly sign: string;
  readonly text: string;
  readonly tone: Tone;
  // A spacer separates two item sections (for example sold from added).
  readonly spacer?: boolean;
}

export interface TimelineGroup {
  readonly label: string;
  readonly items: readonly TimelineItem[];
}

const TONE_TEXT: Record<Tone, string> = {
  green: 'text-green',
  red: 'text-red',
  yellow: 'text-yellow',
  blue: 'text-blue',
  gray: 'text-secondary',
};

// The seed label renders once per group, not once per item. Each item
// shows its sign with a color and its text.
export function timeline(groups: readonly TimelineGroup[]): string {
  if (groups.length === 0) {
    return '';
  }
  const blocks = groups
    .map(
      (group) => `<div class="timeline-group">
  <div class="timeline-group-label">${esc(group.label)}</div>
  ${group.items
    .map((item) =>
      item.spacer === true
        ? '<div class="timeline-spacer"></div>'
        : `<div class="timeline-item">
  <div class="timeline-content">
    <div><span class="fw-bold ${TONE_TEXT[item.tone]}">${esc(item.sign)}</span> ${item.text}</div>
  </div>
</div>`
    )
    .join('')}
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
  return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}
