import { describe, expect, it } from 'vitest';
import {
  accordion,
  alert,
  badge,
  breadcrumb,
  card,
  datagrid,
  emptyState,
  esc,
  icon,
  kpiGrid,
  money,
  statGrid,
  table,
  tabs,
  timeline,
  trendBadge,
} from '../../../../backend/src/services/report-components.ts';

describe('esc', () => {
  it('escapes html metacharacters', () => {
    expect(esc('<script>"&</script>')).toBe('&lt;script&gt;&quot;&amp;&lt;/script&gt;');
  });

  it('renders null and undefined as empty', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('keeps plain values as-is', () => {
    expect(esc('for-ser')).toBe('for-ser');
    expect(esc(7)).toBe('7');
  });
});

describe('card', () => {
  it('renders title, body and footer', () => {
    const html = card({ title: 'Stan', body: '<p>b</p>', footer: '<p>f</p>' });
    expect(html).toContain('card-title');
    expect(html).toContain('card-body');
    expect(html).toContain('card-footer');
  });

  it('renders a bare body when no title is given', () => {
    const html = card({ body: '<p>b</p>' });
    expect(html).not.toContain('card-header');
    expect(html).toContain('card-body');
  });

  it('starts the body collapsed when requested', () => {
    const html = card({ title: 'Oś czasu zdarzeń', body: '<p>b</p>', collapsed: true });
    expect(html).toContain('data-bs-toggle="collapse"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('card-o-czasu-zdarze');
    expect(html).not.toContain('class="collapse show"');
  });

  it('keeps the body visible by default', () => {
    const html = card({ title: 'Zmiany', body: '<p>b</p>' });
    expect(html).not.toContain('data-bs-toggle="collapse"');
  });
});

describe('statGrid', () => {
  it('renders a row of stat cards', () => {
    const html = statGrid([{ label: 'Sprzedane', value: '12' }]);
    expect(html).toContain('row-cards');
    expect(html).toContain('Sprzedane');
    expect(html).toContain('12');
  });

  it('renders the sub-caption under the value', () => {
    const html = statGrid([{ label: 'Stan', value: '8 437 szt', sub: 'dokładnie 8 437' }]);
    expect(html).toContain('dokładnie 8 437');
  });
});

describe('table', () => {
  it('renders escaped headers and body rows', () => {
    const html = table(['produkt', 'ilość'], '<tr><td>a</td><td>1</td></tr>');
    expect(html).toContain('<th>produkt</th>');
    expect(html).toContain('<th>ilość</th>');
    expect(html).toContain('card-table');
    expect(html).toContain('<tr><td>a</td><td>1</td></tr>');
  });
});

describe('alert', () => {
  it('maps the tone to a tabler alert class', () => {
    expect(alert('uwaga', 'yellow')).toContain('alert-warning');
    expect(alert('ok', 'green')).toContain('alert-success');
    expect(alert('błąd', 'red')).toContain('alert-danger');
  });
});

describe('badge', () => {
  it('renders a colored badge', () => {
    expect(badge('countdown', 'yellow')).toContain('bg-yellow');
    expect(badge('ok', 'green')).toContain('bg-green');
  });
});

describe('breadcrumb', () => {
  it('renders links and the active item', () => {
    const html = breadcrumb([{ label: 'raport', href: '/dashboard' }, { label: 'forcer.pl' }]);
    expect(html).toContain('<a href="/dashboard">raport</a>');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('forcer.pl');
  });
});

describe('accordion', () => {
  it('exposes aria-expanded on the toggle button', () => {
    const html = accordion('acc', [
      { id: 'c1', titleHtml: '<a href="/x">p</a>', toggleLabel: 'szczegóły', bodyHtml: 'b', open: true },
    ]);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="c1"');
    expect(html).toContain('accordion-collapse collapse show');
  });

  it('keeps the title outside the toggle button so links stay clickable', () => {
    const html = accordion('acc', [
      { id: 'c1', titleHtml: '<a href="/x">p</a>', toggleLabel: 'szczegóły', bodyHtml: 'b' },
    ]);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('class="btn btn-sm btn-outline-secondary accordion-toggle collapsed');
    expect(html.indexOf('<a href="/x">p</a>')).toBeGreaterThan(-1);
    expect(html.indexOf('<a href="/x">p</a>')).toBeLessThan(html.indexOf('data-bs-target'));
  });
});

describe('tabs', () => {
  it('renders nav links and panes with the active flag', () => {
    const html = tabs('t', [
      { id: 'morning', label: 'Morning', contentHtml: '<p>m</p>', active: true },
      { id: 'evening', label: 'Evening', contentHtml: '<p>e</p>' },
    ]);
    expect(html).toContain('data-bs-toggle="tabs"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('id="t-morning"');
    expect(html).toContain('class="nav-link active"');
  });
});

describe('money', () => {
  it('formats with two decimals, the pl locale and the currency', () => {
    expect(money(3031)).toContain('031,00');
    expect(money(3031)).toContain('zł');
    expect(money(0)).toBe('0,00 zł');
  });
});

describe('icon', () => {
  it('renders a tabler icon', () => {
    expect(icon('package')).toContain('ti ti-package');
  });
});

describe('trendBadge', () => {
  it('renders an up trend in green', () => {
    const html = trendBadge(12);
    expect(html).toContain('▲ 12%');
    expect(html).toContain('bg-green');
  });

  it('renders a down trend in red', () => {
    const html = trendBadge(-4);
    expect(html).toContain('▼ 4%');
    expect(html).toContain('bg-red');
  });

  it('renders a flat trend as gray', () => {
    const html = trendBadge(0);
    expect(html).toContain('0%');
    expect(html).toContain('bg-secondary');
  });

  it('renders nothing for a null delta', () => {
    expect(trendBadge(null)).toBe('');
  });
});

describe('kpiGrid', () => {
  it('renders a row of responsive kpi cards with delta and icon', () => {
    const html = kpiGrid([{ label: 'Wartość', value: '1 000,00', deltaPct: 5, icon: 'package' }]);
    expect(html).toContain('col-sm-6 col-lg-3');
    expect(html).toContain('subheader');
    expect(html).toContain('▲ 5%');
    expect(html).toContain('ti ti-package');
  });
});

describe('datagrid', () => {
  it('renders items with an optional status dot', () => {
    const html = datagrid([{ title: 'Stan', content: '1 000', status: 'green' }]);
    expect(html).toContain('datagrid-item');
    expect(html).toContain('ti-check');
  });
});

describe('timeline', () => {
  it('renders the group label once and the signed items', () => {
    const html = timeline([{ label: 'Morning', items: [{ sign: '+', text: 'Dostawiono 10 szt', tone: 'green' }] }]);
    expect(html).toContain('timeline-group');
    expect(html).toContain('timeline-group-label');
    expect(html).toContain('Morning');
    expect(html).toContain('timeline-item');
    expect(html).toContain('text-green');
    expect(html).toContain('+');
    expect(html).not.toContain('timeline-time');
    expect(html).not.toContain('timeline-icon');
  });

  it('renders a spacer item between sections', () => {
    const html = timeline([
      {
        label: 'Morning',
        items: [
          { sign: '-', text: 'Sprzedano 2 szt', tone: 'red' },
          { sign: '', text: '', tone: 'gray', spacer: true },
          { sign: '+', text: 'Dostawiono 1 szt', tone: 'green' },
        ],
      },
    ]);
    expect(html).toContain('timeline-spacer');
  });

  it('renders nothing for no groups', () => {
    expect(timeline([])).toBe('');
  });
});

describe('emptyState', () => {
  it('renders a tabler empty block', () => {
    const html = emptyState('Brak zmian', 'Nic się nie zmieniło.');
    expect(html).toContain('empty-title');
    expect(html).toContain('Brak zmian');
  });
});
